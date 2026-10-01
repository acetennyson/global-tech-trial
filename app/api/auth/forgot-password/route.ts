import { withRequestLogging } from "@/lib/observability";
import { logger } from "@/lib/logger";
import { ok, toErrorResponse } from "@/lib/http";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { generateResetToken } from "@/lib/auth/resetToken";
import { sendPasswordResetEmail } from "@/lib/email/sendPasswordResetEmail";
import { createPasswordResetToken, findUserByEmail } from "@/lib/users/repository";
import { LIMITS, getClientIp, hitRateLimit, keyPart, tooManyRequests } from "@/lib/rateLimit";

// Same response either way, unknown email included. No oracle for "does this account exist".
const GENERIC_MESSAGE = "If an account exists for that email, a password reset link has been sent.";

async function handlePOST(request: Request) {
  try {
    const body = await request.json();
    const { email } = forgotPasswordSchema.parse(body);

    // Per IP: a visible 429 is fine, it says nothing about any account.
    const ipLimit = await hitRateLimit({ key: `forgot:ip:${getClientIp(request)}`, ...LIMITS.forgotPassword.ip });
    if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);

    // Per email (stops mailbombing one victim from many IPs). Counted for known AND unknown
    // addresses alike. Over the limit we silently skip sending and still return the generic
    // 200: a 429 here would reveal that the address is registered.
    const emailLimit = await hitRateLimit({ key: `forgot:email:${keyPart(email)}`, ...LIMITS.forgotPassword.email });

    const user = emailLimit.allowed ? await findUserByEmail(email) : null;
    if (user) {
      // Failures here are logged, not returned. If SMTP is down, a registered email
      // must not get a 500 while an unknown one gets 200, or attackers could use
      // that difference to find registered emails.
      try {
        const { token, tokenHash, expiresAt } = generateResetToken();
        await createPasswordResetToken(user.id, tokenHash, expiresAt);

        const appUrl = process.env.APP_URL ?? "http://localhost:3000";
        const resetUrl = `${appUrl}/reset-password?token=${token}`;
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch (error) {
        logger.error("failed to create/send password reset token", { err: error });
      }
    }

    return ok({ message: GENERIC_MESSAGE });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const POST = withRequestLogging(handlePOST);
