import bcrypt from "bcryptjs";

// Cost factor 12 (about 100-300ms per hash): slow enough to resist brute force, fast enough for a login.
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
