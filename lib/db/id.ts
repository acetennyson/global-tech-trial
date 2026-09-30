// Minimal ULID generator: 48-bit timestamp + 80 bits of randomness, Crockford
// base32 encoded (no I, L, O, U — avoids visual ambiguity). Sortable by creation
// time as a plain string, which is what keyset pagination on `id` relies on.
//
// This is intentionally dependency-free so Module 1 doesn't pull in a new
// package just for ID generation. Swap in the `ulid` npm package later if a
// monotonic/stricter implementation is ever needed — nothing that reads a
// generated id (repository, routes, client) needs to change.

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(time: number, length: number): string {
  let str = "";
  let t = time;
  for (let i = length - 1; i >= 0; i--) {
    str = ENCODING[t % 32] + str;
    t = Math.floor(t / 32);
  }
  return str;
}

function encodeRandom(length: number): string {
  let str = "";
  for (let i = 0; i < length; i++) {
    str += ENCODING[Math.floor(Math.random() * 32)];
  }
  return str;
}

/** 26-character ULID string, e.g. "01K8XR2QC0J8Z6Y8YB2S3D5N9V". */
export function generateId(): string {
  return encodeTime(Date.now(), 10) + encodeRandom(16);
}
