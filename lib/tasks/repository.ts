import type { PoolClient, QueryResultRow } from "pg";
import { getPool } from "@/lib/db/pool";
import { advanceCount, advanceInsert, advanceSelect, advanceUpdate, advanceDelete } from "@/lib/db/advanceSQL";
import type { Condition } from "@/lib/db/queryBuilder";
import { generateId } from "@/lib/db/id";
import type { AuthUser } from "@/lib/auth";
import type { CreateTaskInput, Task, TaskRow, UpdateTaskInput } from "@/lib/types";
import type { SortableField, TaskFiltersInput } from "@/lib/validation/task";

const TABLE = "tasks";
const EVENTS_TABLE = "task_events";
const IDEMPOTENCY_TABLE = "idempotency_keys";

type TaskRowPacket = TaskRow & QueryResultRow;
type TaskEventType = "task.created" | "task.updated" | "task.deleted";

// snake_case -> camelCase. only place that knows it.
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
    version: Number(row.version),
    deletedAt: row.deleted_at === null ? null : String(row.deleted_at),
  };
}

function createInputToRow(input: CreateTaskInput, user: AuthUser): Record<string, unknown> {
  return {
    // offline-created tasks bring their own id so they can keep it after sync;
    // anything else gets a server-generated ULID.
    id: input.id ?? generateId(),
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

// filters -> Condition. `viewerId`, when given, scopes results to what that user
// is allowed to see: their own tasks, plus everyone's visible ones.
export function filtersToCondition(filters: TaskFiltersInput, viewerId?: string): Condition {
  const condition: Condition = {};

  // Tombstoned tasks never show up on the normal read path. Sync (Module 4) reads
  // task_events directly, which is how a deleted task still propagates to clients.
  condition.deleted_at = null;

  if (viewerId) {
    condition.__OR = [{ visible: true }, { created_by_id: viewerId }];
  }

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
    // keyset, not offset. ULIDs sort lexicographically by creation time, so a
    // plain string comparison on id still gives the right order. see README.
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
  offset: number | null; // null in cursor mode
  page: number | null; // null in cursor mode
  totalPages: number | null; // null in cursor mode
  total: number | null; // null in cursor mode, no free COUNT(*)
  hasMore: boolean;
  nextCursor: string | null; // set only in cursor mode
}

export async function listTasks(filters: TaskFiltersInput, viewerId?: string): Promise<TaskPage> {
  const condition = filtersToCondition(filters, viewerId);
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

// Tombstoned tasks 404 here, same as a task that never existed — a client has no
// way to tell the two apart through this call, by design.
export async function getTaskById(id: string): Promise<Task | null> {
  const rows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id, deleted_at: null });
  return rows[0] ? rowToTask(rows[0]) : null;
}

// --- transactions: every write below pairs a `tasks` mutation with a
// `task_events` row, committed or rolled back together. ---

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function writeTaskEvent(
  client: PoolClient,
  taskId: string,
  actorId: string | null,
  eventType: TaskEventType,
  payload: unknown
): Promise<void> {
  await advanceInsert(
    EVENTS_TABLE,
    {
      id: generateId(),
      task_id: taskId,
      actor_id: actorId,
      event_type: eventType,
      payload: JSON.stringify(payload),
    },
    client
  );
}

export async function createTask(input: CreateTaskInput, user: AuthUser): Promise<Task> {
  return withTransaction(async (client) => {
    const id = await advanceInsert(TABLE, createInputToRow(input, user), client);
    const rows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id }, client);
    const created = rows[0] ? rowToTask(rows[0]) : null;
    if (!created) throw new Error("Failed to load task immediately after insert");
    await writeTaskEvent(client, created.id, user.id, "task.created", created);
    return created;
  });
}

export interface IdempotentCreateResult {
  task: Task;
  /** true if this request replayed a previous response instead of creating anything. */
  replayed: boolean;
}

// POST /api/tasks with an Idempotency-Key: the first request with a given key
// creates the task and stores its response; every later request with the same
// key gets that stored response back, verbatim, and creates nothing.
//
// Known gap: two requests with the same brand-new key, at the exact same time,
// can both pass the "not seen yet" check before either commits — the second
// commit then fails on the idempotency_keys primary key. Left as a rare-edge-case
// 500 rather than added retry complexity here; a client-side retry on that key
// succeeds via the now-stored row.
export async function createTaskIdempotent(
  input: CreateTaskInput,
  user: AuthUser,
  idempotencyKey?: string
): Promise<IdempotentCreateResult> {
  if (!idempotencyKey) {
    return { task: await createTask(input, user), replayed: false };
  }

  return withTransaction(async (client) => {
    const existing = await advanceSelect<{ response: Task } & QueryResultRow>(
      IDEMPOTENCY_TABLE,
      ["response"],
      { key: idempotencyKey },
      client
    );
    if (existing[0]) {
      return { task: existing[0].response, replayed: true };
    }

    const id = await advanceInsert(TABLE, createInputToRow(input, user), client);
    const rows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id }, client);
    const created = rows[0] ? rowToTask(rows[0]) : null;
    if (!created) throw new Error("Failed to load task immediately after insert");

    await writeTaskEvent(client, created.id, user.id, "task.created", created);
    await advanceInsert(
      IDEMPOTENCY_TABLE,
      {
        key: idempotencyKey,
        task_id: created.id,
        status_code: 201,
        response: JSON.stringify(created),
      },
      client
    );

    return { task: created, replayed: false };
  });
}

export type WriteOutcome =
  | { status: "ok"; task: Task }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "conflict"; current: Task };

// --- generic idempotent-outcome cache, reusing idempotency_keys beyond create ---
//
// createTaskIdempotent above only covers POST. A retried PATCH/DELETE with the
// same version can't be made safe the same way version-checking already makes
// it *correct* (a real resend after the first one committed will now see a
// version that has moved on, and come back "conflict" instead of replaying the
// original success) — which is exactly the retry pattern Module 4's sync
// protocol produces. These two helpers let any write outcome be cached and
// replayed by an idempotency key (the sync operation id), independent of
// createTaskIdempotent's create-specific path.

export async function getCachedOutcome(idempotencyKey: string): Promise<WriteOutcome | null> {
  const rows = await advanceSelect<{ response: WriteOutcome } & QueryResultRow>(
    IDEMPOTENCY_TABLE,
    ["response"],
    { key: idempotencyKey }
  );
  return rows[0]?.response ?? null;
}

async function cacheOutcome(
  client: PoolClient,
  idempotencyKey: string,
  taskId: string,
  outcome: WriteOutcome
): Promise<void> {
  const statusCode = outcome.status === "ok" ? 200 : outcome.status === "conflict" ? 409 : outcome.status === "forbidden" ? 403 : 404;
  await advanceInsert(
    IDEMPOTENCY_TABLE,
    {
      key: idempotencyKey,
      task_id: taskId,
      status_code: statusCode,
      response: JSON.stringify(outcome),
    },
    client
  );
}

// PATCH /api/tasks/:id. Rejects with "conflict" if `expectedVersion` doesn't
// match what's in the DB right now — someone else changed it first — rather than
// silently overwriting their change.
export async function updateTaskWithVersion(
  id: string,
  expectedVersion: number,
  input: UpdateTaskInput,
  actor: AuthUser
): Promise<WriteOutcome> {
  return withTransaction(async (client) => {
    const rows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id, deleted_at: null }, client);
    const current = rows[0] ? rowToTask(rows[0]) : null;
    if (!current) return { status: "not_found" };
    if (current.createdById !== actor.id) return { status: "forbidden" };
    if (current.version !== expectedVersion) return { status: "conflict", current };

    const row = updateInputToRow(input);
    row.version = current.version + 1;
    // WHERE id AND version, belt-and-braces against a write racing in between
    // the read above and this update.
    await advanceUpdate(TABLE, row, { id, version: expectedVersion }, client);

    const updatedRows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id }, client);
    const updated = rowToTask(updatedRows[0]);
    await writeTaskEvent(client, id, actor.id, "task.updated", updated);

    return { status: "ok", task: updated };
  });
}

// DELETE /api/tasks/:id. Sets `deleted_at` instead of removing the row — the
// tombstone is what lets an offline client (Module 3/4) find out a task it has
// locally was deleted elsewhere.
export async function softDeleteTaskById(id: string, actor: AuthUser): Promise<WriteOutcome> {
  return withTransaction(async (client) => {
    const rows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id, deleted_at: null }, client);
    const current = rows[0] ? rowToTask(rows[0]) : null;
    if (!current) return { status: "not_found" };
    if (current.createdById !== actor.id) return { status: "forbidden" };

    await advanceUpdate(
      TABLE,
      { deleted_at: new Date().toISOString(), version: current.version + 1 },
      { id },
      client
    );

    const updatedRows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id }, client);
    const updated = rowToTask(updatedRows[0]);
    await writeTaskEvent(client, id, actor.id, "task.deleted", updated);

    return { status: "ok", task: updated };
  });
}

// Version-checked delete, for callers (Module 4's sync protocol) that need the
// same "someone else touched this since I last saw it" detection on delete that
// updateTaskWithVersion gives PATCH. The plain DELETE /api/tasks/:id route keeps
// using softDeleteTaskById above — this is additive, not a replacement.
export async function softDeleteTaskWithVersion(
  id: string,
  expectedVersion: number,
  actor: AuthUser
): Promise<WriteOutcome> {
  return withTransaction(async (client) => {
    const rows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id, deleted_at: null }, client);
    const current = rows[0] ? rowToTask(rows[0]) : null;
    if (!current) return { status: "not_found" };
    if (current.createdById !== actor.id) return { status: "forbidden" };
    if (current.version !== expectedVersion) return { status: "conflict", current };

    await advanceUpdate(
      TABLE,
      { deleted_at: new Date().toISOString(), version: current.version + 1 },
      { id, version: expectedVersion },
      client
    );

    const updatedRows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id }, client);
    const updated = rowToTask(updatedRows[0]);
    await writeTaskEvent(client, id, actor.id, "task.deleted", updated);

    return { status: "ok", task: updated };
  });
}

// Idempotency-key-aware wrappers around the two versioned writes above, for
// Module 4: a resent sync operation with the same id replays the original
// outcome (including a cached "conflict") instead of re-evaluating the version
// check against state that has since moved on.
export async function updateTaskWithVersionIdempotent(
  id: string,
  expectedVersion: number,
  input: UpdateTaskInput,
  actor: AuthUser,
  idempotencyKey: string
): Promise<WriteOutcome> {
  return withTransaction(async (client) => {
    const existing = await advanceSelect<{ response: WriteOutcome } & QueryResultRow>(
      IDEMPOTENCY_TABLE,
      ["response"],
      { key: idempotencyKey },
      client
    );
    if (existing[0]) return existing[0].response;

    const rows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id, deleted_at: null }, client);
    const current = rows[0] ? rowToTask(rows[0]) : null;

    let outcome: WriteOutcome;
    if (!current) {
      outcome = { status: "not_found" };
    } else if (current.createdById !== actor.id) {
      outcome = { status: "forbidden" };
    } else if (current.version !== expectedVersion) {
      outcome = { status: "conflict", current };
    } else {
      const row = updateInputToRow(input);
      row.version = current.version + 1;
      await advanceUpdate(TABLE, row, { id, version: expectedVersion }, client);
      const updatedRows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id }, client);
      const updated = rowToTask(updatedRows[0]);
      await writeTaskEvent(client, id, actor.id, "task.updated", updated);
      outcome = { status: "ok", task: updated };
    }

    await cacheOutcome(client, idempotencyKey, id, outcome);
    return outcome;
  });
}

export async function softDeleteTaskWithVersionIdempotent(
  id: string,
  expectedVersion: number,
  actor: AuthUser,
  idempotencyKey: string
): Promise<WriteOutcome> {
  return withTransaction(async (client) => {
    const existing = await advanceSelect<{ response: WriteOutcome } & QueryResultRow>(
      IDEMPOTENCY_TABLE,
      ["response"],
      { key: idempotencyKey },
      client
    );
    if (existing[0]) return existing[0].response;

    const rows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id, deleted_at: null }, client);
    const current = rows[0] ? rowToTask(rows[0]) : null;

    let outcome: WriteOutcome;
    if (!current) {
      outcome = { status: "not_found" };
    } else if (current.createdById !== actor.id) {
      outcome = { status: "forbidden" };
    } else if (current.version !== expectedVersion) {
      outcome = { status: "conflict", current };
    } else {
      await advanceUpdate(
        TABLE,
        { deleted_at: new Date().toISOString(), version: current.version + 1 },
        { id, version: expectedVersion },
        client
      );
      const updatedRows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id }, client);
      const updated = rowToTask(updatedRows[0]);
      await writeTaskEvent(client, id, actor.id, "task.deleted", updated);
      outcome = { status: "ok", task: updated };
    }

    await cacheOutcome(client, idempotencyKey, id, outcome);
    return outcome;
  });
}


export async function updateTasksByIds(ids: string[], input: UpdateTaskInput, userId: string): Promise<number> {
  const row = updateInputToRow(input);
  if (ids.length === 0 || Object.keys(row).length === 0) return 0;
  return advanceUpdate(TABLE, row, { __IN: { id: ids }, created_by_id: userId, deleted_at: null });
}

export async function deleteTasksByIds(ids: string[], userId: string): Promise<number> {
  if (ids.length === 0) return 0;
  return advanceDelete(TABLE, { __IN: { id: ids }, created_by_id: userId });
}

// `{ all: true }` means "all of MY tasks", never the whole table.
export async function deleteAllTasks(userId: string): Promise<number> {
  return advanceDelete(TABLE, { created_by_id: userId });
}
