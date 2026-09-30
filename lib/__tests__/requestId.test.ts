import { describe, expect, it } from "vitest";
import { resolveRequestId } from "@/lib/requestId";

describe("resolveRequestId", () => {
  it("keeps a sane incoming ID", () => {
    expect(resolveRequestId("abc-123_X.y")).toBe("abc-123_X.y");
  });

  it("generates a UUID when none is supplied", () => {
    expect(resolveRequestId(null)).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId("")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("replaces IDs that are too long or contain odd characters", () => {
    expect(resolveRequestId("a".repeat(65))).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId("bad id\nwith newline")).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId('{"x":1}')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("generates a different ID each time", () => {
    expect(resolveRequestId(null)).not.toBe(resolveRequestId(null));
  });
});
