/**
 * Auth resolution for API routes.
 *
 * This project has no session/JWT provider wired up yet, so the "signed-in
 * user" is resolved from request headers that a real auth layer (NextAuth,
 * a JWT middleware, a gateway, ...) would set after verifying a token.
 * Swap `resolveAuthUser` for real verification later — every caller in this
 * codebase already treats it as the single source of truth for "who is
 * making this request", and never trusts a client-supplied `createdBy`.
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
