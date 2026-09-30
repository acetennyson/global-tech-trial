import { createHash } from "node:crypto";

export class IdempotencyKeyReuseError extends Error {
  constructor() {
    super("Idempotency-Key was already used with a different request");
    this.name = "IdempotencyKeyReuseError";
  }
}

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

export function assertSameRequest(storedHash: string | null | undefined, requestHash: string): void {
  if (storedHash && storedHash !== requestHash) throw new IdempotencyKeyReuseError();
}
