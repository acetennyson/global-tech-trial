// TM-2: real auth. resolveAuthUser now verifies a Bearer JWT (issued by
// /api/auth/register and /api/auth/login, see lib/auth/jwt.ts) instead of
// trusting the old x-user-id/x-user-name header stand-in. This is the actual
// swap the M2-era comment here used to describe as "later" — and it's a sync
// verification (jsonwebtoken's HS256 verify), which is what lets this stay a
// synchronous function and keeps every call site in app/api/** unchanged. That
// wouldn't hold if this were ever swapped again for something that verifies
// asynchronously (e.g. Supabase Auth) — every caller would need `await` then.

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
