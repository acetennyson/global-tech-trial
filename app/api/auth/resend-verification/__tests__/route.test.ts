import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/users/repository", () => ({
  findUserByEmail: vi.fn(),
  createEmailVerificationToken: vi.fn(),
}));
vi.mock("@/lib/email/sendVerificationEmail", () => ({ sendVerificationEmail: vi.fn() }));

vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  hitRateLimit: vi.fn(),
}));

const usersRepo = await import("@/lib/users/repository");
const email = await import("@/lib/email/sendVerificationEmail");
const rateLimit = await import("@/lib/rateLimit");
const { POST } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit.hitRateLimit).mockResolvedValue({ allowed: true });
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

function request(body: unknown) {
  return new Request("http://localhost/api/auth/resend-verification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const UNVERIFIED_USER = {
  id: "user-1",
  email: "ada@example.com",
  passwordHash: "hashed",
  name: "Ada",
  emailVerifiedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
};

const VERIFIED_USER = { ...UNVERIFIED_USER, emailVerifiedAt: "2026-01-01T00:00:00Z" };

describe("POST /api/auth/resend-verification", () => {
  it("creates a new verification token and sends an email for an unverified account", async () => {
    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue(UNVERIFIED_USER);

    const res = await POST(request({ email: "ada@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(usersRepo.createEmailVerificationToken).toHaveBeenCalledWith("user-1", expect.any(String), expect.any(Date));
    expect(email.sendVerificationEmail).toHaveBeenCalledWith("ada@example.com", expect.stringContaining("/api/auth/verify-email?token="));
    expect(body.data.message).toMatch(/if that email is registered/i);
  });

  it("returns the exact same response, and sends nothing, for an already-verified account", async () => {
    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue(VERIFIED_USER);

    const res = await POST(request({ email: "ada@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(usersRepo.createEmailVerificationToken).not.toHaveBeenCalled();
    expect(email.sendVerificationEmail).not.toHaveBeenCalled();
    expect(body.data.message).toMatch(/if that email is registered/i);
  });

  it("returns the exact same response when the account doesn't exist, and sends no email", async () => {
    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue(null);

    const res = await POST(request({ email: "nobody@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(email.sendVerificationEmail).not.toHaveBeenCalled();
    expect(body.data.message).toMatch(/if that email is registered/i);
  });

  it("rejects an invalid email", async () => {
    const res = await POST(request({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(usersRepo.findUserByEmail).not.toHaveBeenCalled();
  });

  it("returns the exact same 200, not a 500, when the email send fails for a real unverified account", async () => {
    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue(UNVERIFIED_USER);
    vi.mocked(email.sendVerificationEmail).mockRejectedValue(new Error("smtp connection refused"));

    const res = await POST(request({ email: "ada@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.message).toMatch(/if that email is registered/i);
  });

  it("returns 429 with Retry-After when the IP is over the limit, and sends nothing", async () => {
    vi.mocked(rateLimit.hitRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 300 });

    const res = await POST(request({ email: "ada@example.com" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("300");
    expect(email.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("over the per-email limit: same generic 200, but no lookup and no email (no account oracle)", async () => {
    vi.mocked(rateLimit.hitRateLimit)
      .mockResolvedValueOnce({ allowed: true }) // ip
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 300 }); // email

    const res = await POST(request({ email: "ada@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(usersRepo.findUserByEmail).not.toHaveBeenCalled();
    expect(email.sendVerificationEmail).not.toHaveBeenCalled();
    expect(body.data.message).toMatch(/if that email is registered/i);
  });
});
