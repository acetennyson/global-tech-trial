import { randomBytes, createHash } from "node:crypto";

// The raw token goes in the email link, only its hash is stored, so a database leak
// doesn't give out working links. SHA-256 is enough here: the token is 256 random
// bits, unlike a human-chosen password.

export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface GeneratedResetToken {
  /** goes in the emailed link, never persisted */
  token: string;
  /** goes in the DB */
  tokenHash: string;
  expiresAt: Date;
}

export function generateResetToken(): GeneratedResetToken {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
  };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
