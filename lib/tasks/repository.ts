import type { RowDataPacket } from "mysql2/promise";
import {
  advanceCount,
  advanceDelete,
  advanceDeleteAll,
  advanceInsert,
  advanceSelect,
  advanceUpdate,
} from "@/lib/db/advanceSQL";
import type { Condition } from "@/lib/db/queryBuilder";
import type { AuthUser } from "@/lib/auth";
import type { CreateTaskInput, Task, TaskRow, UpdateTaskInput } from "@/lib/types";
import type { SortableField, TaskFiltersInput } from "@/lib/validation/task";

const TABLE = "tasks";

type TaskRowPacket = TaskRow & RowDataPacket;

/** Converts a database row (snake_case columns) into the API's task shape (camelCase fields). This is the one place in the codebase that knows the column mapping, so it's also the only place that needs to change if a column is ever renamed. */
export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    description: row.description,
    status: row.status,
    visible: Boolean(row.visible),
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function createInputToRow(input: CreateTaskInput, user: AuthUser): Record<string, unknown> {
  return {
    parent_id: input.parentId ?? null,
    title: input.title,
    description: input.description ?? null,
    status: input.status ?? "todo",
    visible: input.visible ?? true,
    start_time: input.startTime,
    end_time: input.endTime,
    created_by_id: user.id,
    created_by_name: user.name,
  };
}

function updateInputToRow(input: UpdateTaskInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.parentId !== undefined) row.parent_id = input.parentId;
  if (input.title !== undefined) row.title = input.title;
  if (input.description !== undefined) row.description = input.description;
  if (input.status !== undefined) row.status = input.status;
  if (input.visible !== undefined) row.visible = input.visible;
  if (input.startTime !== undefined) row.start_time = input.startTime;
  if (input.endTime !== undefined) row.end_time = input.endTime;
  return row;
}

const SORT_FIELD_TO_COLUMN: Record<SortableField, string> = {
  id: "id",
  title: "title",
  status: "status",
  startTime: "start_time",
  endTime: "end_time",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

/** Translates parsed query filters into a query-builder `Condition`. */
export function filtersToCondition(filters: TaskFiltersInput): Condition {
  const condition: Condition = {};

  if (filters.id?.length) condition.__IN = { ...condition.__IN, id: filters.id };
  if (filters.status?.length) condition.__IN = { ...condition.__IN, status: filters.status };
  if (filters.creator) condition.created_by_id = filters.creator;
  if (filters.parentId !== undefined) condition.parent_id = filters.parentId;
  if (filters.visible !== undefined) condition.visible = filters.visible;

  const timeColumn = filters.timeField === "end" ? "end_time" : "start_time";
  if (filters.from && filters.to) {
    condition.__BETWEEN = { [timeColumn]: [filters.from, filters.to] };
  } else if (filters.from) {
    condition.__GREATER = { [timeColumn]: filters.from };
  } else if (filters.to) {
    condition.__LESSER = { [timeColumn]: filters.to };
  }

  if (filters.search) {
    condition.__SEARCH = { columns: ["title", "description"], term: filters.search };
  }

  if (filters.cursor !== undefined) {
    // Keyset pagination: instead of skipping rows with OFFSET, ask directly
    // for rows with id greater than the last one the client saw. This is a
    // single indexed lookup, so it costs the same whether it's page 1 or
    // page 100,000. See the "Scaling to 1 million users" section of the
    // README for the full comparison against offset-based pagination.
    condition.__GREATER = { ...condition.__GREATER, id: filters.cursor };
    condition.__ORDERBY = [{ column: "id", asc: true }];
    condition.__LIMIT = filters.limit;
  } else {
    condition.__ORDERBY = filters.sort.map((s) => ({ column: SORT_FIELD_TO_COLUMN[s.field], asc: s.asc }));
    condition.__LIMIT = filters.limit;
    condition.__OFFSET = filters.offset;
  }

  return condition;
}

export interface TaskPage {
  items: Task[];
  limit: number;
  /** The offset that was applied. `null` when this page was fetched with `cursor` instead. */
  offset: number | null;
  /** The 1-based page number this response represents. `null` in cursor mode. */
  page: number | null;
  /** How many pages of this size exist in total. `null` in cursor mode. */
  totalPages: number | null;
  /**
   * The total number of matching rows across all pages. `null` in cursor
   * mode, because computing it would require the same expensive COUNT(*)
   * that cursor pagination exists to avoid. See the README for details.
   */
  total: number | null;
  hasMore: boolean;
  /** In cursor mode, the value to pass as the next request's `cursor`. `null` in offset mode, and `null` here too once there are no more pages. */
  nextCursor: number | null;
}

export async function listTasks(filters: TaskFiltersInput): Promise<TaskPage> {
  const condition = filtersToCondition(filters);
  const items = (await advanceSelect<TaskRowPacket>(TABLE, "*", condition)).map(rowToTask);

  if (filters.cursor !== undefined) {
    const hasMore = items.length === filters.limit;
    return {
      items,
      limit: filters.limit,
      offset: null,
      page: null,
      totalPages: null,
      total: null,
      hasMore,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  const total = await advanceCount(TABLE, condition);
  return {
    items,
    limit: filters.limit,
    offset: filters.offset,
    page: Math.floor(filters.offset / filters.limit) + 1,
    totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    total,
    hasMore: filters.offset + items.length < total,
    nextCursor: null,
  };
}

export async function getTaskById(id: number): Promise<Task | null> {
  const rows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id });
  return rows[0] ? rowToTask(rows[0]) : null;
}

export async function createTask(input: CreateTaskInput, user: AuthUser): Promise<Task> {
  const id = await advanceInsert(TABLE, createInputToRow(input, user));
  const created = await getTaskById(id);
  if (!created) throw new Error("Failed to load task immediately after insert");
  return created;
}

export async function updateTaskById(id: number, input: UpdateTaskInput): Promise<Task | null> {
  const row = updateInputToRow(input);
  if (Object.keys(row).length === 0) return getTaskById(id);
  await advanceUpdate(TABLE, row, { id });
  return getTaskById(id);
}

export async function updateTasksByIds(ids: number[], input: UpdateTaskInput): Promise<number> {
  const row = updateInputToRow(input);
  if (ids.length === 0 || Object.keys(row).length === 0) return 0;
  return advanceUpdate(TABLE, row, { __IN: { id: ids } });
}

export async function deleteTaskById(id: number): Promise<boolean> {
  const affected = await advanceDelete(TABLE, { id });
  return affected > 0;
}

export async function deleteTasksByIds(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  return advanceDelete(TABLE, { __IN: { id: ids } });
}

export async function deleteAllTasks(): Promise<number> {
  return advanceDeleteAll(TABLE);
}
