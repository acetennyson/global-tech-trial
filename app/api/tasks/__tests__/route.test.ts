import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";
import type { TaskPage } from "@/lib/tasks/repository";

vi.mock("@/lib/tasks/repository", () => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  updateTasksByIds: vi.fn(),
  deleteTasksByIds: vi.fn(),
  deleteAllTasks: vi.fn(),
}));

const repo = await import("@/lib/tasks/repository");
const { GET, POST, PATCH, DELETE } = await import("../route");

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

beforeEach(() => {
  vi.clearAllMocks();
});

const samplePage: TaskPage = {
  items: [sampleTask],
  limit: 10,
  offset: 0,
  page: 1,
  totalPages: 1,
  total: 1,
  hasMore: false,
  nextCursor: null,
};

describe("GET /api/tasks", () => {
  it("lists tasks using filters parsed from the query string", async () => {
    vi.mocked(repo.listTasks).mockResolvedValue(samplePage);

    const res = await GET(new Request("http://localhost/api/tasks?status=todo&limit=10"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items).toEqual([sampleTask]);
    expect(repo.listTasks).toHaveBeenCalledWith(expect.objectContaining({ status: ["todo"], limit: 10 }));
  });

  it("returns 400 for an invalid filter value", async () => {
    const res = await GET(new Request("http://localhost/api/tasks?status=not-a-status"));
    expect(res.status).toBe(400);
    expect(repo.listTasks).not.toHaveBeenCalled();
  });
});

describe("POST /api/tasks", () => {
  const validBody = { title: "Ship it", startTime: "2026-01-01T09:00:00Z", endTime: "2026-01-01T17:00:00Z" };

  it("creates a task using the auth-resolved creator, not client input", async () => {
    vi.mocked(repo.createTask).mockResolvedValue(sampleTask);

    const res = await POST(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-1", "x-user-name": "Ada" },
        body: JSON.stringify({ ...validBody, createdById: "someone-else" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toEqual(sampleTask);
    expect(repo.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "Ship it" }), {
      id: "user-1",
      name: "Ada",
    });
  });

  it("returns 401 when no auth header is present", async () => {
    const res = await POST(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody),
      })
    );
    expect(res.status).toBe(401);
    expect(repo.createTask).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/tasks (bulk)", () => {
  it("updates every id in the list", async () => {
    vi.mocked(repo.updateTasksByIds).mockResolvedValue(3);

    const res = await PATCH(
      new Request("http://localhost/api/tasks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [1, 2, 3], data: { status: "done" } }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.affected).toBe(3);
    expect(repo.updateTasksByIds).toHaveBeenCalledWith([1, 2, 3], { status: "done" });
  });
});

describe("DELETE /api/tasks (bulk)", () => {
  it("deletes a specific set of ids", async () => {
    vi.mocked(repo.deleteTasksByIds).mockResolvedValue(2);

    const res = await DELETE(
      new Request("http://localhost/api/tasks", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [1, 2] }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.affected).toBe(2);
    expect(repo.deleteAllTasks).not.toHaveBeenCalled();
  });

  it("deletes every task when { all: true } is sent", async () => {
    vi.mocked(repo.deleteAllTasks).mockResolvedValue(42);

    const res = await DELETE(
      new Request("http://localhost/api/tasks", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.affected).toBe(42);
    expect(repo.deleteTasksByIds).not.toHaveBeenCalled();
  });
});
