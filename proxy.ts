import { NextResponse, type NextRequest } from "next/server";
import { corsPreflightHeaders, corsResponseHeaders, isPreflight, parseAllowedOrigins } from "./lib/cors";
import { REQUEST_ID_HEADER, resolveRequestId } from "./lib/requestId";

// Next.js 16 calls this file "proxy" (it used to be middleware.ts).
// Gives each request an ID and passes it to the route and back to the caller,
// and adds CORS headers so websites on other domains can call the API (lib/cors.ts).
export function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const origin = request.headers.get("origin");
  const allowed = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);

  // The browser's "may I?" check. Answered here, so no route needs an OPTIONS handler.
  if (isPreflight(request.method, request.headers)) {
    const preflight = new NextResponse(null, { status: 204 });
    for (const [name, value] of Object.entries(corsPreflightHeaders(origin, allowed))) preflight.headers.set(name, value);
    preflight.headers.set(REQUEST_ID_HEADER, requestId);
    return preflight;
  }

  const forwarded = new Headers(request.headers);
  forwarded.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  for (const [name, value] of Object.entries(corsResponseHeaders(origin, allowed))) response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/health"],
};
