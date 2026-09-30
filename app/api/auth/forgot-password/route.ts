import { withRequestLogging } from "@/lib/observability";
import { ok, toErrorResponse } from "@/lib/http";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { generateResetToken } from "@/lib/auth/resetToken";
import { sendPasswordResetEmail } from "@/lib/email/sendPasswordResetEmail";
import { createPasswordResetToken, findUserByEmail } from "@/lib/users/repository";

// Same response either way, unknown email included. No oracle for "does this account exist".
const GENERIC_MESSAGE = "If an account exists for that email, a password reset link has been sent.";

async function handlePOST(request: Request) {
  try {
    const body = await request.json();
    const { email } = forgotPasswordSchema.parse(body);

    const user = await findUserByEmail(email);
    if (user) {
      const { token, tokenHash, expiresAt } = generateResetToken();
      await createPasswordResetToken(user.id, tokenHash, expiresAt);

      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const resetUrl = `${appUrl}/reset-password?token=${token}`;
      await sendPasswordResetEmail(user.email, resetUrl);
    }

    return ok({ message: GENERIC_MESSAGE });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const POST = withRequestLogging(handlePOST);
