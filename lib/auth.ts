/**
 * Auth resolution for API routes.
 *
 * This project has no session or JWT provider wired up yet, so the
 * "signed-in user" is resolved from request headers instead: the headers a
 * real auth layer (NextAuth, a JWT middleware, a gateway) would normally set
 * after verifying a token. Every caller in this codebase already treats
 * `resolveAuthUser` as the single source of truth for "who is making this
 * request", and never trusts a client-supplied `createdBy`, so swapping in
 * real token verification later only means changing the body of this one
 * function.
 */

export interface AuthUser {
  id: string;
  name: string | null;
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Missing or invalid authentication");
    this.name = "UnauthenticatedError";
  }
}

export function resolveAuthUser(request: Request): AuthUser {
  const id = request.headers.get("x-user-id")?.trim();
  const name = request.headers.get("x-user-name")?.trim();

  if (!id) {
    throw new UnauthenticatedError();
  }

  return { id, name: name || null };
}
