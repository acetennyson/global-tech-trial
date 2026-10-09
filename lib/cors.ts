// CORS: lets a website on another domain call this API from the browser.
// (Servers, mobile apps and curl never needed it. Only browsers enforce CORS.)
//
// Configured with CORS_ALLOWED_ORIGINS:
//   unset or "*"                      any origin (the default for now)
//   "https://a.com,https://b.com"     only those origins
//   "" (set but empty)                CORS off: browsers on other domains are blocked
//
// Auth is a Bearer token in the Authorization header, never a cookie, so we never send
// Access-Control-Allow-Credentials and "*" is safe: a foreign page can't ride on a logged-in
// browser session, it would need the token itself.

export const ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
export const ALLOWED_HEADERS = "Authorization, Content-Type, Idempotency-Key, X-Request-Id";
// Response headers a browser app is allowed to read.
export const EXPOSED_HEADERS = "X-Request-Id, Retry-After";
const PREFLIGHT_MAX_AGE_SECONDS = "86400";

export type AllowedOrigins = "*" | string[];

export function parseAllowedOrigins(raw: string | undefined): AllowedOrigins {
  if (raw === undefined) return "*";
  const list = raw
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return list.includes("*") ? "*" : list;
}

/** The Access-Control-Allow-Origin value for this request, or null if the origin isn't allowed. */
export function resolveAllowOrigin(origin: string | null, allowed: AllowedOrigins): string | null {
  if (allowed === "*") return "*";
  if (!origin) return null;
  return allowed.includes(origin) ? origin : null;
}

/** Headers to add to a normal API response. */
export function corsResponseHeaders(origin: string | null, allowed: AllowedOrigins): Record<string, string> {
  const allowOrigin = resolveAllowOrigin(origin, allowed);
  if (!allowOrigin) return allowed === "*" ? {} : { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Expose-Headers": EXPOSED_HEADERS,
    ...(allowOrigin === "*" ? {} : { Vary: "Origin" }),
  };
}

/** Headers for the browser's OPTIONS preflight check. */
export function corsPreflightHeaders(origin: string | null, allowed: AllowedOrigins): Record<string, string> {
  const base = corsResponseHeaders(origin, allowed);
  if (!base["Access-Control-Allow-Origin"]) return base;
  return {
    ...base,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": PREFLIGHT_MAX_AGE_SECONDS,
  };
}

/** A preflight is an OPTIONS request that carries Origin and Access-Control-Request-Method. */
export function isPreflight(method: string, headers: Headers): boolean {
  return method === "OPTIONS" && headers.has("origin") && headers.has("access-control-request-method");
}
