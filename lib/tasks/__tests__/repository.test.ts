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
}));

const poolQuery = vi.fn();
const clientQuery = vi.fn();
vi.mock("@/lib/db/pool", () => ({
  getPool: () => ({
    query: poolQuery,
    connect: async () => ({ query: clientQuery, release: vi.fn() }),
  }),
}));

const advanceSQL = await import("@/lib/db/advanceSQL");
const { filtersToCondition, listTasks, rowToTask } = await import("../repository");

function row(id: string): TaskRow {
  return {
    id,
    parent_id: null,
    title: `Task ${id}`,
    description: null,
    status: "todo",
    visible: true,
    start_time: "2026-01-01 09:00:00",
    end_time: "2026-01-01 17:00:00",
    created_by_id: "user-1",
    created_by_name: "Ada",
    created_at: "2026-01-01 08:00:00",
    updated_at: "2026-01-01 08:00:00",
    version: 1,
    deleted_at: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  poolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("rowToTask", () => {
  it("maps snake_case DB columns to the camelCase API shape", () => {
    const row: TaskRow = {
      id: "01K8XR2QC0J8Z6Y8YB2S3D5N9V",
      parent_id: null,
      title: "Ship it",
      description: null,
      status: "todo",
      visible: true,
      start_time: "2026-01-01 09:00:00",
      end_time: "2026-01-01 17:00:00",
      created_by_id: "user-1",
      created_by_name: "Ada",
      created_at: "2026-01-01 08:00:00",
      updated_at: "2026-01-01 08:00:00",
      version: 1,
      deleted_at: null,
    };

    expect(rowToTask(row)).toEqual({
      id: "01K8XR2QC0J8Z6Y8YB2S3D5N9V",
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
      version: 1,
      deletedAt: null,
    });
  });

  it("coerces a BIGINT `version` (returned by pg as a string) to a number", () => {
    const withStringVersion: TaskRow = { ...row("t1"), version: "7" };
    expect(rowToTask(withStringVersion).version).toBe(7);
  });

  it("stringifies a non-null deleted_at rather than passing the Date through", () => {
    const deleted: TaskRow = { ...row("t1"), deleted_at: "2026-01-02 00:00:00" };
    expect(rowToTask(deleted).deletedAt).toBe("2026-01-02 00:00:00");
  });
});

describe("filtersToCondition", () => {
  it("always excludes tombstoned (soft-deleted) tasks", () => {
    const filters = taskFiltersSchema.parse({});
    expect(filtersToCondition(filters).deleted_at).toBeNull();
  });

  it("adds a visible-OR-own-task authorization clause when a viewerId is given", () => {
    const filters = taskFiltersSchema.parse({});
    expect(filtersToCondition(filters).__OR).toBeUndefined();
    expect(filtersToCondition(filters, "user-1").__OR).toEqual([{ visible: true }, { created_by_id: "user-1" }]);
  });

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
    const filters = taskFiltersSchema.parse({
      cursor: "01K8XR2QC0J8Z6Y8YB2S3D5N9V",
      sort: "status",
      offset: "40",
      limit: "20",
    });
    const condition = filtersToCondition(filters);
    expect(condition.__GREATER).toEqual({ id: "01K8XR2QC0J8Z6Y8YB2S3D5N9V" });
    expect(condition.__ORDERBY).toEqual([{ column: "id", asc: true }]);
    expect(condition.__LIMIT).toBe(20);
    expect(condition.__OFFSET).toBeUndefined();
  });

  it("merges a cursor with an existing time-range __GREATER instead of overwriting it", () => {
    const filters = taskFiltersSchema.parse({
      cursor: "01K8XR2QC0J8Z6Y8YB2S3D5N9V",
      from: "2026-01-01T00:00:00Z",
    });
    const condition = filtersToCondition(filters);
    expect(condition.__GREATER).toEqual({
      start_time: "2026-01-01T00:00:00Z",
      id: "01K8XR2QC0J8Z6Y8YB2S3D5N9V",
    });
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
    expect(countSql).toBe(
      "SELECT COUNT(*) AS count FROM tasks WHERE start_time >= ? AND status IN (?) AND deleted_at IS NULL"
    );
    expect(countParams).toEqual(["2026-01-01T00:00:00Z", "todo"]);
  });
});

describe("listTasks", () => {
  it("computes total/page/totalPages/hasMore in offset mode", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([row("t41"), row("t42")] as never);
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
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([row("t101"), row("t102")] as never);

    const filters = taskFiltersSchema.parse({ cursor: "t100", limit: "2" });
    const result = await listTasks(filters);

    expect(advanceSQL.advanceCount).not.toHaveBeenCalled();
    expect(result.total).toBeNull();
    expect(result.hasMore).toBe(true); // got a full page, so there may be more
    expect(result.nextCursor).toBe("t102"); // id of the last row
  });
});

describe("idempotency keys are scoped per user", () => {
  it("looks up the stored response by (user_id, key), never by key alone", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValueOnce([]); // no stored response for this user
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValueOnce([row("t1")]); // reload after insert
    vi.mocked(advanceSQL.advanceInsert).mockResolvedValue("t1");

    const { createTaskIdempotent } = await import("../repository");
    await createTaskIdempotent(
      { title: "x", status: "todo", visible: true, startTime: "2026-01-01T09:00:00Z", endTime: "2026-01-01T10:00:00Z" } as never,
      { id: "user-B", name: "Bob" },
      "shared-key"
    );

    expect(advanceSQL.advanceSelect).toHaveBeenNthCalledWith(
      1,
      "idempotency_keys",
      ["response", "request_hash"],
      { user_id: "user-B", key: "shared-key" },
      expect.anything()
    );
    const keyInsert = vi.mocked(advanceSQL.advanceInsert).mock.calls.find(([table]) => table === "idempotency_keys");
    expect(keyInsert?.[1]).toMatchObject({ user_id: "user-B", key: "shared-key" });
  });

  it("does not replay another user's stored task for the same key", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([]); // user-B has no row under this key
    vi.mocked(advanceSQL.advanceInsert).mockResolvedValue("t2");
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValueOnce([]).mockResolvedValueOnce([row("t2")]);

    const { createTaskIdempotent } = await import("../repository");
    const res = await createTaskIdempotent(
      { title: "x", status: "todo", visible: true, startTime: "2026-01-01T09:00:00Z", endTime: "2026-01-01T10:00:00Z" } as never,
      { id: "user-B", name: "Bob" },
      "key-owned-by-user-A"
    );
    expect(res.replayed).toBe(false);
  });
});

describe("idempotency key is bound to the original request", () => {
  const input = { title: "A", status: "todo", visible: true, startTime: "2026-01-01T09:00:00Z", endTime: "2026-01-01T10:00:00Z" } as never;
  const user = { id: "user-1", name: "Ada" };

  it("replays the stored task when the same key comes with the same body", async () => {
    const { hashRequest } = await import("@/lib/idempotency");
    const { createTaskIdempotent } = await import("../repository");
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValueOnce([
      { response: rowToTask(row("t1")), request_hash: hashRequest({ op: "create", input }) },
    ] as never);

    const res = await createTaskIdempotent(input, user, "k1");
    expect(res.replayed).toBe(true);
    expect(advanceSQL.advanceInsert).not.toHaveBeenCalled();
  });

  it("throws IdempotencyKeyReuseError (and creates nothing) when the same key comes with a different body", async () => {
    const { IdempotencyKeyReuseError } = await import("@/lib/idempotency");
    const { createTaskIdempotent } = await import("../repository");
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValueOnce([
      { response: rowToTask(row("t1")), request_hash: "hash-of-a-different-body" },
    ] as never);

    await expect(createTaskIdempotent(input, user, "k1")).rejects.toBeInstanceOf(IdempotencyKeyReuseError);
    expect(advanceSQL.advanceInsert).not.toHaveBeenCalled();
  });

  it("stores the request hash with a newly created key", async () => {
    const { createTaskIdempotent } = await import("../repository");
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValueOnce([]).mockResolvedValueOnce([row("t9")]);
    vi.mocked(advanceSQL.advanceInsert).mockResolvedValue("t9");

    await createTaskIdempotent(input, user, "k2");
    const keyInsert = vi.mocked(advanceSQL.advanceInsert).mock.calls.find(([t]) => t === "idempotency_keys");
    expect(keyInsert?.[1]).toHaveProperty("request_hash");
  });
});

// clientQuery stand-in: the lock SELECT returns `locked` rows, the soft-delete UPDATE returns `deleted`.
function bulkClient(locked: TaskRow[], deleted: TaskRow[] = locked) {
  clientQuery.mockImplementation(async (sql: string) => {
    if (/FOR UPDATE/.test(sql)) return { rows: locked, rowCount: locked.length };
    if (/UPDATE tasks/.test(sql)) return { rows: deleted, rowCount: deleted.length };
    return { rows: [], rowCount: 0 };
  });
}

describe("bulk delete is a tombstone, not a hard delete", () => {
  it("soft-deletes the caller's tasks and writes a task.deleted event for each", async () => {
    const { softDeleteTasksByIds } = await import("../repository");
    bulkClient([row("t1"), row("t2")]);
    vi.mocked(advanceSQL.advanceInsert).mockResolvedValue("e");

    const result = await softDeleteTasksByIds(["t1", "t2"], "user-1");

    const update = clientQuery.mock.calls.find(([sql]) => /UPDATE tasks/.test(sql as string));
    expect(update?.[0]).toContain("deleted_at = NOW()");
    expect(update?.[0]).toContain("created_by_id = $1");
    expect(update?.[0]).toContain("deleted_at IS NULL");
    expect(update?.[1]).toEqual(["user-1", ["t1", "t2"]]);
    expect(result).toEqual({ status: "ok", affected: 2 });

    const events = vi.mocked(advanceSQL.advanceInsert).mock.calls.filter(([t]) => t === "task_events");
    expect(events).toHaveLength(2);
    expect(events[0][1]).toMatchObject({ event_type: "task.deleted", actor_id: "user-1" });
    expect(advanceSQL.advanceDelete).not.toHaveBeenCalled();
  });

  it("is forbidden, and changes nothing, if any id is someone else's", async () => {
    const { softDeleteTasksByIds } = await import("../repository");
    bulkClient([row("t1"), { ...row("theirs"), created_by_id: "user-2" }]);

    const result = await softDeleteTasksByIds(["t1", "theirs"], "user-1");

    expect(result).toEqual({ status: "forbidden", ids: ["theirs"] });
    expect(clientQuery.mock.calls.some(([sql]) => /UPDATE tasks/.test(sql as string))).toBe(false);
    expect(advanceSQL.advanceInsert).not.toHaveBeenCalled();
  });

  it("is not_found, and changes nothing, if any id is unknown or already deleted", async () => {
    const { softDeleteTasksByIds } = await import("../repository");
    bulkClient([row("t1")]);

    const result = await softDeleteTasksByIds(["t1", "ghost"], "user-1");

    expect(result).toEqual({ status: "not_found", ids: ["ghost"] });
    expect(clientQuery.mock.calls.some(([sql]) => /UPDATE tasks/.test(sql as string))).toBe(false);
  });

  it("softDeleteAllTasks only ever scopes to the caller (no id filter, still owner-scoped)", async () => {
    const { softDeleteAllTasks } = await import("../repository");
    await softDeleteAllTasks("user-1");
    const update = clientQuery.mock.calls.find(([sql]) => /UPDATE tasks/.test(sql as string));
    expect(update?.[0]).toContain("created_by_id = $1");
    expect(update?.[1]).toEqual(["user-1"]);
  });

  it("does nothing for an empty id list", async () => {
    const { softDeleteTasksByIds } = await import("../repository");
    expect(await softDeleteTasksByIds([], "user-1")).toEqual({ status: "ok", affected: 0 });
    expect(clientQuery).not.toHaveBeenCalled();
  });
});

describe("bulk update is all-or-nothing, bumps versions and writes events", () => {
  it("bumps each task's version and writes a task.updated event per task", async () => {
    const { updateTasksByIds } = await import("../repository");
    bulkClient([{ ...row("t1"), version: 4 }, { ...row("t2"), version: 7 }]);
    vi.mocked(advanceSQL.advanceSelect).mockImplementation((async (_t: string, _c: unknown, cond: { id: string }) => [
      row(cond.id),
    ]) as never);
    vi.mocked(advanceSQL.advanceInsert).mockResolvedValue("e");

    const result = await updateTasksByIds(["t1", "t2", "t1"], { status: "done" }, "user-1");

    expect(result).toEqual({ status: "ok", affected: 2 });
    const updates = vi.mocked(advanceSQL.advanceUpdate).mock.calls;
    expect(updates.map(([, data, cond]) => [(cond as { id: string }).id, (data as { version: number }).version])).toEqual([
      ["t1", 5],
      ["t2", 8],
    ]);
    const events = vi.mocked(advanceSQL.advanceInsert).mock.calls.filter(([t]) => t === "task_events");
    expect(events.map(([, e]) => (e as { event_type: string }).event_type)).toEqual(["task.updated", "task.updated"]);
  });

  it("locks the rows in id order so two bulk requests cannot deadlock", async () => {
    const { updateTasksByIds } = await import("../repository");
    bulkClient([row("t1")]);
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([row("t1")] as never);
    await updateTasksByIds(["t1"], { status: "done" }, "user-1");
    const lock = clientQuery.mock.calls.find(([sql]) => /FOR UPDATE/.test(sql as string));
    expect(lock?.[0]).toMatch(/ORDER BY id FOR UPDATE/);
  });

  it("returns conflict with the current task when a supplied version is stale, and writes nothing", async () => {
    const { updateTasksByIds } = await import("../repository");
    bulkClient([{ ...row("t1"), version: 5 }, row("t2")]);

    const result = await updateTasksByIds(["t1", "t2"], { status: "done" }, "user-1", { t1: 4 });

    expect(result).toMatchObject({ status: "conflict", conflicts: [{ id: "t1", version: 5 }] });
    expect(advanceSQL.advanceUpdate).not.toHaveBeenCalled();
    expect(advanceSQL.advanceInsert).not.toHaveBeenCalled();
  });

  it("is forbidden if any id is someone else's, and not_found if any is missing", async () => {
    const { updateTasksByIds } = await import("../repository");
    bulkClient([row("t1"), { ...row("theirs"), created_by_id: "user-2" }]);
    expect(await updateTasksByIds(["t1", "theirs"], { status: "done" }, "user-1")).toEqual({ status: "forbidden", ids: ["theirs"] });

    bulkClient([row("t1")]);
    expect(await updateTasksByIds(["t1", "ghost"], { status: "done" }, "user-1")).toEqual({ status: "not_found", ids: ["ghost"] });
    expect(advanceSQL.advanceUpdate).not.toHaveBeenCalled();
  });
});

describe("purgeDeletedTasks", () => {
  it("hard-deletes only tombstones older than the window that have no child tasks", async () => {
    const { purgeDeletedTasks } = await import("../repository");
    poolQuery.mockResolvedValue({ rows: [], rowCount: 3 });

    const purged = await purgeDeletedTasks(86400);

    const [sql, params] = poolQuery.mock.calls[0];
    expect(sql).toContain("deleted_at IS NOT NULL");
    expect(sql).toContain("make_interval(secs => $1)");
    expect(sql).toContain("NOT EXISTS");
    expect(params).toEqual([86400]);
    expect(purged).toBe(3);
  });
});
