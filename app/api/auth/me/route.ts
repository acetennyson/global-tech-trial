import { withRequestLogging } from "@/lib/observability";
import { resolveAuthUser } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { findUserById } from "@/lib/users/repository";
import { LIMITS, hitRateLimit, tooManyRequests } from "@/lib/rateLimit";

// The "has anything about my account changed" endpoint: reads the caller's own row
// straight from the database, same as every other auth-gated route does internally, so
// there's nothing here a client couldn't already infer indirectly. It exists so a client
// doesn't have to decode its own JWT (which never carries emailVerifiedAt — see lib/auth)
// or re-login just to find out whether a verification link landed yet.
//
// Not gated by requireVerifiedEmail: checking your own verification status is exactly
// what an unverified caller needs to be able to do.
async function handleGET(request: Request) {
  try {
    const user = resolveAuthUser(request);

    const limited = await hitRateLimit({ key: `me:user:${user.id}`, ...LIMITS.me.user });
    if (!limited.allowed) return tooManyRequests(limited.retryAfterSeconds);

    const record = await findUserById(user.id);
    if (!record) {
      // Can't normally happen (the token was signed for this id), but a deleted or
      // otherwise vanished account shouldn't look like a server error.
      return fail(404, "Account not found");
    }

    return ok({
      id: record.id,
      email: record.email,
      name: record.name,
      emailVerified: record.emailVerifiedAt !== null,
      emailVerifiedAt: record.emailVerifiedAt,
      createdAt: record.createdAt,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const GET = withRequestLogging(handleGET);
