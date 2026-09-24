import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";

vi.mock("@/lib/tasks/repository", () => ({
  getTaskById: vi.fn(),
  updateTaskById: vi.fn(),
  deleteTaskById: vi.fn(),
}));

const repo = await import("@/lib/tasks/repository");
const { GET, PATCH, DELETE } = await import("../route");

const sampleTask: Task = {
  id: 1,
  parentId: null,
  title: "Ship it",
  description: null,
  status: "todo",
  visible: true,
  startTime: "2026-01-01T09:00:00.000Z",
  endTime: "2026-01-01T17:00:00.000Z",
  createdById: "user-1",
  createdByName: "Ada",
  createdAt: "2026-01-01T08:00:00.000Z",
  updatedAt: "2026-01-01T08:00:00.000Z",
};

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/tasks/:id", () => {
  it("returns the task when it exists", async () => {
    vi.mocked(repo.getTaskById).mockResolvedValue(sampleTask);
    const res = await GET(new Request("http://localhost/api/tasks/1"), ctx("1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(sampleTask);
  });

  it("returns 404 when the task doesn't exist", async () => {
    vi.mocked(repo.getTaskById).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/tasks/999"), ctx("999"));
    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await GET(new Request("http://localhost/api/tasks/abc"), ctx("abc"));
    expect(res.status).toBe(400);
    expect(repo.getTaskById).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("updates and returns the task", async () => {
    const updated = { ...sampleTask, status: "done" as const };
    vi.mocked(repo.updateTaskById).mockResolvedValue(updated);

    const res = await PATCH(
      new Request("http://localhost/api/tasks/1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      }),
      ctx("1")
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("done");
    expect(repo.updateTaskById).toHaveBeenCalledWith(1, { status: "done" });
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("deletes an existing task", async () => {
    vi.mocked(repo.deleteTaskById).mockResolvedValue(true);
    const res = await DELETE(new Request("http://localhost/api/tasks/1", { method: "DELETE" }), ctx("1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ deleted: true, id: 1 });
  });

  it("returns 404 deleting a task that doesn't exist", async () => {
    vi.mocked(repo.deleteTaskById).mockResolvedValue(false);
    const res = await DELETE(new Request("http://localhost/api/tasks/999", { method: "DELETE" }), ctx("999"));
    expect(res.status).toBe(404);
  });
});
