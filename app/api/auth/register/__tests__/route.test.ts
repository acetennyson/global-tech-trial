import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/users/repository", () => ({ createUser: vi.fn() }));

const usersRepo = await import("@/lib/users/repository");
const { POST } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

function request(body: unknown) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  it("creates a user and returns a usable token", async () => {
    vi.mocked(usersRepo.createUser).mockResolvedValue({
      status: "ok",
      user: { id: "user-1", email: "ada@example.com", passwordHash: "hashed", name: "Ada", createdAt: "2026-01-01T00:00:00Z" },
    });

    const response = await POST(request({ email: "ada@example.com", password: "hunter2hunter2", name: "Ada" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.user).toEqual({ id: "user-1", email: "ada@example.com", name: "Ada" });
    expect(body.data.token).toEqual(expect.any(String));
    // never echoes the hash back
    expect(JSON.stringify(body)).not.toContain("hashed");

    // password handed to the repository is hashed, not plaintext
    const [[createArgs]] = vi.mocked(usersRepo.createUser).mock.calls;
    expect(createArgs.passwordHash).not.toBe("hunter2hunter2");
  });

  it("rejects a password shorter than 8 characters", async () => {
    const response = await POST(request({ email: "ada@example.com", password: "short" }));
    expect(response.status).toBe(400);
    expect(usersRepo.createUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const response = await POST(request({ email: "not-an-email", password: "hunter2hunter2" }));
    expect(response.status).toBe(400);
  });

  it("returns 409 without leaking whether it was checked first, when the email is already taken", async () => {
    vi.mocked(usersRepo.createUser).mockResolvedValue({ status: "email_taken" });
    const response = await POST(request({ email: "ada@example.com", password: "hunter2hunter2" }));
    expect(response.status).toBe(409);
  });
});
