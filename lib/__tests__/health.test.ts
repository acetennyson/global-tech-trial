import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/lib/db/pool", () => ({ getPool: () => ({ query }) }));

const { checkDatabase } = await import("@/lib/health");

beforeEach(() => vi.clearAllMocks());

describe("checkDatabase", () => {
  it("is ok when SELECT 1 succeeds", async () => {
    query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const result = await checkDatabase();
    expect(query).toHaveBeenCalledWith("SELECT 1");
    expect(result.ok).toBe(true);
  });

  it("is not ok (and does not throw) when the query fails", async () => {
    query.mockRejectedValue(new Error("connection refused"));
    await expect(checkDatabase()).resolves.toMatchObject({ ok: false });
  });

  it("is not ok when the database hangs past the timeout", async () => {
    query.mockReturnValue(new Promise(() => {}));
    const result = await checkDatabase(20);
    expect(result.ok).toBe(false);
  });
});
