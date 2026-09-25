// headers stand in for a real session/JWT. swap the body of resolveAuthUser later, callers don't change.

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
