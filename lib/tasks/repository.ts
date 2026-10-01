import type { PoolClient, QueryResultRow } from "pg";
import { getPool } from "@/lib/db/pool";
import { advanceCount, advanceInsert, advanceSelect, advanceUpdate } from "@/lib/db/advanceSQL";
import type { Condition } from "@/lib/db/queryBuilder";
import { generateId } from "@/lib/db/id";
import type { AuthUser } from "@/lib/auth";
import { assertSameRequest, hashRequest } from "@/lib/idempotency";
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

  // Deleted tasks are hidden here. Sync reads task_events, so deletes still reach clients.
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
    // keyset, not offset: ULIDs sort by creation time, so `id > cursor` works. See README.
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

// Deleted tasks come back null, same as ones that never existed.
export async function getTaskById(id: string): Promise<Task | null> {
  const rows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id, deleted_at: null });
  return rows[0] ? rowToTask(rows[0]) : null;
}

// Same visibility rule as listTasks, for one row. A hidden task returns null, so the
// route 404s and never reveals that it exists.
export async function getVisibleTaskById(id: string, viewerId: string): Promise<Task | null> {
  const task = await getTaskById(id);
  if (!task) return null;
  if (!task.visible && task.createdById !== viewerId) return null;
  return task;
}

// Every write below saves the task change and its `task_events` row in one transaction.

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

// POST with an Idempotency-Key: the first request creates the task and stores the
// response. Retries with the same key get that response back and create nothing.
// Keys are per user: (user_id, key). Reusing a key with a different body throws
// IdempotencyKeyReuseError (422).
//
// Known gap: two simultaneous requests with the same new key can both pass the
// lookup. The second then fails on the primary key and returns a 500 (nothing is
// duplicated). Retrying the same key returns the stored task.
export async function createTaskIdempotent(
  input: CreateTaskInput,
  user: AuthUser,
  idempotencyKey?: string
): Promise<IdempotentCreateResult> {
  if (!idempotencyKey) {
    return { task: await createTask(input, user), replayed: false };
  }

  const requestHash = hashRequest({ op: "create", input });

  return withTransaction(async (client) => {
    const existing = await advanceSelect<{ response: Task; request_hash: string | null } & QueryResultRow>(
      IDEMPOTENCY_TABLE,
      ["response", "request_hash"],
      { user_id: user.id, key: idempotencyKey },
      client
    );
    if (existing[0]) {
      assertSameRequest(existing[0].request_hash, requestHash);
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
        user_id: user.id,
        key: idempotencyKey,
        request_hash: requestHash,
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

// Same idempotency table, for updates and deletes. Example: a sync client resends an
// update after losing the response. The version has already moved on, so a plain
// retry would say "conflict". With the key, it gets the original success back.

export async function getCachedOutcome(userId: string, idempotencyKey: string): Promise<WriteOutcome | null> {
  const rows = await advanceSelect<{ response: WriteOutcome } & QueryResultRow>(
    IDEMPOTENCY_TABLE,
    ["response"],
    { key: idempotencyKey }
  );
  return rows[0]?.response ?? null;
}

async function cacheOutcome(
  client: PoolClient,
  userId: string,
  idempotencyKey: string,
  requestHash: string,
  taskId: string,
  outcome: WriteOutcome
): Promise<void> {
  const statusCode = outcome.status === "ok" ? 200 : outcome.status === "conflict" ? 409 : outcome.status === "forbidden" ? 403 : 404;
  await advanceInsert(
    IDEMPOTENCY_TABLE,
    {
      user_id: userId,
      key: idempotencyKey,
      request_hash: requestHash,
      task_id: taskId,
      status_code: statusCode,
      response: JSON.stringify(outcome),
    },
    client
  );
}

// PATCH /api/tasks/:id. Returns "conflict" if `expectedVersion` is stale, so a second
// editor never overwrites the first.
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
    // also match on version, in case a write lands between the read and this update
    await advanceUpdate(TABLE, row, { id, version: expectedVersion }, client);

    const updatedRows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id }, client);
    const updated = rowToTask(updatedRows[0]);
    await writeTaskEvent(client, id, actor.id, "task.updated", updated);

    return { status: "ok", task: updated };
  });
}

// DELETE /api/tasks/:id. Sets `deleted_at` instead of removing the row, so offline
// clients can learn the task was deleted.
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

// Delete with a version check, used by sync. DELETE /api/tasks/:id uses softDeleteTaskById.
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

// The two versioned writes above, plus an idempotency key. A resent sync operation
// gets its original outcome back, even if that outcome was a conflict.
export async function updateTaskWithVersionIdempotent(
  id: string,
  expectedVersion: number,
  input: UpdateTaskInput,
  actor: AuthUser,
  idempotencyKey: string
): Promise<WriteOutcome> {
  const requestHash = hashRequest({ op: "update", id, expectedVersion, input });

  return withTransaction(async (client) => {
    const existing = await advanceSelect<{ response: WriteOutcome; request_hash: string | null } & QueryResultRow>(
      IDEMPOTENCY_TABLE,
      ["response", "request_hash"],
      { user_id: actor.id, key: idempotencyKey },
      client
    );
    if (existing[0]) {
      assertSameRequest(existing[0].request_hash, requestHash);
      return existing[0].response;
    }

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

    await cacheOutcome(client, actor.id, idempotencyKey, requestHash, id, outcome);
    return outcome;
  });
}

export async function softDeleteTaskWithVersionIdempotent(
  id: string,
  expectedVersion: number,
  actor: AuthUser,
  idempotencyKey: string
): Promise<WriteOutcome> {
  const requestHash = hashRequest({ op: "delete", id, expectedVersion });

  return withTransaction(async (client) => {
    const existing = await advanceSelect<{ response: WriteOutcome; request_hash: string | null } & QueryResultRow>(
      IDEMPOTENCY_TABLE,
      ["response", "request_hash"],
      { user_id: actor.id, key: idempotencyKey },
      client
    );
    if (existing[0]) {
      assertSameRequest(existing[0].request_hash, requestHash);
      return existing[0].response;
    }

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

    await cacheOutcome(client, actor.id, idempotencyKey, requestHash, id, outcome);
    return outcome;
  });
}

// Bulk writes are all-or-nothing, in one transaction. Every id must be a live task the caller
// created, otherwise nothing changes: an unknown or already-deleted id is `not_found` (404), someone
// else's task is `forbidden` (403), same as the single-task endpoints. Each changed task gets a
// version bump and a `task_events` row, so a device that syncs later hears about bulk edits too.
// Bulk update can also check versions per task (`versions`), and a stale one is a `conflict` (409).
// For very large sets these should become background jobs.

export type BulkOutcome =
  | { status: "ok"; affected: number }
  | { status: "not_found"; ids: string[] }
  | { status: "forbidden"; ids: string[] }
  | { status: "conflict"; conflicts: Task[] };

type BulkTargets = { failure: Exclude<BulkOutcome, { status: "ok" }> } | { failure: null; tasks: Task[] };

// Locks the rows (sorted by id, so two bulk requests can't deadlock) and checks every id.
async function lockBulkTargets(
  client: PoolClient,
  ids: string[],
  userId: string,
  versions?: Record<string, number>
): Promise<BulkTargets> {
  const unique = [...new Set(ids)];
  const result = await client.query<TaskRowPacket>(
    `SELECT * FROM ${TABLE} WHERE id = ANY($1::text[]) AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
    [unique]
  );
  const tasks = result.rows.map(rowToTask);
  const foundIds = new Set(tasks.map((task) => task.id));

  const missing = unique.filter((id) => !foundIds.has(id));
  if (missing.length > 0) return { failure: { status: "not_found", ids: missing } };

  const foreign = tasks.filter((task) => task.createdById !== userId).map((task) => task.id);
  if (foreign.length > 0) return { failure: { status: "forbidden", ids: foreign } };

  const conflicts = tasks.filter((task) => versions?.[task.id] !== undefined && versions[task.id] !== task.version);
  if (conflicts.length > 0) return { failure: { status: "conflict", conflicts } };

  return { failure: null, tasks };
}

export async function updateTasksByIds(
  ids: string[],
  input: UpdateTaskInput,
  userId: string,
  versions?: Record<string, number>
): Promise<BulkOutcome> {
  const fields = updateInputToRow(input);
  if (ids.length === 0 || Object.keys(fields).length === 0) return { status: "ok", affected: 0 };

  return withTransaction(async (client): Promise<BulkOutcome> => {
    const targets = await lockBulkTargets(client, ids, userId, versions);
    if (targets.failure) return targets.failure;

    for (const task of targets.tasks) {
      await advanceUpdate(TABLE, { ...fields, version: task.version + 1 }, { id: task.id }, client);
      const rows = await advanceSelect<TaskRowPacket>(TABLE, "*", { id: task.id }, client);
      await writeTaskEvent(client, task.id, userId, "task.updated", rowToTask(rows[0]));
    }
    return { status: "ok", affected: targets.tasks.length };
  });
}

// Tombstones the caller's tasks and writes one `task.deleted` event each, in the caller's
// transaction. Same as single delete, so a phone that syncs later hears about it.
async function softDeleteOwned(client: PoolClient, userId: string, onlyIds?: string[]): Promise<number> {
  const params: unknown[] = [userId];
  let idFilter = "";
  if (onlyIds) {
    params.push(onlyIds);
    idFilter = " AND id = ANY($2::text[])";
  }
  const result = await client.query<TaskRowPacket>(
    `UPDATE ${TABLE}
        SET deleted_at = NOW(), version = version + 1
      WHERE created_by_id = $1 AND deleted_at IS NULL${idFilter}
      RETURNING *`,
    params
  );
  for (const row of result.rows) {
    const task = rowToTask(row);
    await writeTaskEvent(client, task.id, userId, "task.deleted", task);
  }
  return result.rows.length;
}

export async function softDeleteTasksByIds(ids: string[], userId: string): Promise<BulkOutcome> {
  if (ids.length === 0) return { status: "ok", affected: 0 };
  return withTransaction(async (client): Promise<BulkOutcome> => {
    const targets = await lockBulkTargets(client, ids, userId);
    if (targets.failure) return targets.failure;
    return { status: "ok", affected: await softDeleteOwned(client, userId, targets.tasks.map((task) => task.id)) };
  });
}

// `{ all: true }` means "all of MY tasks", never the whole table.
export async function softDeleteAllTasks(userId: string): Promise<number> {
  return withTransaction((client) => softDeleteOwned(client, userId));
}

// Permanently removes tombstones older than `olderThanSeconds` (run via lib/db/purge.ts).
// A device offline longer than that must do a full resync. `task_events` is kept.
// A tombstone that still has child tasks waits until they are purged too (parent_id FK).
export async function purgeDeletedTasks(olderThanSeconds: number): Promise<number> {
  const result = await getPool().query(
    `DELETE FROM ${TABLE} t
      WHERE t.deleted_at IS NOT NULL
        AND t.deleted_at < NOW() - make_interval(secs => $1)
        AND NOT EXISTS (SELECT 1 FROM ${TABLE} c WHERE c.parent_id = t.id)`,
    [olderThanSeconds]
  );
  return result.rowCount ?? 0;
}
