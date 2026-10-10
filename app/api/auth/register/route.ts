import { withRequestLogging } from "@/lib/observability";
import { logger } from "@/lib/logger";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { registerSchema } from "@/lib/validation/auth";
import { hashPassword } from "@/lib/auth/password";
import { signToken } from "@/lib/auth/jwt";
import { generateVerificationToken } from "@/lib/auth/verificationToken";
import { sendVerificationEmail } from "@/lib/email/sendVerificationEmail";
import { createEmailVerificationToken, createUser } from "@/lib/users/repository";
import { LIMITS, getClientIp, hitRateLimit, tooManyRequests } from "@/lib/rateLimit";

async function handlePOST(request: Request) {
  try {
    // checked before anything expensive (bcrypt) runs
    const limited = await hitRateLimit({ key: `register:ip:${getClientIp(request)}`, ...LIMITS.register.ip });
    if (!limited.allowed) return tooManyRequests(limited.retryAfterSeconds);

    const body = await request.json();
    const { email, password, name } = registerSchema.parse(body);

    const passwordHash = await hashPassword(password);
    const result = await createUser({ email, passwordHash, name: name ?? null });

    if (result.status === "email_taken") {
      // a clear "already registered" is fine here: unlike login, nothing is gained by hiding it
      return fail(409, "An account with this email already exists");
    }

    // The account exists either way, even if this fails: sign-in and reads work unverified,
    // and /api/auth/resend-verification covers a lost or expired link. Same "log it, don't
    // fail the request" pattern as the password-reset email.
    try {
      const { token, tokenHash, expiresAt } = generateVerificationToken();
      await createEmailVerificationToken(result.user.id, tokenHash, expiresAt);

      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const verifyUrl = `${appUrl}/api/auth/verify-email?token=${token}`;
      await sendVerificationEmail(result.user.email, verifyUrl);
    } catch (error) {
      logger.error("failed to create/send verification email", { err: error });
    }

    const token = signToken({ sub: result.user.id, name: result.user.name });
    return ok({ user: { id: result.user.id, email: result.user.email, name: result.user.name }, token }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const POST = withRequestLogging(handlePOST);
