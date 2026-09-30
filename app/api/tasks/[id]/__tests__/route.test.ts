import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/types";

vi.mock("@/lib/tasks/repository", () => ({
  getTaskById: vi.fn(),
  updateTaskWithVersion: vi.fn(),
  softDeleteTaskById: vi.fn(),
}));

const repo = await import("@/lib/tasks/repository");
const { GET, PATCH, DELETE } = await import("../route");

const authHeaders = { "x-user-id": "user-1", "x-user-name": "Ada" };
const otherUserHeaders = { "x-user-id": "user-2", "x-user-name": "Bo" };

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

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(url: string, init: RequestInit = {}) {
  return new Request(url, { ...init, headers: { ...authHeaders, ...init.headers } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/tasks/:id", () => {
  it("returns the task when it exists and is visible to the caller", async () => {
    vi.mocked(repo.getTaskById).mockResolvedValue(sampleTask);
    const res = await GET(req(`http://localhost/api/tasks/${sampleTask.id}`), ctx(sampleTask.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual(sampleTask);
  });

  it("returns 404 for a non-visible task belonging to someone else", async () => {
    vi.mocked(repo.getTaskById).mockResolvedValue({ ...sampleTask, visible: false });
    const res = await GET(
      new Request(`http://localhost/api/tasks/${sampleTask.id}`, { headers: otherUserHeaders }),
      ctx(sampleTask.id)
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the task doesn't exist", async () => {
    vi.mocked(repo.getTaskById).mockResolvedValue(null);
    const res = await GET(req("http://localhost/api/tasks/missing"), ctx("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 401 when no auth header is present", async () => {
    const res = await GET(new Request(`http://localhost/api/tasks/${sampleTask.id}`), ctx(sampleTask.id));
    expect(res.status).toBe(401);
    expect(repo.getTaskById).not.toHaveBeenCalled();
  });

  it("returns 400 for a blank id", async () => {
    const res = await GET(req("http://localhost/api/tasks/%20"), ctx("   "));
    expect(res.status).toBe(400);
    expect(repo.getTaskById).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("updates and returns the task when the version matches", async () => {
    const updated = { ...sampleTask, status: "done" as const, version: 2 };
    vi.mocked(repo.updateTaskWithVersion).mockResolvedValue({ status: "ok", task: updated });

    const res = await PATCH(
      req(`http://localhost/api/tasks/${sampleTask.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done", version: 1 }),
      }),
      ctx(sampleTask.id)
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe("done");
    expect(repo.updateTaskWithVersion).toHaveBeenCalledWith(
      sampleTask.id,
      1,
      { status: "done" },
      { id: "user-1", name: "Ada" }
    );
  });

  it("returns 409 with the current task when the version is stale", async () => {
    vi.mocked(repo.updateTaskWithVersion).mockResolvedValue({ status: "conflict", current: sampleTask });

    const res = await PATCH(
      req(`http://localhost/api/tasks/${sampleTask.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done", version: 1 }),
      }),
      ctx(sampleTask.id)
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.details.current).toEqual(sampleTask);
  });

  it("returns 403 when the caller isn't the task's creator", async () => {
    vi.mocked(repo.updateTaskWithVersion).mockResolvedValue({ status: "forbidden" });

    const res = await PATCH(
      req(`http://localhost/api/tasks/${sampleTask.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done", version: 1 }),
      }),
      ctx(sampleTask.id)
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when version is missing from the body", async () => {
    const res = await PATCH(
      req(`http://localhost/api/tasks/${sampleTask.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      }),
      ctx(sampleTask.id)
    );
    expect(res.status).toBe(400);
    expect(repo.updateTaskWithVersion).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("tombstones an existing task", async () => {
    vi.mocked(repo.softDeleteTaskById).mockResolvedValue({ status: "ok", task: { ...sampleTask, deletedAt: "now" } });
    const res = await DELETE(req(`http://localhost/api/tasks/${sampleTask.id}`, { method: "DELETE" }), ctx(sampleTask.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ deleted: true, id: sampleTask.id });
  });

  it("returns 404 deleting a task that doesn't exist", async () => {
    vi.mocked(repo.softDeleteTaskById).mockResolvedValue({ status: "not_found" });
    const res = await DELETE(req("http://localhost/api/tasks/missing", { method: "DELETE" }), ctx("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the caller isn't the task's creator", async () => {
    vi.mocked(repo.softDeleteTaskById).mockResolvedValue({ status: "forbidden" });
    const res = await DELETE(req(`http://localhost/api/tasks/${sampleTask.id}`, { method: "DELETE" }), ctx(sampleTask.id));
    expect(res.status).toBe(403);
  });
});
