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

// task_events.id is a ULID, so it sorts by creation time and `id > cursor` works as a
// change-feed cursor.
// `viewerId` limits the returned events to tasks that user can see (own, or visible).
// Events for hidden tasks are skipped but still move the cursor forward, so the pull
// doesn't stall on them.
export async function listEventsSince(cursor: string | null, viewerId: string, limit = 200): Promise<EventPage> {
  const condition = cursor
    ? { __GREATER: { id: cursor }, __ORDERBY: [{ column: "id", asc: true }], __LIMIT: limit }
    : { __ORDERBY: [{ column: "id", asc: true }], __LIMIT: limit };

  const rows = await advanceSelect<TaskEventRowPacket>(EVENTS_TABLE, "*", condition);

  // A page can hold several events for one task (created, then updated). Only the
  // latest matters for current state, but all of them advance the cursor.
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
