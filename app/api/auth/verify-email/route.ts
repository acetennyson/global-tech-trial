import { NextResponse } from "next/server";
import { withRequestLogging } from "@/lib/observability";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { verifyEmailSchema } from "@/lib/validation/auth";
import { hashVerificationToken } from "@/lib/auth/verificationToken";
import { signToken } from "@/lib/auth/jwt";
import { verifyEmailWithToken } from "@/lib/users/repository";

const INVALID_TOKEN_MESSAGE = "Invalid or expired verification token";

// A plain GET so the emailed link works by being clicked, no form or JS needed, the same
// shape as the newsletter unsubscribe link. Always redirects to a confirmation page rather
// than returning JSON: a human in an email client is the only caller this has.
async function handleGET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const { token: validToken } = verifyEmailSchema.parse({ token });

    const result = await verifyEmailWithToken(hashVerificationToken(validToken));
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    if (result.status === "invalid_token") {
      return NextResponse.redirect(`${appUrl}/verify-email/confirmed?status=invalid`, 303);
    }
    return NextResponse.redirect(`${appUrl}/verify-email/confirmed?status=ok`, 303);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// The programmatic counterpart to the GET above, same shape as /reset-password: token in
// the body, not the query string. For a client that already has the raw token (the home-page
// playground, a mobile app with a deep link, the token pasted by hand the way this API's
// README already does for password resets) and wants a fresh, verified JWT back immediately
// instead of waiting for its next ordinary request to pick up the DB change. Not required for
// verification to take effect: requireVerifiedEmail() reads email_verified_at straight from
// the database on every mutating request, so even a caller that never hits this endpoint is
// unblocked the moment the GET link above (or this one) is used.
//
// No rate limit here, deliberately: same reasoning as /reset-password. The token is 256
// random bits and single-use; limiting by IP or email would do nothing a guessable secret
// needs and would only let an attacker lock out the real owner by spamming wrong tokens.
async function handlePOST(request: Request) {
  try {
    const body = await request.json();
    const { token } = verifyEmailSchema.parse(body);

    const result = await verifyEmailWithToken(hashVerificationToken(token));
    if (result.status === "invalid_token") {
      return fail(400, INVALID_TOKEN_MESSAGE);
    }
    const { user } = result;

    // same shape as /login and /reset-password: a token that already reflects today's DB
    // state. Still just a courtesy — resolveAuthUser never looks at a token's age for this,
    // only requireVerifiedEmail's DB check matters, and that's already true by this point.
    const authToken = signToken({ sub: user.id, name: user.name });
    return ok({ user: { id: user.id, email: user.email, name: user.name }, token: authToken });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const GET = withRequestLogging(handleGET);
export const POST = withRequestLogging(handlePOST);
