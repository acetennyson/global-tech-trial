import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/users/repository", () => ({
  findUserByEmail: vi.fn(),
  createPasswordResetToken: vi.fn(),
}));
vi.mock("@/lib/email/sendPasswordResetEmail", () => ({ sendPasswordResetEmail: vi.fn() }));

vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  hitRateLimit: vi.fn(),
  checkRateLimit: vi.fn(),
  recordRateLimitHit: vi.fn(),
}));

const usersRepo = await import("@/lib/users/repository");
const email = await import("@/lib/email/sendPasswordResetEmail");
const rateLimit = await import("@/lib/rateLimit");
const { POST } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit.hitRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(rateLimit.checkRateLimit).mockResolvedValue({ allowed: true });

  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

function request(body: unknown) {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const EXISTING_USER = { id: "user-1", email: "ada@example.com", passwordHash: "hashed", name: "Ada", emailVerifiedAt: null, createdAt: "2026-01-01T00:00:00Z" };

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

  it("returns the exact same 200 response, not a 500, when the email send fails for a real account", async () => {
    // Regression: a 500 here (vs 200 for unknown emails) would reveal registered emails.
    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue(EXISTING_USER);
    vi.mocked(usersRepo.createPasswordResetToken).mockResolvedValue(undefined);
    vi.mocked(email.sendPasswordResetEmail).mockRejectedValue(new Error("smtp connection refused"));

    const res = await POST(request({ email: "ada@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.message).toMatch(/if an account exists/i);
  });

  it("returns the exact same 200 response when token creation itself fails for a real account", async () => {
    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue(EXISTING_USER);
    vi.mocked(usersRepo.createPasswordResetToken).mockRejectedValue(new Error("db unavailable"));

    const res = await POST(request({ email: "ada@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.message).toMatch(/if an account exists/i);
  });

  it("returns 429 with Retry-After when the IP is over the limit, and sends nothing", async () => {
    vi.mocked(rateLimit.hitRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 600 });

    const res = await POST(request({ email: "ada@example.com" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("600");
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("over the per-email limit: same generic 200 as always, but no lookup and no email (no account oracle)", async () => {
    vi.mocked(rateLimit.hitRateLimit)
      .mockResolvedValueOnce({ allowed: true }) // ip
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 600 }); // email

    const limited = await POST(request({ email: "ada@example.com" }));
    const limitedBody = await limited.json();

    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue(null);
    vi.mocked(rateLimit.hitRateLimit).mockResolvedValue({ allowed: true });
    const unknown = await POST(request({ email: "nobody@example.com" }));

    expect(limited.status).toBe(200);
    expect(limited.status).toBe(unknown.status);
    expect(limitedBody).toEqual(await unknown.json());
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(usersRepo.createPasswordResetToken).not.toHaveBeenCalled();
  });

  it("counts the per-email limit for unknown addresses too, keyed by a hash and not the plain email", async () => {
    vi.mocked(usersRepo.findUserByEmail).mockResolvedValue(null);
    await POST(request({ email: "nobody@example.com" }));

    const keys = vi.mocked(rateLimit.hitRateLimit).mock.calls.map(([rule]) => rule.key);
    expect(keys).toHaveLength(2);
    expect(keys.some((k) => k.startsWith("forgot:email:"))).toBe(true);
    expect(keys.join()).not.toContain("nobody@example.com");
  });
});
