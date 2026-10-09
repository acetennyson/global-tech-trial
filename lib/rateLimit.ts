import { createHash } from "node:crypto";
import { fail } from "./http";
import { getPool } from "./db/pool";
import { logger } from "./logger";

// Fixed-window rate limiter backed by the `rate_limits` table, so every serverless
// instance shares the same counters. (An in-memory counter would reset per instance.)
//
// Each check is one atomic upsert, so concurrent requests can't both slip under the limit.
// If the database call itself fails, the limiter fails OPEN (logs and allows): a broken
// limiter table should not take login down with it.

export interface RateLimitRule {
  /** What is being counted, e.g. `forgot:ip:1.2.3.4`. Use `keyPart()` for emails. */
  key: string;
  limit: number;
  windowSeconds: number;
}

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

const ALLOWED: RateLimitDecision = { allowed: true };

// Limits, in one place. Tuned for a demo; raise them for real traffic.
export const LIMITS = {
  register: { ip: { limit: 5, windowSeconds: 60 * 60 } },
  login: {
    // counted per (email + ip), so an attacker can't lock a victim out from other IPs
    emailAndIp: { limit: 5, windowSeconds: 15 * 60 },
    ip: { limit: 30, windowSeconds: 15 * 60 },
  },
  forgotPassword: {
    ip: { limit: 10, windowSeconds: 60 * 60 },
    email: { limit: 3, windowSeconds: 60 * 60 },
  },
  newsletterSubscribe: { ip: { limit: 10, windowSeconds: 60 * 60 } },
} as const;

function disabled(): boolean {
  return process.env.RATE_LIMIT_DISABLED === "true";
}

/** Hashes a user-supplied value (an email) so the table never stores it in plain text. */
export function keyPart(value: string): string {
  return createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 32);
}

/**
 * The caller's IP. On Vercel, `x-real-ip` / `x-forwarded-for` are set by the platform and
 * cannot be forged by the client. If you self-host, make sure your proxy overwrites them,
 * otherwise anyone can dodge the limit by spoofing the header.
 */
export function getClientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

// window_start is the start of the current window, computed by the database clock.
const WINDOW_START = `to_timestamp(floor(extract(epoch from now()) / $2::double precision) * $2::double precision)`;
const SECONDS_LEFT = `ceil(extract(epoch from (window_start + make_interval(secs => $2::double precision) - now())))::int`;

async function increment(rule: RateLimitRule): Promise<{ count: number; secondsLeft: number }> {
  const result = await getPool().query<{ count: number; seconds_left: number }>(
    `INSERT INTO rate_limits (key, window_start, count)
     VALUES ($1, ${WINDOW_START}, 1)
     ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count, ${SECONDS_LEFT} AS seconds_left`,
    [rule.key, rule.windowSeconds]
  );
  const row = result.rows[0];
  void cleanupSometimes();
  return { count: Number(row.count), secondsLeft: Math.max(1, row.seconds_left) };
}

async function peek(rule: RateLimitRule): Promise<{ count: number; secondsLeft: number }> {
  const result = await getPool().query<{ count: number; seconds_left: number }>(
    `SELECT count, ${SECONDS_LEFT} AS seconds_left
       FROM rate_limits
      WHERE key = $1 AND window_start = ${WINDOW_START}`,
    [rule.key, rule.windowSeconds]
  );
  const row = result.rows[0];
  return row ? { count: Number(row.count), secondsLeft: Math.max(1, row.seconds_left) } : { count: 0, secondsLeft: 0 };
}

/** Counts this request, then says whether it is within the limit. */
export async function hitRateLimit(rule: RateLimitRule): Promise<RateLimitDecision> {
  if (disabled()) return ALLOWED;
  try {
    const { count, secondsLeft } = await increment(rule);
    return count > rule.limit ? { allowed: false, retryAfterSeconds: secondsLeft } : ALLOWED;
  } catch (error) {
    logger.error("rate limiter failed, allowing request", { err: error, key: rule.key.split(":").slice(0, 2).join(":") });
    return ALLOWED;
  }
}

/** Read-only: blocked once the count has reached the limit. Does not count this request. */
export async function checkRateLimit(rule: RateLimitRule): Promise<RateLimitDecision> {
  if (disabled()) return ALLOWED;
  try {
    const { count, secondsLeft } = await peek(rule);
    return count >= rule.limit ? { allowed: false, retryAfterSeconds: secondsLeft } : ALLOWED;
  } catch (error) {
    logger.error("rate limiter failed, allowing request", { err: error, key: rule.key.split(":").slice(0, 2).join(":") });
    return ALLOWED;
  }
}

/** Counts a hit without deciding anything (used for failed logins). */
export async function recordRateLimitHit(rule: RateLimitRule): Promise<void> {
  await hitRateLimit(rule);
}

/** 429 with a Retry-After header, in the app's normal error shape. */
export function tooManyRequests(retryAfterSeconds: number) {
  const response = fail(429, "Too many requests. Please try again later.");
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

// Old windows are useless. Roughly 1 call in 100 deletes rows older than a day.
async function cleanupSometimes(): Promise<void> {
  if (Math.random() > 0.01) return;
  try {
    await getPool().query(`DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 day'`);
  } catch (error) {
    logger.error("rate limit cleanup failed", { err: error });
  }
}
