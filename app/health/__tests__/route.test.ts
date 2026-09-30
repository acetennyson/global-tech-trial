import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/health", () => ({ checkDatabase: vi.fn() }));
const { checkDatabase } = await import("@/lib/health");
const { GET } = await import("../route");

const call = () => GET(new Request("http://localhost/health"));
beforeEach(() => vi.clearAllMocks());

describe("GET /health", () => {
  it("returns 200 when the database is reachable", async () => {
    vi.mocked(checkDatabase).mockResolvedValue({ ok: true, latencyMs: 3 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", checks: { database: "up" } });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("returns 503 when the database is down, without leaking details", async () => {
    vi.mocked(checkDatabase).mockResolvedValue({ ok: false, latencyMs: 2000 });
    const res = await call();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "error", checks: { database: "down" } });
  });
});
