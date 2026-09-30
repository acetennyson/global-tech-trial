import { signToken } from "@/lib/auth/jwt";

/** For tests only: mints a real, verifiable JWT so route tests exercise the actual auth path. */
export function authHeaderFor(user: { id: string; name?: string | null }): Record<string, string> {
  const token = signToken({ sub: user.id, name: user.name ?? null });
  return { authorization: `Bearer ${token}` };
}
