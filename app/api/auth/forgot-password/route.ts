import { ok, toErrorResponse } from "@/lib/http";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { generateResetToken } from "@/lib/auth/resetToken";
import { sendPasswordResetEmail } from "@/lib/email/sendPasswordResetEmail";
import { createPasswordResetToken, findUserByEmail } from "@/lib/users/repository";

// Always the same response, whether or not the email belongs to an account —
// otherwise this endpoint becomes a free "does this email have an account"
// oracle. Nothing about the response, or its timing, should differ.
const GENERIC_MESSAGE = "If an account exists for that email, a password reset link has been sent.";

export async function POST(request: Request) {
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
