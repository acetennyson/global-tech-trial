import { beforeEach, describe, expect, it, vi } from "vitest";
import { authHeaderFor } from "@/lib/testUtils/authHeader";

vi.mock("@/lib/users/repository", () => ({ findUserById: vi.fn() }));

vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  hitRateLimit: vi.fn(),
}));

const usersRepo = await import("@/lib/users/repository");
const rateLimit = await import("@/lib/rateLimit");
const { GET } = await import("../route");

const authHeaders = authHeaderFor({ id: "user-1", name: "Ada" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit.hitRateLimit).mockResolvedValue({ allowed: true });
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

function request(headers: Record<string, string> = authHeaders) {
  return new Request("http://localhost/api/auth/me", { headers });
}

const UNVERIFIED_USER = {
  id: "user-1",
  email: "ada@example.com",
  passwordHash: "hashed",
  name: "Ada",
  emailVerifiedAt: null,
  createdAt: "2026-01-01T00:00:00Z",
};

describe("GET /api/auth/me", () => {
  it("returns the caller's own profile, not the password hash", async () => {
    vi.mocked(usersRepo.findUserById).mockResolvedValue(UNVERIFIED_USER);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      id: "user-1",
      email: "ada@example.com",
      name: "Ada",
      emailVerified: false,
      emailVerifiedAt: null,
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(body.data.passwordHash).toBeUndefined();
  });

  it("reflects a verified account as emailVerified: true", async () => {
    vi.mocked(usersRepo.findUserById).mockResolvedValue({ ...UNVERIFIED_USER, emailVerifiedAt: "2026-02-01T00:00:00Z" });

    const res = await GET(request());
    const body = await res.json();

    expect(body.data.emailVerified).toBe(true);
    expect(body.data.emailVerifiedAt).toBe("2026-02-01T00:00:00Z");
  });

  it("scopes the lookup to the caller's own id from the token, not a client-supplied one", async () => {
    vi.mocked(usersRepo.findUserById).mockResolvedValue(UNVERIFIED_USER);

    await GET(request());

    expect(usersRepo.findUserById).toHaveBeenCalledWith("user-1");
  });

  it("401s with no auth header, and never queries the database", async () => {
    const res = await GET(new Request("http://localhost/api/auth/me"));

    expect(res.status).toBe(401);
    expect(usersRepo.findUserById).not.toHaveBeenCalled();
  });

  it("returns 404, not 500, if the token's user no longer exists", async () => {
    vi.mocked(usersRepo.findUserById).mockResolvedValue(null);

    const res = await GET(request());

    expect(res.status).toBe(404);
  });

  it("rate-limits per user id, not per IP, and never queries the database once over the limit", async () => {
    vi.mocked(rateLimit.hitRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 30 });

    const res = await GET(request());

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(usersRepo.findUserById).not.toHaveBeenCalled();
    const [[rule]] = vi.mocked(rateLimit.hitRateLimit).mock.calls;
    expect(rule.key).toBe("me:user:user-1");
  });
});
