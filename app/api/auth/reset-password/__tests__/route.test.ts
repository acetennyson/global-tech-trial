import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashResetToken } from "@/lib/auth/resetToken";

vi.mock("@/lib/users/repository", () => ({
  findPasswordResetToken: vi.fn(),
  findUserById: vi.fn(),
  updateUserPassword: vi.fn(),
  markPasswordResetTokenUsed: vi.fn(),
}));

const usersRepo = await import("@/lib/users/repository");
const { POST } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

function request(body: unknown) {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_TOKEN = "a".repeat(64);
const USER = { id: "user-1", email: "ada@example.com", name: "Ada", passwordHash: "old-hash", createdAt: "2026-01-01T00:00:00Z" };

function validRecord(overrides: Partial<{ usedAt: string | null; expiresAt: string }> = {}) {
  return {
    userId: "user-1",
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
    usedAt: overrides.usedAt ?? null,
  };
}

describe("POST /api/auth/reset-password", () => {
  it("resets the password and returns a usable token for a valid, unused, unexpired reset token", async () => {
    vi.mocked(usersRepo.findPasswordResetToken).mockResolvedValue(validRecord());
    vi.mocked(usersRepo.findUserById).mockResolvedValue(USER);

    const res = await POST(request({ token: VALID_TOKEN, password: "newpassword123" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.user).toEqual({ id: "user-1", email: "ada@example.com", name: "Ada" });
    expect(body.data.token).toEqual(expect.any(String));

    expect(usersRepo.findPasswordResetToken).toHaveBeenCalledWith(hashResetToken(VALID_TOKEN));
    expect(usersRepo.updateUserPassword).toHaveBeenCalledWith("user-1", expect.any(String));
    // the new hash handed to the repo is not the plaintext password
    const [[, newHash]] = vi.mocked(usersRepo.updateUserPassword).mock.calls;
    expect(newHash).not.toBe("newpassword123");
    expect(usersRepo.markPasswordResetTokenUsed).toHaveBeenCalledWith(hashResetToken(VALID_TOKEN));
  });

  it("rejects an unknown token", async () => {
    vi.mocked(usersRepo.findPasswordResetToken).mockResolvedValue(null);

    const res = await POST(request({ token: VALID_TOKEN, password: "newpassword123" }));
    expect(res.status).toBe(400);
    expect(usersRepo.updateUserPassword).not.toHaveBeenCalled();
  });

  it("rejects an already-used token", async () => {
    vi.mocked(usersRepo.findPasswordResetToken).mockResolvedValue(validRecord({ usedAt: new Date().toISOString() }));

    const res = await POST(request({ token: VALID_TOKEN, password: "newpassword123" }));
    expect(res.status).toBe(400);
    expect(usersRepo.updateUserPassword).not.toHaveBeenCalled();
  });

  it("rejects an expired token", async () => {
    vi.mocked(usersRepo.findPasswordResetToken).mockResolvedValue(
      validRecord({ expiresAt: new Date(Date.now() - 1000).toISOString() })
    );

    const res = await POST(request({ token: VALID_TOKEN, password: "newpassword123" }));
    expect(res.status).toBe(400);
    expect(usersRepo.updateUserPassword).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await POST(request({ token: VALID_TOKEN, password: "short" }));
    expect(res.status).toBe(400);
    expect(usersRepo.findPasswordResetToken).not.toHaveBeenCalled();
  });
});
