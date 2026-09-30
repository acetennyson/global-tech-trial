import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_ID_HEADER, resolveRequestId } from "./lib/requestId";

// Next.js 16 calls this file "proxy" (it used to be middleware.ts).
// Gives each request an ID and passes it to the route and back to the caller.
export function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  const forwarded = new Headers(request.headers);
  forwarded.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/health"],
};
