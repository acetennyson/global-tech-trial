import type { QueryResultRow } from "pg";
import { advanceSelect } from "@/lib/db/advanceSQL";
import type { Task } from "@/lib/types";

const EVENTS_TABLE = "task_events";

interface TaskEventRow {
  id: string;
  task_id: string;
  actor_id: string | null;
  event_type: "task.created" | "task.updated" | "task.deleted";
  payload: Task; // pg returns JSONB already parsed
  created_at: string;
}

type TaskEventRowPacket = TaskEventRow & QueryResultRow;

export interface SyncEvent {
  task: Task;
  deleted: boolean;
}

export interface EventPage {
  events: SyncEvent[];
  nextCursor: string | null;
}

// task_events.id is a ULID (see lib/db/id.ts), so it sorts lexicographically by
// creation time — the same property the tasks table's own cursor pagination
// relies on. That's what lets a plain "id > cursor" comparison double as a
// durable change-feed cursor with no separate sequence column.
// `viewerId` scopes the *returned* events to what that user may see (their own
// tasks, plus anything `visible`) — the same rule listTasks applies to GET
// /api/tasks. A private event for someone else's task still advances the
// cursor (it's real data the caller has now seen and shouldn't be re-sent), it
// just isn't included in `events`. Without this, any authenticated user could
// read every task's full history through the pull endpoint regardless of
// ownership or visibility.
export async function listEventsSince(cursor: string | null, viewerId: string, limit = 200): Promise<EventPage> {
  const condition = cursor
    ? { __GREATER: { id: cursor }, __ORDERBY: [{ column: "id", asc: true }], __LIMIT: limit }
    : { __ORDERBY: [{ column: "id", asc: true }], __LIMIT: limit };

  const rows = await advanceSelect<TaskEventRowPacket>(EVENTS_TABLE, "*", condition);

  // Multiple events can exist for the same task_id in one page (e.g. created
  // then updated before the client ever caught up). Only the latest matters to
  // a puller reconstructing current state, but earlier ones still advance the
  // cursor, so we fold rather than filter by recency.
  const byTaskId = new Map<string, SyncEvent>();
  for (const row of rows) {
    const visible = row.payload.visible || row.payload.createdById === viewerId;
    if (!visible) continue;
    byTaskId.set(row.task_id, { task: row.payload, deleted: row.event_type === "task.deleted" });
  }

  return {
    events: [...byTaskId.values()],
    nextCursor: rows.length > 0 ? rows[rows.length - 1].id : null,
  };
}
