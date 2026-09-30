import { createHash } from "node:crypto";

/**
 * Thrown when an Idempotency-Key is reused with a different request than the one
 * it was first stored for. That is a client bug (a key is a promise that the
 * request is identical), so it is rejected rather than silently answered with the
 * first request's result.
 */
export class IdempotencyKeyReuseError extends Error {
  constructor() {
    super("Idempotency-Key was already used with a different request");
    this.name = "IdempotencyKeyReuseError";
  }
}

// JSON with object keys sorted and undefined dropped, so {a:1,b:2} and {b:2,a:1}
// (or an omitted optional field vs an explicit undefined) fingerprint identically.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalize(v)])
    );
  }
  return value;
}

export function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

/**
 * Throws if a stored hash exists and differs. A null stored hash (row written
 * before request hashing existed) is accepted as a match.
 */
export function assertSameRequest(storedHash: string | null | undefined, requestHash: string): void {
  if (storedHash && storedHash !== requestHash) throw new IdempotencyKeyReuseError();
}
