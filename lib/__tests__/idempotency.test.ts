import { describe, expect, it } from "vitest";
import { assertSameRequest, hashRequest, IdempotencyKeyReuseError } from "../idempotency";

describe("hashRequest", () => {
  it("is stable regardless of key order and ignores undefined fields", () => {
    expect(hashRequest({ a: 1, b: { c: 2, d: 3 } })).toBe(hashRequest({ b: { d: 3, c: 2 }, a: 1, e: undefined }));
  });

  it("differs when any value differs", () => {
    expect(hashRequest({ title: "A" })).not.toBe(hashRequest({ title: "B" }));
  });
});

describe("assertSameRequest", () => {
  it("passes when hashes match, or when the stored row predates hashing (null)", () => {
    expect(() => assertSameRequest("h", "h")).not.toThrow();
    expect(() => assertSameRequest(null, "h")).not.toThrow();
  });

  it("throws IdempotencyKeyReuseError when the stored hash differs", () => {
    expect(() => assertSameRequest("old", "new")).toThrow(IdempotencyKeyReuseError);
  });
});
