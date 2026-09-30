import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";

vi.mock("@/lib/db/advanceSQL", () => ({
  advanceSelect: vi.fn(),
}));

const advanceSQL = await import("@/lib/db/advanceSQL");
const { listEventsSince } = await import("../eventsRepository");

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
    createdById: "user-1",
    createdByName: "Ada",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    version: 1,
    deletedAt: null,
    ...overrides,
  };
}

function eventRow(id: string, taskId: string, eventType: "task.created" | "task.updated" | "task.deleted", payload: Task) {
  return { id, task_id: taskId, actor_id: "user-1", event_type: eventType, payload, created_at: "2026-01-01T00:00:00Z" };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listEventsSince", () => {
  it("folds multiple events for the same task into the latest one, and advances the cursor to the last row", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([
      eventRow("e1", "t1", "task.created", task({ title: "first" })),
      eventRow("e2", "t1", "task.updated", task({ title: "second" })),
    ] as never);

    const page = await listEventsSince(null, "user-1");

    expect(page.events).toEqual([{ task: expect.objectContaining({ title: "second" }), deleted: false }]);
    expect(page.nextCursor).toBe("e2");
  });

  it("marks a task.deleted event as deleted: true", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([eventRow("e1", "t1", "task.deleted", task())] as never);

    const page = await listEventsSince(null, "user-1");

    expect(page.events[0].deleted).toBe(true);
  });

  it("returns null cursor and no events when there is nothing new", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([] as never);

    const page = await listEventsSince("some-cursor", "user-1");

    expect(page).toEqual({ events: [], nextCursor: null });
  });

  it("excludes a private task belonging to another user, but still advances the cursor past it", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([
      eventRow("e1", "t1", "task.created", task({ visible: false, createdById: "someone-else" })),
      eventRow("e2", "t2", "task.created", task({ id: "t2", visible: true })),
    ] as never);

    const page = await listEventsSince(null, "user-1");

    expect(page.events).toEqual([{ task: expect.objectContaining({ id: "t2" }), deleted: false }]);
    expect(page.nextCursor).toBe("e2"); // not stuck at e1 despite the private event being filtered out
  });

  it("includes a private task the viewer themself created", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([
      eventRow("e1", "t1", "task.created", task({ visible: false, createdById: "user-1" })),
    ] as never);

    const page = await listEventsSince(null, "user-1");

    expect(page.events).toHaveLength(1);
  });

  it("passes a __GREATER cursor condition through to advanceSelect when given", async () => {
    vi.mocked(advanceSQL.advanceSelect).mockResolvedValue([] as never);

    await listEventsSince("cursor-123", "user-1", 50);

    expect(advanceSQL.advanceSelect).toHaveBeenCalledWith(
      "task_events",
      "*",
      expect.objectContaining({ __GREATER: { id: "cursor-123" }, __LIMIT: 50 })
    );
  });
});
