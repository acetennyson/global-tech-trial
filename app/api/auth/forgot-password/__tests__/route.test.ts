import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/users/repository", () => ({
  findUserByEmail: vi.fn(),
  createPasswordResetToken: vi.fn(),
}));
vi.mock("@/lib/email/sendPasswordResetEmail", () => ({ sendPasswordResetEmail: vi.fn() }));

const usersRepo = await import("@/lib/users/repository");
const email = await import("@/lib/email/sendPasswordResetEmail");
const { POST } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

function request(body: unknown) {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const EXISTING_USER = { id: "user-1", email: "ada@example.com", passwordHash: "hashed", name: "Ada", createdAt: "2026-01-01T00:00:00Z" };

describe("POST /api/auth/forgot-password", () => {
  it("creates a reset token and sends an email when the account exists", async () => {
    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue(EXISTING_USER);
    vi.mocked(usersRepo.createPasswordResetToken).mockResolvedValue(undefined);

    const res = await POST(request({ email: "ada@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(usersRepo.createPasswordResetToken).toHaveBeenCalledWith("user-1", expect.any(String), expect.any(Date));
    expect(email.sendPasswordResetEmail).toHaveBeenCalledWith("ada@example.com", expect.stringContaining("/reset-password?token="));
    expect(body.data.message).toMatch(/if an account exists/i);
  });

  it("returns the exact same response when the account doesn't exist, and sends no email", async () => {
    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue(null);

    const res = await POST(request({ email: "nobody@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(usersRepo.createPasswordResetToken).not.toHaveBeenCalled();
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(body.data.message).toMatch(/if an account exists/i);
  });

  it("rejects an invalid email", async () => {
    const res = await POST(request({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(usersRepo.findUserByEmail).not.toHaveBeenCalled();
  });
});
