import { describe, expect, it } from "vitest";
import { bulkDeleteSchema, createTaskSchema, patchTaskSchema, taskFiltersSchema, updateTaskSchema } from "../task";

describe("createTaskSchema", () => {
  const base = { title: "Write tests", startTime: "2026-01-01T09:00:00Z", endTime: "2026-01-01T17:00:00Z" };

  it("accepts a minimal valid task and fills in defaults", () => {
    const result = createTaskSchema.parse(base);
    expect(result).toMatchObject({ title: "Write tests", status: "todo", visible: true });
  });

  it("rejects a missing title", () => {
    expect(() => createTaskSchema.parse({ ...base, title: "" })).toThrow();
  });

  it("rejects an endTime earlier than startTime", () => {
    expect(() =>
      createTaskSchema.parse({ ...base, startTime: "2026-01-02T00:00:00Z", endTime: "2026-01-01T00:00:00Z" })
    ).toThrow(/endTime/);
  });

  it("rejects an invalid status", () => {
    expect(() => createTaskSchema.parse({ ...base, status: "archived" })).toThrow();
  });
});

describe("updateTaskSchema", () => {
  it("rejects an empty patch", () => {
    expect(() => updateTaskSchema.parse({})).toThrow(/at least one field/i);
  });

  it("accepts a single-field patch", () => {
    expect(updateTaskSchema.parse({ status: "done" })).toEqual({ status: "done" });
  });
});

describe("patchTaskSchema", () => {
  it("requires version even when a field is provided", () => {
    expect(() => patchTaskSchema.parse({ status: "done" })).toThrow(/version/i);
  });

  it("rejects a version-only patch with no actual field to change", () => {
    expect(() => patchTaskSchema.parse({ version: 1 })).toThrow(/at least one field/i);
  });

  it("accepts a field plus version", () => {
    expect(patchTaskSchema.parse({ status: "done", version: 3 })).toEqual({ status: "done", version: 3 });
  });
});

describe("bulkDeleteSchema", () => {
  it("accepts { all: true } with no ids", () => {
    expect(bulkDeleteSchema.parse({ all: true })).toMatchObject({ all: true });
  });

  it("rejects an empty body (neither ids nor all)", () => {
    expect(() => bulkDeleteSchema.parse({})).toThrow();
  });
});

describe("taskFiltersSchema", () => {
  it("parses comma-separated id/status lists from query strings", () => {
    const result = taskFiltersSchema.parse({ id: "t1,t2,t3", status: "todo,done" });
    expect(result.id).toEqual(["t1", "t2", "t3"]);
    expect(result.status).toEqual(["todo", "done"]);
  });

  it("applies pagination and sort defaults", () => {
    const result = taskFiltersSchema.parse({});
    expect(result).toMatchObject({
      limit: 50,
      offset: 0,
      sort: [{ field: "createdAt", asc: false }],
      timeField: "start",
    });
  });

  it("parses a multi-column `sort` with `-` for descending", () => {
    const result = taskFiltersSchema.parse({ sort: "status,-startTime" });
    expect(result.sort).toEqual([
      { field: "status", asc: true },
      { field: "startTime", asc: false },
    ]);
  });

  it("rejects an unknown sort field", () => {
    expect(() => taskFiltersSchema.parse({ sort: "notAField" })).toThrow(/Unknown sort field/);
  });
});
