import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";
import type { TaskPage } from "@/lib/tasks/repository";
import { authHeaderFor } from "@/lib/testUtils/authHeader";

vi.mock("@/lib/tasks/repository", () => ({
  listTasks: vi.fn(),
  createTaskIdempotent: vi.fn(),
  updateTasksByIds: vi.fn(),
  deleteTasksByIds: vi.fn(),
  deleteAllTasks: vi.fn(),
}));

const repo = await import("@/lib/tasks/repository");
const { GET, POST, PATCH, DELETE } = await import("../route");

const authHeaders = authHeaderFor({ id: "user-1", name: "Ada" });

const sampleTask: Task = {
  id: "01K8XR2QC0J8Z6Y8YB2S3D5N9V",
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
  version: 1,
  deletedAt: null,
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
  it("lists tasks using filters parsed from the query string, scoped to the caller", async () => {
    vi.mocked(repo.listTasks).mockResolvedValue(samplePage);

    const res = await GET(
      new Request("http://localhost/api/tasks?status=todo&limit=10", { headers: authHeaders })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items).toEqual([sampleTask]);
    expect(repo.listTasks).toHaveBeenCalledWith(expect.objectContaining({ status: ["todo"], limit: 10 }), "user-1");
  });

  it("returns 401 when no auth header is present", async () => {
    const res = await GET(new Request("http://localhost/api/tasks"));
    expect(res.status).toBe(401);
    expect(repo.listTasks).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid filter value", async () => {
    const res = await GET(
      new Request("http://localhost/api/tasks?status=not-a-status", { headers: authHeaders })
    );
    expect(res.status).toBe(400);
    expect(repo.listTasks).not.toHaveBeenCalled();
  });
});

describe("POST /api/tasks", () => {
  const validBody = { title: "Ship it", startTime: "2026-01-01T09:00:00Z", endTime: "2026-01-01T17:00:00Z" };

  it("creates a task using the auth-resolved creator, not client input", async () => {
    vi.mocked(repo.createTaskIdempotent).mockResolvedValue({ task: sampleTask, replayed: false });

    const res = await POST(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders },
        body: JSON.stringify({ ...validBody, createdById: "someone-else" }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toEqual(sampleTask);
    expect(repo.createTaskIdempotent).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Ship it" }),
      { id: "user-1", name: "Ada" },
      undefined
    );
  });

  it("passes the Idempotency-Key header through, and returns 200 (not 201) on replay", async () => {
    vi.mocked(repo.createTaskIdempotent).mockResolvedValue({ task: sampleTask, replayed: true });

    const res = await POST(
      new Request("http://localhost/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "abc-123", ...authHeaders },
        body: JSON.stringify(validBody),
      })
    );

    expect(res.status).toBe(200);
    expect(repo.createTaskIdempotent).toHaveBeenCalledWith(expect.anything(), expect.anything(), "abc-123");
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
    expect(repo.createTaskIdempotent).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/tasks (bulk)", () => {
  const url = "http://localhost/api/tasks";

  it("updates every id in the list, scoped to the caller", async () => {
    vi.mocked(repo.updateTasksByIds).mockResolvedValue(3);

    const res = await PATCH(
      new Request(url, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...authHeaders },
        body: JSON.stringify({ ids: ["t1", "t2", "t3"], data: { status: "done" } }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.affected).toBe(3);
    expect(repo.updateTasksByIds).toHaveBeenCalledWith(["t1", "t2", "t3"], { status: "done" }, "user-1");
  });

  it("returns 401 when no auth header is present", async () => {
    const res = await PATCH(
      new Request(url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: ["t1"], data: { status: "done" } }),
      })
    );
    expect(res.status).toBe(401);
    expect(repo.updateTasksByIds).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/tasks (bulk)", () => {
  const url = "http://localhost/api/tasks";

  it("deletes a specific set of ids, scoped to the caller", async () => {
    vi.mocked(repo.deleteTasksByIds).mockResolvedValue(2);

    const res = await DELETE(
      new Request(url, {
        method: "DELETE",
        headers: { "content-type": "application/json", ...authHeaders },
        body: JSON.stringify({ ids: ["t1", "t2"] }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.affected).toBe(2);
    expect(repo.deleteTasksByIds).toHaveBeenCalledWith(["t1", "t2"], "user-1");
    expect(repo.deleteAllTasks).not.toHaveBeenCalled();
  });

  it("deletes all of the caller's tasks when { all: true } is sent", async () => {
    vi.mocked(repo.deleteAllTasks).mockResolvedValue(42);

    const res = await DELETE(
      new Request(url, {
        method: "DELETE",
        headers: { "content-type": "application/json", ...authHeaders },
        body: JSON.stringify({ all: true }),
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.affected).toBe(42);
    expect(repo.deleteAllTasks).toHaveBeenCalledWith("user-1");
    expect(repo.deleteTasksByIds).not.toHaveBeenCalled();
  });

  it("returns 401 without auth and never deletes anything", async () => {
    const res = await DELETE(
      new Request(url, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      })
    );
    expect(res.status).toBe(401);
    expect(repo.deleteAllTasks).not.toHaveBeenCalled();
    expect(repo.deleteTasksByIds).not.toHaveBeenCalled();
  });
});
