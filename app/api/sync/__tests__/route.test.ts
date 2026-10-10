import { beforeEach, describe, expect, it, vi } from "vitest";
import { authHeaderFor } from "@/lib/testUtils/authHeader";

vi.mock("@/lib/sync/service", () => ({ applySyncBatch: vi.fn() }));
vi.mock("@/lib/sync/eventsRepository", () => ({ listEventsSince: vi.fn() }));
vi.mock("@/lib/users/repository", () => ({ findUserById: vi.fn().mockResolvedValue({ emailVerifiedAt: "2026-01-01T00:00:00Z" }) }));

const service = await import("@/lib/sync/service");
const eventsRepo = await import("@/lib/sync/eventsRepository");
const usersRepo = await import("@/lib/users/repository");
const { GET, POST } = await import("../route");

const authHeaders = authHeaderFor({ id: "user-1", name: "Ada" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/sync", () => {
  it("401s with no auth header", async () => {
    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      body: JSON.stringify({ operations: [] }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("rejects an empty operations array", async () => {
    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ operations: [] }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(service.applySyncBatch).not.toHaveBeenCalled();
  });

  it("rejects an operation missing required fields", async () => {
    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ operations: [{ id: "op-1", entityId: "t1", entityType: "task", operation: "update", payload: {} }] }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400); // update payload requires `version`
  });

  it("applies a valid batch and returns the service result", async () => {
    vi.mocked(service.applySyncBatch).mockResolvedValue({ accepted: ["op-1"], conflicts: [], rejected: [] });

    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        operations: [
          {
            id: "op-1",
            entityId: "t1",
            entityType: "task",
            operation: "create",
            payload: { title: "x", startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-01T01:00:00Z" },
          },
        ],
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.accepted).toEqual(["op-1"]);
    expect(service.applySyncBatch).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "op-1", operation: "create" })]),
      { id: "user-1", name: "Ada" }
    );
  });
});

describe("GET /api/sync", () => {
  it("401s with no auth header", async () => {
    const request = new Request("http://localhost/api/sync");
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("scopes the pull to the caller's id and returns the event page", async () => {
    vi.mocked(eventsRepo.listEventsSince).mockResolvedValue({ events: [], nextCursor: "e5" });

    const request = new Request("http://localhost/api/sync?cursor=e1&limit=10", { headers: authHeaders });
    const response = await GET(request);
    const body = await response.json();

    expect(eventsRepo.listEventsSince).toHaveBeenCalledWith("e1", "user-1", 10);
    expect(body.data.nextCursor).toBe("e5");
  });

  it("defaults limit and omits cursor when not given", async () => {
    vi.mocked(eventsRepo.listEventsSince).mockResolvedValue({ events: [], nextCursor: null });

    const request = new Request("http://localhost/api/sync", { headers: authHeaders });
    await GET(request);

    expect(eventsRepo.listEventsSince).toHaveBeenCalledWith(null, "user-1", 200);
  });
});

describe("email verification gate", () => {
  it("POST (push) returns 403 for an unverified caller and never reaches the service", async () => {
    vi.mocked(usersRepo.findUserById).mockResolvedValueOnce({ emailVerifiedAt: null } as never);

    const request = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        operations: [
          {
            id: "op-1",
            entityId: "t1",
            entityType: "task",
            operation: "create",
            payload: { title: "x", startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-01T01:00:00Z" },
          },
        ],
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(service.applySyncBatch).not.toHaveBeenCalled();
  });

  it("GET (pull) still works for an unverified caller: reads aren't gated", async () => {
    vi.mocked(usersRepo.findUserById).mockResolvedValueOnce({ emailVerifiedAt: null } as never);
    vi.mocked(eventsRepo.listEventsSince).mockResolvedValue({ events: [], nextCursor: null });

    const request = new Request("http://localhost/api/sync", { headers: authHeaders });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});
