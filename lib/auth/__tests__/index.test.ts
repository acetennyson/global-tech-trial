import { beforeEach, describe, expect, it } from "vitest";
import { resolveAuthUser, UnauthenticatedError } from "../index";
import { signToken } from "../jwt";

beforeEach(() => {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
});

function requestWithHeader(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return new Request("http://localhost/api/tasks", { headers });
}

describe("resolveAuthUser", () => {
  it("returns the user encoded in a valid Bearer token", () => {
    const token = signToken({ sub: "user-1", name: "Ada" });
    expect(resolveAuthUser(requestWithHeader(`Bearer ${token}`))).toEqual({ id: "user-1", name: "Ada" });
  });

  it("throws UnauthenticatedError with no Authorization header", () => {
    expect(() => resolveAuthUser(requestWithHeader(null))).toThrow(UnauthenticatedError);
  });

  it("throws UnauthenticatedError for a non-Bearer scheme", () => {
    expect(() => resolveAuthUser(requestWithHeader("Basic dXNlcjpwYXNz"))).toThrow(UnauthenticatedError);
  });

  it("throws UnauthenticatedError for an invalid token", () => {
    expect(() => resolveAuthUser(requestWithHeader("Bearer not-a-real-token"))).toThrow(UnauthenticatedError);
  });

  it("no longer trusts x-user-id at all", () => {
    const headers = new Headers({ "x-user-id": "user-1", "x-user-name": "Ada" });
    const request = new Request("http://localhost/api/tasks", { headers });
    expect(() => resolveAuthUser(request)).toThrow(UnauthenticatedError);
  });
});
