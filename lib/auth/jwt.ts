import jwt from "jsonwebtoken";

// Deliberately using jsonwebtoken's synchronous sign/verify (HS256, a shared
// secret) rather than Supabase Auth's async JWT verification the handoff doc
// originally pointed at. That choice is what lets resolveAuthUser in
// lib/auth.ts stay synchronous — see the comment there: an async verification
// step would have forced every call site (every route handler) to add `await`.
// If this is ever swapped for Supabase Auth or another async verifier, that
// comment's claim stops being true and every caller needs updating.

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
