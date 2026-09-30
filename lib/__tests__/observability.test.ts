import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { withRequestLogging } from "@/lib/observability";
import { logger, setLogSink } from "@/lib/logger";

let lines: string[];
beforeEach(() => {
  lines = [];
  process.env.LOG_LEVEL = "debug";
  setLogSink((l) => lines.push(l));
});
afterEach(() => {
  process.env.LOG_LEVEL = "silent";
  setLogSink(null);
});

const entries = () => lines.map((l) => JSON.parse(l));
const req = (path = "/api/x?token=secret", headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { method: "POST", headers });

describe("withRequestLogging", () => {
  it("generates a request ID and returns it in the response header", async () => {
    const res = await withRequestLogging(async () => NextResponse.json({ ok: true }))(req());
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reuses a valid incoming request ID", async () => {
    const res = await withRequestLogging(async () => NextResponse.json({}))(req("/api/x", { "x-request-id": "from-proxy" }));
    expect(res.headers.get("x-request-id")).toBe("from-proxy");
  });

  it("logs one completion line with method, path (no query), status, duration and requestId", async () => {
    await withRequestLogging(async () => NextResponse.json({}, { status: 201 }))(req("/api/x?token=secret", { "x-request-id": "r1" }));
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({ level: "info", msg: "request completed", method: "POST", path: "/api/x", status: 201, requestId: "r1" });
    expect(typeof entries()[0].durationMs).toBe("number");
    expect(lines.join("")).not.toContain("secret");
  });

  it("uses warn for 4xx and error for 5xx", async () => {
    await withRequestLogging(async () => NextResponse.json({}, { status: 404 }))(req());
    await withRequestLogging(async () => NextResponse.json({}, { status: 503 }))(req());
    expect(entries().map((e) => e.level)).toEqual(["warn", "error"]);
  });

  it("tags logs written inside the handler with the same request ID", async () => {
    await withRequestLogging(async () => {
      logger.info("from handler");
      return NextResponse.json({});
    })(req("/api/x", { "x-request-id": "r2" }));
    expect(entries()[0]).toMatchObject({ msg: "from handler", requestId: "r2" });
  });

  it("turns an escaped exception into a logged 500 that still carries the ID", async () => {
    const res = await withRequestLogging(async () => {
      throw new Error("kaboom");
    })(req("/api/x", { "x-request-id": "r3" }));
    expect(res.status).toBe(500);
    expect(res.headers.get("x-request-id")).toBe("r3");
    expect(entries()[0]).toMatchObject({ level: "error", msg: "unhandled error in route handler", requestId: "r3" });
    expect(entries()[1]).toMatchObject({ status: 500 });
  });

  it("logs healthy /health probes at debug only", async () => {
    process.env.LOG_LEVEL = "info";
    await withRequestLogging(async () => NextResponse.json({}))(req("/health"));
    expect(lines).toHaveLength(0);
  });

  it("passes extra handler arguments through (dynamic route params)", async () => {
    const res = await withRequestLogging(async (_r: Request, ctx: { params: { id: string } }) => NextResponse.json({ id: ctx.params.id }))(
      req(),
      { params: { id: "42" } },
    );
    expect(await res.json()).toEqual({ id: "42" });
  });
});
