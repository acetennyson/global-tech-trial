import { afterEach, describe, expect, it } from "vitest";
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

describe("proxy (CORS)", () => {
  const original = process.env.CORS_ALLOWED_ORIGINS;
  afterEach(() => {
    if (original === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = original;
  });

  const preflight = (origin = "https://their-app.com") =>
    new NextRequest("http://localhost/api/tasks", {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type,idempotency-key",
      },
    });

  it("allows any origin by default and answers the preflight with 204, without reaching a route", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    const res = proxy(preflight());
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("PATCH");
    expect(res.headers.get("access-control-allow-headers")).toContain("Idempotency-Key");
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("adds CORS headers to normal responses so the browser lets the page read them", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    const res = proxy(new NextRequest("http://localhost/api/tasks", { headers: { origin: "https://their-app.com" } }));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-expose-headers")).toContain("Retry-After");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("with a list, only the listed origins are allowed", () => {
    process.env.CORS_ALLOWED_ORIGINS = "https://their-app.com";
    expect(proxy(preflight("https://their-app.com")).headers.get("access-control-allow-origin")).toBe("https://their-app.com");
    const blocked = proxy(preflight("https://evil.com"));
    expect(blocked.status).toBe(204);
    expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("an empty value turns CORS off", () => {
    process.env.CORS_ALLOWED_ORIGINS = "";
    const res = proxy(new NextRequest("http://localhost/api/tasks", { headers: { origin: "https://their-app.com" } }));
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("leaves requests without an Origin (curl, servers, mobile apps) alone apart from the ID", () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    const res = proxy(new NextRequest("http://localhost/api/tasks"));
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});
