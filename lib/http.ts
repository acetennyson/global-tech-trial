import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthenticatedError } from "./auth";

/**
 * Consistent JSON envelopes for every route, mirroring the `Result()` /
 * `Error()` pair from elementTouch/server/functions.php.
 */

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: { message, details } }, { status });
}

/** Maps a caught error to the right HTTP response, so route handlers stay free of repetitive try/catch branching. */
export function toErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return fail(400, "Invalid request data", error.flatten());
  }
  if (error instanceof UnauthenticatedError) {
    return fail(401, error.message);
  }
  if (error instanceof SyntaxError) {
    return fail(400, "Malformed JSON body");
  }
  console.error(error);
  return fail(500, "Internal server error");
}
