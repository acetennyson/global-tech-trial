import { withRequestLogging } from "@/lib/observability";
import { logger } from "@/lib/logger";
import { ok, toErrorResponse } from "@/lib/http";
import { newsletterSubscribeSchema } from "@/lib/validation/newsletter";
import { subscribe } from "@/lib/newsletter/repository";
import { sendNewsletterWelcomeEmail } from "@/lib/email/sendNewsletterWelcomeEmail";
import { LIMITS, getClientIp, hitRateLimit, tooManyRequests } from "@/lib/rateLimit";

// Same message for a fresh signup and an already-subscribed address: nothing is gained by
// distinguishing them, and it keeps the form from ever showing an unfriendly error for the
// common case of someone submitting twice.
const GENERIC_MESSAGE = "You're subscribed. Check your inbox for a confirmation email.";

async function handlePOST(request: Request) {
  try {
    const limited = await hitRateLimit({ key: `newsletter:ip:${getClientIp(request)}`, ...LIMITS.newsletterSubscribe.ip });
    if (!limited.allowed) return tooManyRequests(limited.retryAfterSeconds);

    const body = await request.json();
    const { email } = newsletterSubscribeSchema.parse(body);

    const result = await subscribe(email);
    if (result.status === "subscribed") {
      // Failure to send never fails the subscribe call: the row is already written, and the
      // unsubscribe link can always be requested again later. Same "log it, don't surface it"
      // pattern as the password-reset email.
      try {
        const appUrl = process.env.APP_URL ?? "http://localhost:3000";
        const unsubscribeUrl = `${appUrl}/api/newsletter/unsubscribe?token=${result.token}`;
        await sendNewsletterWelcomeEmail(email, unsubscribeUrl);
      } catch (error) {
        logger.error("failed to send newsletter welcome email", { err: error });
      }
    }

    return ok({ message: GENERIC_MESSAGE });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const POST = withRequestLogging(handlePOST);
