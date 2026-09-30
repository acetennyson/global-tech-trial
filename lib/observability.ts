import { NextResponse } from "next/server";
import { logger } from "./logger";
import { requestContext } from "./requestContext";
import { REQUEST_ID_HEADER, resolveRequestId } from "./requestId";

// Wrap every route handler with this. It sets the request ID, returns it in
// the x-request-id header and logs one line when the request finishes.
export function withRequestLogging<A extends unknown[]>(
  handler: (request: Request, ...args: A) => Promise<Response> | Response,
) {
  return async (request: Request, ...args: A): Promise<Response> => {
    const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
    const { pathname } = new URL(request.url); // no query string, it can hold tokens
    const started = performance.now();

    return requestContext.run({ requestId }, async () => {
      let response: Response;
      try {
        response = await handler(request, ...args);
      } catch (error) {
        logger.error("unhandled error in route handler", { err: error });
        response = NextResponse.json({ error: { message: "Internal server error" } }, { status: 500 });
      }

      try {
        response.headers.set(REQUEST_ID_HEADER, requestId);
      } catch {
        // Immutable headers. The ID is still in the logs.
      }

      const status = response.status;
      const fields = {
        method: request.method,
        path: pathname,
        status,
        durationMs: Math.round(performance.now() - started),
      };
      if (status >= 500) logger.error("request completed", fields);
      else if (status >= 400) logger.warn("request completed", fields);
      else if (pathname === "/health") logger.debug("request completed", fields); // probes are noisy
      else logger.info("request completed", fields);

      return response;
    });
  };
}
