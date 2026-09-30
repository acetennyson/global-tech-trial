import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { logger, setLogSink } from "@/lib/logger";
import { requestContext } from "@/lib/requestContext";

let lines: string[];
beforeEach(() => {
  lines = [];
  process.env.LOG_LEVEL = "debug";
  setLogSink((l) => lines.push(l));
});
afterEach(() => {
  process.env.LOG_LEVEL = "silent";
  setLogSink(null);
});

const last = () => JSON.parse(lines[lines.length - 1]);

describe("logger", () => {
  it("writes one JSON object per line with time, level and msg", () => {
    logger.info("hello", { a: 1 });
    expect(lines).toHaveLength(1);
    expect(last()).toMatchObject({ level: "info", msg: "hello", a: 1 });
    expect(new Date(last().time).toString()).not.toBe("Invalid Date");
  });

  it("adds the current request ID automatically", () => {
    requestContext.run({ requestId: "req-1" }, () => logger.info("inside"));
    logger.info("outside");
    expect(JSON.parse(lines[0]).requestId).toBe("req-1");
    expect(JSON.parse(lines[1]).requestId).toBeUndefined();
  });

  it("redacts sensitive fields", () => {
    logger.info("login", { email: "a@b.c", password: "hunter2", authToken: "abc", Authorization: "Bearer x" });
    expect(last()).toMatchObject({
      email: "a@b.c",
      password: "[redacted]",
      authToken: "[redacted]",
      Authorization: "[redacted]",
    });
  });

  it("serializes errors instead of dropping them", () => {
    logger.error("boom", { err: new Error("nope") });
    expect(last().err).toMatchObject({ name: "Error", message: "nope" });
    expect(last().err.stack).toContain("nope");
  });

  it("respects LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "warn";
    logger.info("skipped");
    logger.warn("kept");
    expect(lines).toHaveLength(1);
    process.env.LOG_LEVEL = "silent";
    logger.error("skipped too");
    expect(lines).toHaveLength(1);
  });
});
