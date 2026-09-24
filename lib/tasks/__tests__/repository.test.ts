import { describe, expect, it } from "vitest";
import { filtersToCondition, rowToTask } from "../repository";
import type { TaskRow } from "@/lib/types";
import { taskFiltersSchema } from "@/lib/validation/task";

describe("rowToTask", () => {
  it("maps snake_case DB columns to the camelCase API shape", () => {
    const row: TaskRow = {
      id: 1,
      parent_id: null,
      title: "Ship it",
      description: null,
      status: "todo",
      visible: 1,
      start_time: "2026-01-01 09:00:00",
      end_time: "2026-01-01 17:00:00",
      created_by_id: "user-1",
      created_by_name: "Ada",
      created_at: "2026-01-01 08:00:00",
      updated_at: "2026-01-01 08:00:00",
    };

    expect(rowToTask(row)).toEqual({
      id: 1,
      parentId: null,
      title: "Ship it",
      description: null,
      status: "todo",
      visible: true,
      startTime: "2026-01-01 09:00:00",
      endTime: "2026-01-01 17:00:00",
      createdById: "user-1",
      createdByName: "Ada",
      createdAt: "2026-01-01 08:00:00",
      updatedAt: "2026-01-01 08:00:00",
    });
  });
});

describe("filtersToCondition", () => {
  it("translates status/creator filters into an __IN + equality condition", () => {
    const filters = taskFiltersSchema.parse({ status: "todo,inProgress", creator: "user-1" });
    const condition = filtersToCondition(filters);
    expect(condition.__IN).toEqual({ status: ["todo", "inProgress"] });
    expect(condition.created_by_id).toBe("user-1");
  });

  it("maps a from/to range on the requested timeField to __BETWEEN", () => {
    const filters = taskFiltersSchema.parse({
      timeField: "end",
      from: "2026-01-01T00:00:00Z",
      to: "2026-02-01T00:00:00Z",
    });
    const condition = filtersToCondition(filters);
    expect(condition.__BETWEEN).toEqual({
      end_time: ["2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"],
    });
  });

  it("falls back to a one-sided __GREATER when only `from` is given", () => {
    const filters = taskFiltersSchema.parse({ from: "2026-01-01T00:00:00Z" });
    const condition = filtersToCondition(filters);
    expect(condition.__GREATER).toEqual({ start_time: "2026-01-01T00:00:00Z" });
    expect(condition.__LESSER).toBeUndefined();
  });
});
