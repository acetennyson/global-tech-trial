import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { EmailNotVerifiedError, ForbiddenError, UnauthenticatedError } from "./auth";
import { IdempotencyKeyReuseError } from "./idempotency";
import { logger } from "./logger";

// JSON response helpers

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: { message, details } }, { status });
}

/** catch(e) { return toErrorResponse(e) } everywhere. */
export function toErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return fail(400, "Invalid request data", error.flatten());
  }
  if (error instanceof UnauthenticatedError) {
    return fail(401, error.message);
  }
  if (error instanceof ForbiddenError) {
    return fail(403, error.message);
  }
  if (error instanceof EmailNotVerifiedError) {
    return fail(403, error.message);
  }
  if (error instanceof IdempotencyKeyReuseError) {
    return fail(422, error.message);
  }
  if (error instanceof SyntaxError) {
    return fail(400, "Malformed JSON body");
  }
  logger.error("unhandled error", { err: error });
  return fail(500, "Internal server error");
}
