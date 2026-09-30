import bcrypt from "bcryptjs";

// Cost factor 12: deliberately expensive (~100-300ms) so a leaked hash table
// resists offline brute force, while staying fast enough for one login request.
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
