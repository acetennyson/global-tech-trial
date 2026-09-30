import { beforeEach, describe, expect, it, vi } from "vitest";

describe("jwt", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
    delete process.env.JWT_EXPIRES_IN;
  });

  it("round-trips a signed token back to its payload", async () => {
    const { signToken, verifyToken } = await import("../jwt");
    const token = signToken({ sub: "user-1", name: "Ada" });
    expect(verifyToken(token)).toEqual({ sub: "user-1", name: "Ada" });
  });

  it("rejects a token signed with a different secret", async () => {
    const mod1 = await import("../jwt");
    const token = mod1.signToken({ sub: "user-1", name: "Ada" });

    vi.resetModules();
    process.env.JWT_SECRET = "a-different-secret";
    const mod2 = await import("../jwt");
    expect(mod2.verifyToken(token)).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const { signToken, verifyToken } = await import("../jwt");
    const token = signToken({ sub: "user-1", name: "Ada" });
    const tampered = token.slice(0, -2) + "xx";
    expect(verifyToken(tampered)).toBeNull();
  });

  it("rejects an expired token", async () => {
    process.env.JWT_EXPIRES_IN = "-1s"; // already expired the instant it's signed
    const { signToken, verifyToken } = await import("../jwt");
    const token = signToken({ sub: "user-1", name: "Ada" });
    expect(verifyToken(token)).toBeNull();
  });

  it("throws clearly at sign time if JWT_SECRET is missing", async () => {
    delete process.env.JWT_SECRET;
    const { signToken } = await import("../jwt");
    expect(() => signToken({ sub: "user-1", name: null })).toThrow("JWT_SECRET is not set");
  });
});
