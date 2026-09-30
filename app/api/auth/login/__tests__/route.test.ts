import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { verifyToken } from "@/lib/auth/jwt";

vi.mock("@/lib/users/repository", () => ({ findUserByEmail: vi.fn() }));

const usersRepo = await import("@/lib/users/repository");
const { POST } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

function request(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  it("returns a valid token for correct credentials", async () => {
    const passwordHash = await hashPassword("hunter2hunter2");
    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      passwordHash,
      name: "Ada",
      createdAt: "2026-01-01T00:00:00Z",
    });

    const response = await POST(request({ email: "ada@example.com", password: "hunter2hunter2" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(verifyToken(body.data.token)).toEqual({ sub: "user-1", name: "Ada" });
  });

  it("rejects a wrong password with 401", async () => {
    const passwordHash = await hashPassword("hunter2hunter2");
    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      passwordHash,
      name: "Ada",
      createdAt: "2026-01-01T00:00:00Z",
    });

    const response = await POST(request({ email: "ada@example.com", password: "wrong-password" }));
    expect(response.status).toBe(401);
  });

  it("rejects an unknown email with the same 401 message as a wrong password", async () => {
    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue(null);
    const response = await POST(request({ email: "nobody@example.com", password: "hunter2hunter2" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.message).toBe("Invalid email or password");
  });

  it("rejects a malformed request body with 400", async () => {
    const response = await POST(request({ email: "not-an-email", password: "" }));
    expect(response.status).toBe(400);
    expect(usersRepo.findUserByEmail).not.toHaveBeenCalled();
  });
});
