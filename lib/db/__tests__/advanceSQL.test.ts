import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../pool", () => ({ getPool: vi.fn() }));

const { advanceInsert } = await import("../advanceSQL");

const query = vi.fn();
const conn = { query } as never;

beforeEach(() => {
  query.mockReset();
});

describe("advanceInsert", () => {
  it("adds RETURNING id and returns it when the row has an id", async () => {
    query.mockResolvedValue({ rows: [{ id: "t1" }] });
    const id = await advanceInsert("tasks", { id: "t1", title: "x" }, conn);
    expect(id).toBe("t1");
    expect(query.mock.calls[0][0]).toMatch(/RETURNING id$/);
  });

  it("does NOT add RETURNING id for tables without an id column (idempotency_keys)", async () => {
    query.mockResolvedValue({ rows: [] });
    const id = await advanceInsert("idempotency_keys", { user_id: "u1", key: "k1" }, conn);
    expect(id).toBe("");
    expect(query.mock.calls[0][0]).not.toMatch(/RETURNING/);
  });
});
