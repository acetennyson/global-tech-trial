// resolveAuthUser verifies the Bearer JWT (issued by /api/auth/register and /login,
// see lib/auth/jwt.ts). Verification is synchronous, so route handlers don't need
// `await`. An async verifier (e.g. Supabase Auth) would change every call site.

import { verifyToken } from "@/lib/auth/jwt";

export interface AuthUser {
  id: string;
  name: string | null;
}

export class UnauthenticatedError extends Error {
  constructor(message = "Missing or invalid authentication") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Not allowed to perform this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function resolveAuthUser(request: Request): AuthUser {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : null;

  if (!token) {
    throw new UnauthenticatedError();
  }

  const payload = verifyToken(token);
  if (!payload) {
    throw new UnauthenticatedError("Invalid or expired token");
  }

  return { id: payload.sub, name: payload.name };
}
