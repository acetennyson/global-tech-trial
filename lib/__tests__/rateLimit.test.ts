import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ query }) }));

const { hitRateLimit, checkRateLimit, getClientIp, keyPart, tooManyRequests } = await import("../rateLimit");

const rule = { key: "t:1", limit: 3, windowSeconds: 60 };

beforeEach(() => {
  query.mockReset();
  delete process.env.RATE_LIMIT_DISABLED;
});

describe("hitRateLimit", () => {
  it("allows requests up to the limit and blocks the next one, with seconds until the window resets", async () => {
    query.mockResolvedValueOnce({ rows: [{ count: 3, seconds_left: 40 }] });
    expect(await hitRateLimit(rule)).toEqual({ allowed: true });

    query.mockResolvedValueOnce({ rows: [{ count: 4, seconds_left: 40 }] });
    expect(await hitRateLimit(rule)).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });

  it("counts with one atomic upsert", async () => {
    query.mockResolvedValue({ rows: [{ count: 1, seconds_left: 60 }] });
    await hitRateLimit(rule);
    expect(query.mock.calls[0][0]).toMatch(/INSERT INTO rate_limits[\s\S]*ON CONFLICT \(key, window_start\) DO UPDATE/);
    expect(query.mock.calls[0][1]).toEqual(["t:1", 60]);
  });

  it("fails open if the database errors", async () => {
    query.mockRejectedValue(new Error("db down"));
    expect(await hitRateLimit(rule)).toEqual({ allowed: true });
  });

  it("is a no-op when RATE_LIMIT_DISABLED=true", async () => {
    process.env.RATE_LIMIT_DISABLED = "true";
    expect(await hitRateLimit(rule)).toEqual({ allowed: true });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("checkRateLimit", () => {
  it("allows when there is no row yet", async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await checkRateLimit(rule)).toEqual({ allowed: true });
  });

  it("blocks once the count has reached the limit, without incrementing", async () => {
    query.mockResolvedValue({ rows: [{ count: 3, seconds_left: 25 }] });
    expect(await checkRateLimit(rule)).toEqual({ allowed: false, retryAfterSeconds: 25 });
    expect(query.mock.calls[0][0]).not.toMatch(/INSERT/);
  });
});

describe("helpers", () => {
  it("getClientIp prefers x-real-ip, then the first x-forwarded-for entry, then 'unknown'", () => {
    const req = (h: Record<string, string>) => new Request("http://x", { headers: h });
    expect(getClientIp(req({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(getClientIp(req({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(getClientIp(req({}))).toBe("unknown");
  });

  it("keyPart hashes case-insensitively and never contains the input", () => {
    expect(keyPart("Ada@Example.com")).toBe(keyPart("ada@example.com"));
    expect(keyPart("ada@example.com")).not.toContain("ada");
  });

  it("tooManyRequests is a 429 with Retry-After in the standard error shape", async () => {
    const res = tooManyRequests(90);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("90");
    expect((await res.json()).error.message).toMatch(/too many requests/i);
  });
});
