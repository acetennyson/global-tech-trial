// Small dependency-free ULID generator: 48-bit timestamp + 80 random bits, Crockford
// base32 (no I, L, O, U). Sorts by creation time as a plain string, which keyset
// pagination relies on. Can be swapped for the `ulid` package without other changes.

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
