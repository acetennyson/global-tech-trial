import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/users/repository", () => ({ createUser: vi.fn() }));

vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  hitRateLimit: vi.fn(),
  checkRateLimit: vi.fn(),
  recordRateLimitHit: vi.fn(),
}));

const usersRepo = await import("@/lib/users/repository");
const rateLimit = await import("@/lib/rateLimit");
const { POST } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit.hitRateLimit).mockResolvedValue({ allowed: true });
  vi.mocked(rateLimit.checkRateLimit).mockResolvedValue({ allowed: true });

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
      user: { id: "user-1", email: "ada@example.com", passwordHash: "hashed", name: "Ada", emailVerifiedAt: null, createdAt: "2026-01-01T00:00:00Z" },
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

  it("returns 429 with Retry-After when the IP is over the limit, without creating a user", async () => {
    vi.mocked(rateLimit.hitRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });

    const response = await POST(request({ email: "ada@example.com", password: "hunter2hunter2" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(usersRepo.createUser).not.toHaveBeenCalled();
  });

  it("counts attempts per client IP", async () => {
    vi.mocked(usersRepo.createUser).mockResolvedValue({ status: "email_taken" });
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "203.0.113.7" },
      body: JSON.stringify({ email: "ada@example.com", password: "hunter2hunter2" }),
    });
    await POST(req);
    expect(rateLimit.hitRateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: "register:ip:203.0.113.7" }));
  });
});
