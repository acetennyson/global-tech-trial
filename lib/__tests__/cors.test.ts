import { describe, expect, it } from "vitest";
import {
  corsPreflightHeaders,
  corsResponseHeaders,
  isPreflight,
  parseAllowedOrigins,
  resolveAllowOrigin,
} from "../cors";

describe("parseAllowedOrigins", () => {
  it("defaults to any origin when unset, and treats * anywhere in the list as any", () => {
    expect(parseAllowedOrigins(undefined)).toBe("*");
    expect(parseAllowedOrigins("*")).toBe("*");
    expect(parseAllowedOrigins("https://a.com, *")).toBe("*");
  });

  it("splits a list, trims it and drops trailing slashes", () => {
    expect(parseAllowedOrigins(" https://a.com/ , https://b.com ")).toEqual(["https://a.com", "https://b.com"]);
  });

  it("an empty value means nobody (CORS off)", () => {
    expect(parseAllowedOrigins("")).toEqual([]);
  });
});

describe("resolveAllowOrigin", () => {
  it("* allows everyone, even with no Origin header", () => {
    expect(resolveAllowOrigin("https://x.com", "*")).toBe("*");
    expect(resolveAllowOrigin(null, "*")).toBe("*");
  });

  it("with a list, echoes only listed origins", () => {
    expect(resolveAllowOrigin("https://a.com", ["https://a.com"])).toBe("https://a.com");
    expect(resolveAllowOrigin("https://evil.com", ["https://a.com"])).toBeNull();
    expect(resolveAllowOrigin(null, ["https://a.com"])).toBeNull();
  });
});

describe("corsResponseHeaders", () => {
  it("for *, allows all and exposes the headers a client needs, without Vary or credentials", () => {
    const h = corsResponseHeaders("https://x.com", "*");
    expect(h["Access-Control-Allow-Origin"]).toBe("*");
    expect(h["Access-Control-Expose-Headers"]).toContain("Retry-After");
    expect(h["Access-Control-Expose-Headers"]).toContain("X-Request-Id");
    expect(h).not.toHaveProperty("Vary");
    expect(h).not.toHaveProperty("Access-Control-Allow-Credentials");
  });

  it("for a list, echoes the origin and sets Vary: Origin", () => {
    const h = corsResponseHeaders("https://a.com", ["https://a.com"]);
    expect(h["Access-Control-Allow-Origin"]).toBe("https://a.com");
    expect(h.Vary).toBe("Origin");
  });

  it("sends no allow header to an unlisted origin", () => {
    const h = corsResponseHeaders("https://evil.com", ["https://a.com"]);
    expect(h).not.toHaveProperty("Access-Control-Allow-Origin");
    expect(h.Vary).toBe("Origin");
  });
});

describe("corsPreflightHeaders", () => {
  it("lists the methods and the headers the API uses", () => {
    const h = corsPreflightHeaders("https://x.com", "*");
    expect(h["Access-Control-Allow-Methods"]).toBe("GET, POST, PATCH, DELETE, OPTIONS");
    for (const name of ["Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id"]) {
      expect(h["Access-Control-Allow-Headers"]).toContain(name);
    }
    expect(h["Access-Control-Max-Age"]).toBe("86400");
  });

  it("grants nothing to an unlisted origin", () => {
    const h = corsPreflightHeaders("https://evil.com", ["https://a.com"]);
    expect(h).not.toHaveProperty("Access-Control-Allow-Origin");
    expect(h).not.toHaveProperty("Access-Control-Allow-Methods");
  });
});

describe("isPreflight", () => {
  it("needs OPTIONS plus Origin plus Access-Control-Request-Method", () => {
    const pre = new Headers({ origin: "https://x.com", "access-control-request-method": "POST" });
    expect(isPreflight("OPTIONS", pre)).toBe(true);
    expect(isPreflight("POST", pre)).toBe(false);
    expect(isPreflight("OPTIONS", new Headers({ origin: "https://x.com" }))).toBe(false);
  });
});
