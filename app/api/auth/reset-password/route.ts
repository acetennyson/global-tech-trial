import { withRequestLogging } from "@/lib/observability";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { hashResetToken } from "@/lib/auth/resetToken";
import { hashPassword } from "@/lib/auth/password";
import { signToken } from "@/lib/auth/jwt";
import { findPasswordResetToken, resetPasswordWithToken } from "@/lib/users/repository";

const INVALID_TOKEN_MESSAGE = "Invalid or expired reset token";

async function handlePOST(request: Request) {
  try {
    const body = await request.json();
    const { token, password } = resetPasswordSchema.parse(body);

    const tokenHash = hashResetToken(token);
    const record = await findPasswordResetToken(tokenHash);

    if (!record || record.usedAt !== null || new Date(record.expiresAt).getTime() < Date.now()) {
      return fail(400, INVALID_TOKEN_MESSAGE);
    }

    // cheap pre-check above avoids hashing for junk tokens. This call re-checks the token
    // atomically and does password + used + invalidate-others in one transaction.
    const passwordHash = await hashPassword(password);
    const result = await resetPasswordWithToken(tokenHash, passwordHash);
    if (result.status === "invalid_token") {
      // lost a race (token used or expired since the pre-check). same message either way.
      return fail(400, INVALID_TOKEN_MESSAGE);
    }
    const { user } = result;

    // same shape as /login, logs them straight in
    const authToken = signToken({ sub: user.id, name: user.name });
    return ok({ user: { id: user.id, email: user.email, name: user.name }, token: authToken });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const POST = withRequestLogging(handlePOST);
