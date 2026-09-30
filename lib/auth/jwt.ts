import jwt from "jsonwebtoken";

// jsonwebtoken's synchronous sign/verify (HS256, shared secret), not Supabase Auth.
// That keeps resolveAuthUser in lib/auth/index.ts synchronous.

export interface JwtPayload {
  sub: string; // user id
  name: string | null;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: EXPIRES_IN } as jwt.SignOptions);
}

/** Returns null for a missing/expired/invalid token rather than throwing, so callers pick the error type. */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (typeof decoded === "string" || !decoded.sub) return null;
    return { sub: decoded.sub, name: (decoded as jwt.JwtPayload & { name?: string | null }).name ?? null };
  } catch {
    return null;
  }
}
