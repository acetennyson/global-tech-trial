import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "../proxy";

describe("proxy (request ID)", () => {
  it("assigns an ID, forwards it to the handler and returns it to the caller", () => {
    const res = proxy(new NextRequest("http://localhost/api/tasks"));
    const id = res.headers.get("x-request-id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    // NextResponse.next({request:{headers}}) exposes forwarded headers like this:
    expect(res.headers.get("x-middleware-request-x-request-id")).toBe(id);
  });

  it("keeps a valid incoming ID and replaces a bad one", () => {
    const good = proxy(new NextRequest("http://localhost/api/tasks", { headers: { "x-request-id": "abc-1" } }));
    expect(good.headers.get("x-request-id")).toBe("abc-1");
    const bad = proxy(new NextRequest("http://localhost/api/tasks", { headers: { "x-request-id": "bad id!" } }));
    expect(bad.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("only runs for the API and /health", () => {
    expect(config.matcher).toEqual(["/api/:path*", "/health"]);
  });
});
