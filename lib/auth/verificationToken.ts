import { randomBytes, createHash } from "node:crypto";

// Same shape as resetToken.ts: the raw token goes in the emailed link, only its hash is
// stored, so a database leak doesn't hand out working verification links. 24h, not 1h
// like a password reset: a missed reset link is requested again in seconds, a missed
// verification link is more often "I'll get to it later today".

export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface GeneratedVerificationToken {
  /** goes in the emailed link, never persisted */
  token: string;
  /** goes in the DB */
  tokenHash: string;
  expiresAt: Date;
}

export function generateVerificationToken(): GeneratedVerificationToken {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashVerificationToken(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
  };
}

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
