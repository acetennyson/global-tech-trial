import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth";
import type { Task } from "@/lib/types";
import type { SyncOperationInput } from "../validation";

vi.mock("@/lib/tasks/repository", () => ({
  createTaskIdempotent: vi.fn(),
  updateTaskWithVersionIdempotent: vi.fn(),
  softDeleteTaskWithVersionIdempotent: vi.fn(),
}));

const repo = await import("@/lib/tasks/repository");
const { applySyncBatch } = await import("../service");

const USER: AuthUser = { id: "user-1", name: "Ada" };

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    parentId: null,
    title: "t",
    description: null,
    status: "todo",
    visible: true,
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-01-01T01:00:00Z",
    createdById: USER.id,
    createdByName: USER.name,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("create operations", () => {
  it("delegates to createTaskIdempotent using the operation id as the idempotency key", async () => {
    vi.mocked(repo.createTaskIdempotent).mockResolvedValue({ task: task(), replayed: false });

    const ops: SyncOperationInput[] = [
      {
        id: "op-1",
        entityId: "t1",
        entityType: "task",
        operation: "create",
        payload: { title: "x", startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-01T01:00:00Z", status: "todo", visible: true },
      },
    ];

    const result = await applySyncBatch(ops, USER);

    expect(repo.createTaskIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1", title: "x" }),
      USER,
      "op-1"
    );
    expect(result.accepted).toEqual(["op-1"]);
    expect(result.conflicts).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
  });
});

describe("update operations", () => {
  it("accepts an ok outcome", async () => {
    vi.mocked(repo.updateTaskWithVersionIdempotent).mockResolvedValue({ status: "ok", task: task({ version: 2 }) });
    const ops: SyncOperationInput[] = [
      { id: "op-2", entityId: "t1", entityType: "task", operation: "update", payload: { title: "y", version: 1 } },
    ];

    const result = await applySyncBatch(ops, USER);

    expect(repo.updateTaskWithVersionIdempotent).toHaveBeenCalledWith("t1", 1, { title: "y" }, USER, "op-2");
    expect(result.accepted).toEqual(["op-2"]);
  });

  it("buckets a conflict outcome with the server's current task", async () => {
    const current = task({ title: "server wins", version: 3 });
    vi.mocked(repo.updateTaskWithVersionIdempotent).mockResolvedValue({ status: "conflict", current });
    const ops: SyncOperationInput[] = [
      { id: "op-3", entityId: "t1", entityType: "task", operation: "update", payload: { title: "y", version: 1 } },
    ];

    const result = await applySyncBatch(ops, USER);

    expect(result.conflicts).toEqual([{ operationId: "op-3", current }]);
    expect(result.accepted).toHaveLength(0);
  });

  it("treats forbidden and not_found as permanent rejections", async () => {
    vi.mocked(repo.updateTaskWithVersionIdempotent)
      .mockResolvedValueOnce({ status: "forbidden" })
      .mockResolvedValueOnce({ status: "not_found" });
    const ops: SyncOperationInput[] = [
      { id: "op-4", entityId: "t1", entityType: "task", operation: "update", payload: { title: "y", version: 1 } },
      { id: "op-5", entityId: "t2", entityType: "task", operation: "update", payload: { title: "y", version: 1 } },
    ];

    const result = await applySyncBatch(ops, USER);

    expect(result.rejected).toEqual([
      { operationId: "op-4", error: "Not allowed to modify this task", permanent: true },
      { operationId: "op-5", error: "Task not found", permanent: true },
    ]);
  });
});

describe("delete operations", () => {
  it("delegates to softDeleteTaskWithVersionIdempotent", async () => {
    vi.mocked(repo.softDeleteTaskWithVersionIdempotent).mockResolvedValue({ status: "ok", task: task({ deletedAt: "now" }) });
    const ops: SyncOperationInput[] = [
      { id: "op-6", entityId: "t1", entityType: "task", operation: "delete", payload: { version: 1 } },
    ];

    const result = await applySyncBatch(ops, USER);

    expect(repo.softDeleteTaskWithVersionIdempotent).toHaveBeenCalledWith("t1", 1, USER, "op-6");
    expect(result.accepted).toEqual(["op-6"]);
  });
});

describe("partial batch failure", () => {
  it("keeps processing remaining operations after one throws, marking only that one rejected+transient", async () => {
    vi.mocked(repo.createTaskIdempotent)
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce({ task: task({ id: "t2" }), replayed: false });

    const ops: SyncOperationInput[] = [
      {
        id: "op-7",
        entityId: "t1",
        entityType: "task",
        operation: "create",
        payload: { title: "a", startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-01T01:00:00Z", status: "todo", visible: true },
      },
      {
        id: "op-8",
        entityId: "t2",
        entityType: "task",
        operation: "create",
        payload: { title: "b", startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-01T01:00:00Z", status: "todo", visible: true },
      },
    ];

    const result = await applySyncBatch(ops, USER);

    expect(result.rejected).toEqual([{ operationId: "op-7", error: "connection reset", permanent: false }]);
    expect(result.accepted).toEqual(["op-8"]);
  });
});

describe("applySyncBatch: operation id reused with different content", () => {
  it("rejects it as permanent (retrying the same request can't succeed)", async () => {
    const { IdempotencyKeyReuseError } = await import("@/lib/idempotency");
    vi.mocked(repo.updateTaskWithVersionIdempotent).mockRejectedValue(new IdempotencyKeyReuseError());

    const res = await applySyncBatch(
      [{ id: "op-1", entityId: "t1", entityType: "task", operation: "update", payload: { version: 1, title: "changed" } } as SyncOperationInput],
      USER
    );

    expect(res.rejected).toEqual([{ operationId: "op-1", error: expect.any(String), permanent: true }]);
  });
});
