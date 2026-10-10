// resolveAuthUser verifies the Bearer JWT (issued by /api/auth/register and /login,
// see lib/auth/jwt.ts). Verification is synchronous, so route handlers don't need
// `await`. An async verifier (e.g. Supabase Auth) would change every call site.

import { verifyToken } from "@/lib/auth/jwt";
import { findUserById } from "@/lib/users/repository";

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

export class EmailNotVerifiedError extends Error {
  constructor(message = "Verify your email before creating, editing, deleting, or syncing tasks") {
    super(message);
    this.name = "EmailNotVerifiedError";
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

/**
 * The verification gate for task-mutating endpoints (create/edit/delete/bulk/sync push).
 * Deliberately NOT folded into resolveAuthUser: that one stays a synchronous, DB-free JWT
 * check so read endpoints keep their current cost, and a user who verifies via the emailed
 * link works immediately on their next request instead of needing a fresh token. Call this
 * only from the handlers that actually mutate tasks, after resolveAuthUser.
 */
export async function requireVerifiedEmail(userId: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user?.emailVerifiedAt) {
    throw new EmailNotVerifiedError();
  }
}
