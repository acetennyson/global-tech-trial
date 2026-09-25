import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRow } from "@/lib/types";
import { taskFiltersSchema } from "@/lib/validation/task";
import { buildCountQuery, buildSelectQuery } from "@/lib/db/queryBuilder";

vi.mock("@/lib/db/advanceSQL", () => ({
  advanceSelect: vi.fn(),
  advanceCount: vi.fn(),
  advanceInsert: vi.fn(),
  advanceUpdate: vi.fn(),
  advanceDelete: vi.fn(),
  advanceDeleteAll: vi.fn(),
}));

const advanceSQL = await import("@/lib/db/advanceSQL");
const { filtersToCondition, listTasks, rowToTask } = await import("../repository");

function row(id: number): TaskRow {
  return {
    id,
    parent_id: null,
    title: `Task ${id}`,
    description: null,
    status: "todo",
    visible: 1,
    start_time: "2026-01-01 09:00:00",
    end_time: "2026-01-01 17:00:00",
    created_by_id: "user-1",
    created_by_name: "Ada",
    created_at: "2026-01-01 08:00:00",
    updated_at: "2026-01-01 08:00:00",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rowToTask", () => {
  it("maps snake_case DB columns to the camelCase API shape", () => {
    const row: TaskRow = {
      id: 1,
      parent_id: null,
      title: "Ship it",
      description: null,
      status: "todo",
      visible: 1,
      start_time: "2026-01-01 09:00:00",
      end_time: "2026-01-01 17:00:00",
      created_by_id: "user-1",
      created_by_name: "Ada",
      created_at: "2026-01-01 08:00:00",
      updated_at: "2026-01-01 08:00:00",
    };

    expect(rowToTask(row)).toEqual({
      id: 1,
      parentId: null,
      title: "Ship it",
      description: null,
      status: "todo",
      visible: true,
      startTime: "2026-01-01 09:00:00",
      endTime: "2026-01-01 17:00:00",
      createdById: "user-1",
      createdByName: "Ada",
      createdAt: "2026-01-01 08:00:00",
      updatedAt: "2026-01-01 08:00:00",
    });
  });
});

describe("filtersToCondition", () => {
  it("translates status/creator filters into an __IN + equality condition", () => {
    const filters = taskFiltersSchema.parse({ status: "todo,inProgress", creator: "user-1" });
    const condition = filtersToCondition(filters);
    expect(condition.__IN).toEqual({ status: ["todo", "inProgress"] });
    expect(condition.created_by_id).toBe("user-1");
  });

  it("maps a from/to range on the requested timeField to __BETWEEN", () => {
    const filters = taskFiltersSchema.parse({
      timeField: "end",
      from: "2026-01-01T00:00:00Z",
      to: "2026-02-01T00:00:00Z",
    });
    const condition = filtersToCondition(filters);
    expect(condition.__BETWEEN).toEqual({
      end_time: ["2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"],
    });
  });

  it("falls back to a one-sided __GREATER when only `from` is given", () => {
    const filters = taskFiltersSchema.parse({ from: "2026-01-01T00:00:00Z" });
    const condition = filtersToCondition(filters);
    expect(condition.__GREATER).toEqual({ start_time: "2026-01-01T00:00:00Z" });
    expect(condition.__LESSER).toBeUndefined();
  });

  it("maps multi-column `sort` to __ORDERBY with offset pagination", () => {
    const filters = taskFiltersSchema.parse({ sort: "status,-startTime", limit: "20", offset: "40" });
    const condition = filtersToCondition(filters);
    expect(condition.__ORDERBY).toEqual([
      { column: "status", asc: true },
      { column: "start_time", asc: false },
    ]);
    expect(condition.__LIMIT).toBe(20);
    expect(condition.__OFFSET).toBe(40);
  });

  it("switches to id-based keyset pagination when `cursor` is given, ignoring `sort`/`offset`", () => {
    const filters = taskFiltersSchema.parse({ cursor: "100", sort: "status", offset: "40", limit: "20" });
    const condition = filtersToCondition(filters);
    expect(condition.__GREATER).toEqual({ id: 100 });
    expect(condition.__ORDERBY).toEqual([{ column: "id", asc: true }]);
    expect(condition.__LIMIT).toBe(20);
    expect(condition.__OFFSET).toBeUndefined();
  });

  it("merges a cursor with an existing time-range __GREATER instead of overwriting it", () => {
    const filters = taskFiltersSchema.parse({ cursor: "100", from: "2026-01-01T00:00:00Z" });
    const condition = filtersToCondition(filters);
    expect(condition.__GREATER).toEqual({ start_time: "2026-01-01T00:00:00Z", id: 100 });
  });

  // Regression test for the bug fixed on 2026-09-25: advanceCount used to build its
  // COUNT(*) query through buildSelectQuery, whose column-list check rejected
  // "COUNT(*) AS count" as an unsafe identifier, throwing on every offset-mode
  // GET /api/tasks request. This runs the real (unmocked) query builders, not just
  // advanceSQL's mocked stand-ins, so a regression here would fail loudly again.
  it("produces valid SELECT and COUNT SQL for a real query string, end to end", () => {
    const filters = taskFiltersSchema.parse({
      status: "todo",
      from: "2026-01-01T00:00:00Z",
      sort: "-startTime",
    });
    const condition = filtersToCondition(filters);

    expect(() => buildSelectQuery("tasks", "*", condition)).not.toThrow();
    expect(() => buildCountQuery("tasks", condition)).not.toThrow();

    const { sql: countSql, params: countParams } = buildCountQuery("tasks", condition);
    expect(countSql).toBe("SELECT COUNT(*) AS count FROM tasks WHERE start_time >= ? AND status IN (?)");
    expect(countParams).toEqual(["2026-01-01T00:00:00Z", "todo"]);
  });
});

describe("listTasks", () => {
  it("computes total/page/totalPages/hasMore in offset mode", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([row(41), row(42)] as never);
    vi.mocked(advanceSQL.advanceCount).mockResolvedValue(42);

    const filters = taskFiltersSchema.parse({ limit: "2", offset: "40" });
    const result = await listTasks(filters);

    expect(result.total).toBe(42);
    expect(result.page).toBe(21); // offset 40 / limit 2 + 1
    expect(result.totalPages).toBe(21);
    expect(result.hasMore).toBe(false); // 40 + 2 items === total
    expect(result.nextCursor).toBeNull();
  });

  it("returns a nextCursor instead of a total in cursor mode", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([row(101), row(102)] as never);

    const filters = taskFiltersSchema.parse({ cursor: "100", limit: "2" });
    const result = await listTasks(filters);

    expect(advanceSQL.advanceCount).not.toHaveBeenCalled();
    expect(result.total).toBeNull();
    expect(result.hasMore).toBe(true); // got a full page, so there may be more
    expect(result.nextCursor).toBe(102); // id of the last row
  });
});
