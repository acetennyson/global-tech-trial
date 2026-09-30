import { describe, expect, it } from "vitest";
import { generateResetToken, hashResetToken, PASSWORD_RESET_TOKEN_TTL_MS } from "../resetToken";

describe("generateResetToken", () => {
  it("produces a random token whose hash matches hashResetToken(token)", () => {
    const { token, tokenHash } = generateResetToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashResetToken(token));
  });

  it("never returns the same token twice", () => {
    const a = generateResetToken();
    const b = generateResetToken();
    expect(a.token).not.toBe(b.token);
  });

  it("sets expiresAt roughly TTL ms in the future", () => {
    const before = Date.now();
    const { expiresAt } = generateResetToken();
    const after = Date.now();
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + PASSWORD_RESET_TOKEN_TTL_MS);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + PASSWORD_RESET_TOKEN_TTL_MS);
  });
});

describe("hashResetToken", () => {
  it("is deterministic", () => {
    expect(hashResetToken("same-input")).toBe(hashResetToken("same-input"));
  });

  it("differs for different inputs", () => {
    expect(hashResetToken("a")).not.toBe(hashResetToken("b"));
  });
});
