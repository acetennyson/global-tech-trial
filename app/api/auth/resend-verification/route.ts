import { withRequestLogging } from "@/lib/observability";
import { logger } from "@/lib/logger";
import { ok, toErrorResponse } from "@/lib/http";
import { resendVerificationSchema } from "@/lib/validation/auth";
import { generateVerificationToken } from "@/lib/auth/verificationToken";
import { sendVerificationEmail } from "@/lib/email/sendVerificationEmail";
import { createEmailVerificationToken, findUserByEmail } from "@/lib/users/repository";
import { LIMITS, getClientIp, hitRateLimit, keyPart, tooManyRequests } from "@/lib/rateLimit";

// Same response whether the email is registered, already verified, or unknown. Same
// reasoning as forgot-password: a 500 or a different message for a real account would
// be an oracle for "does this account exist" or "is it already verified".
const GENERIC_MESSAGE = "If that email is registered and not yet verified, a new verification link has been sent.";

async function handlePOST(request: Request) {
  try {
    const body = await request.json();
    const { email } = resendVerificationSchema.parse(body);

    const ipLimit = await hitRateLimit({ key: `resendverify:ip:${getClientIp(request)}`, ...LIMITS.resendVerification.ip });
    if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);

    const emailLimit = await hitRateLimit({
      key: `resendverify:email:${keyPart(email)}`,
      ...LIMITS.resendVerification.email,
    });

    const user = emailLimit.allowed ? await findUserByEmail(email) : null;
    if (user && !user.emailVerifiedAt) {
      try {
        const { token, tokenHash, expiresAt } = generateVerificationToken();
        await createEmailVerificationToken(user.id, tokenHash, expiresAt);

        const appUrl = process.env.APP_URL ?? "http://localhost:3000";
        const verifyUrl = `${appUrl}/api/auth/verify-email?token=${token}`;
        await sendVerificationEmail(user.email, verifyUrl);
      } catch (error) {
        logger.error("failed to create/send verification email", { err: error });
      }
    }

    return ok({ message: GENERIC_MESSAGE });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const POST = withRequestLogging(handlePOST);
