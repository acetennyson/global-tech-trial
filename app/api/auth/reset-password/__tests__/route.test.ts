import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashResetToken } from "@/lib/auth/resetToken";

vi.mock("@/lib/users/repository", () => ({
  findPasswordResetToken: vi.fn(),
  resetPasswordWithToken: vi.fn(),
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
    vi.mocked(usersRepo.resetPasswordWithToken).mockResolvedValue({ status: "ok", user: USER });

    const res = await POST(request({ token: VALID_TOKEN, password: "newpassword123" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.user).toEqual({ id: "user-1", email: "ada@example.com", name: "Ada" });
    expect(body.data.token).toEqual(expect.any(String));

    expect(usersRepo.findPasswordResetToken).toHaveBeenCalledWith(hashResetToken(VALID_TOKEN));
    // password + mark-used + invalidate-others all happen inside this single repo call (one transaction)
    expect(usersRepo.resetPasswordWithToken).toHaveBeenCalledTimes(1);
    const [[tokenHash, newHash]] = vi.mocked(usersRepo.resetPasswordWithToken).mock.calls;
    expect(tokenHash).toBe(hashResetToken(VALID_TOKEN));
    // the new hash handed to the repo is not the plaintext password
    expect(newHash).not.toBe("newpassword123");
  });

  it("returns 400 when the token is claimed or expires between the pre-check and the transaction", async () => {
    vi.mocked(usersRepo.findPasswordResetToken).mockResolvedValue(validRecord());
    vi.mocked(usersRepo.resetPasswordWithToken).mockResolvedValue({ status: "invalid_token" });

    const res = await POST(request({ token: VALID_TOKEN, password: "newpassword123" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown token", async () => {
    vi.mocked(usersRepo.findPasswordResetToken).mockResolvedValue(null);

    const res = await POST(request({ token: VALID_TOKEN, password: "newpassword123" }));
    expect(res.status).toBe(400);
    expect(usersRepo.resetPasswordWithToken).not.toHaveBeenCalled();
  });

  it("rejects an already-used token", async () => {
    vi.mocked(usersRepo.findPasswordResetToken).mockResolvedValue(validRecord({ usedAt: new Date().toISOString() }));

    const res = await POST(request({ token: VALID_TOKEN, password: "newpassword123" }));
    expect(res.status).toBe(400);
    expect(usersRepo.resetPasswordWithToken).not.toHaveBeenCalled();
  });

  it("rejects an expired token", async () => {
    vi.mocked(usersRepo.findPasswordResetToken).mockResolvedValue(
      validRecord({ expiresAt: new Date(Date.now() - 1000).toISOString() })
    );

    const res = await POST(request({ token: VALID_TOKEN, password: "newpassword123" }));
    expect(res.status).toBe(400);
    expect(usersRepo.resetPasswordWithToken).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await POST(request({ token: VALID_TOKEN, password: "short" }));
    expect(res.status).toBe(400);
    expect(usersRepo.findPasswordResetToken).not.toHaveBeenCalled();
  });
});
