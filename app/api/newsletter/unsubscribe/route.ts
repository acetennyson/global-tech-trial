import { NextResponse } from "next/server";
import { withRequestLogging } from "@/lib/observability";
import { toErrorResponse } from "@/lib/http";
import { newsletterUnsubscribeSchema } from "@/lib/validation/newsletter";
import { hashUnsubscribeToken, unsubscribeByTokenHash } from "@/lib/newsletter/repository";

// A plain GET so the link in the email works by being clicked, no form or JS needed.
// Always redirects to a confirmation page rather than returning JSON, since a human in
// an email client is the only caller this has.
async function handleGET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const { token: validToken } = newsletterUnsubscribeSchema.parse({ token });

    const result = await unsubscribeByTokenHash(hashUnsubscribeToken(validToken));
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    if (result === "invalid_token") {
      return NextResponse.redirect(`${appUrl}/newsletter/unsubscribed?status=invalid`, 303);
    }
    return NextResponse.redirect(`${appUrl}/newsletter/unsubscribed?status=ok`, 303);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const GET = withRequestLogging(handleGET);
