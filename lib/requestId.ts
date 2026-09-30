export const REQUEST_ID_HEADER = "x-request-id";

// Short, plain IDs only. Anything else could inject junk into the logs.
const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function resolveRequestId(incoming: string | null | undefined): string {
  const candidate = incoming?.trim();
  return candidate && SAFE_ID.test(candidate) ? candidate : crypto.randomUUID();
}
