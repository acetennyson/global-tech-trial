import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashVerificationToken } from "@/lib/auth/verificationToken";

vi.mock("@/lib/users/repository", () => ({
  verifyEmailWithToken: vi.fn(),
}));

const usersRepo = await import("@/lib/users/repository");
const { GET, POST } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
  process.env.APP_URL = "http://localhost:3000";
});

function request(token: string) {
  return new Request(`http://localhost/api/auth/verify-email?token=${encodeURIComponent(token)}`);
}

const VALID_TOKEN = "a".repeat(64);

const VERIFIED_USER = {
  id: "user-1",
  email: "ada@example.com",
  passwordHash: "hashed",
  name: "Ada",
  emailVerifiedAt: "2026-01-01T00:00:00Z",
  createdAt: "2026-01-01T00:00:00Z",
};

describe("GET /api/auth/verify-email", () => {
  it("claims the token by its hash, not the raw token, and redirects to the confirmation page", async () => {
    vi.mocked(usersRepo.verifyEmailWithToken).mockResolvedValue({ status: "ok", user: VERIFIED_USER });

    const res = await GET(request(VALID_TOKEN));

    expect(usersRepo.verifyEmailWithToken).toHaveBeenCalledWith(hashVerificationToken(VALID_TOKEN));
    expect(usersRepo.verifyEmailWithToken).not.toHaveBeenCalledWith(VALID_TOKEN); // never the plaintext token
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/verify-email/confirmed?status=ok");
  });

  it("redirects to the confirmation page with status=invalid for an unknown, used, or expired token", async () => {
    vi.mocked(usersRepo.verifyEmailWithToken).mockResolvedValue({ status: "invalid_token" });

    const res = await GET(request(VALID_TOKEN));

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/verify-email/confirmed?status=invalid");
  });

  it("rejects a missing token with 400 before touching the repository", async () => {
    const res = await GET(request(""));

    expect(res.status).toBe(400);
    expect(usersRepo.verifyEmailWithToken).not.toHaveBeenCalled();
  });
});

function postRequest(body: unknown) {
  return new Request("http://localhost/api/auth/verify-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/verify-email", () => {
  it("claims the token by its hash and returns a fresh user + token", async () => {
    vi.mocked(usersRepo.verifyEmailWithToken).mockResolvedValue({ status: "ok", user: VERIFIED_USER });

    const res = await POST(postRequest({ token: VALID_TOKEN }));
    const body = await res.json();

    expect(usersRepo.verifyEmailWithToken).toHaveBeenCalledWith(hashVerificationToken(VALID_TOKEN));
    expect(usersRepo.verifyEmailWithToken).not.toHaveBeenCalledWith(VALID_TOKEN); // never the plaintext token
    expect(res.status).toBe(200);
    expect(body.data.user).toEqual({ id: "user-1", email: "ada@example.com", name: "Ada" });
    expect(body.data.token).toEqual(expect.any(String));
  });

  it("returns 400 for an unknown, used, or expired token and never signs a token", async () => {
    vi.mocked(usersRepo.verifyEmailWithToken).mockResolvedValue({ status: "invalid_token" });

    const res = await POST(postRequest({ token: VALID_TOKEN }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.message).toMatch(/invalid or expired/i);
  });

  it("rejects a missing token with 400 before touching the repository", async () => {
    const res = await POST(postRequest({}));

    expect(res.status).toBe(400);
    expect(usersRepo.verifyEmailWithToken).not.toHaveBeenCalled();
  });
});
