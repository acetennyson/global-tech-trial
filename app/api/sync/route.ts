import { resolveAuthUser } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { applySyncBatch } from "@/lib/sync/service";
import { listEventsSince } from "@/lib/sync/eventsRepository";
import { syncBatchSchema, syncPullQuerySchema } from "@/lib/sync/validation";

// Push: apply a batch of offline-originated operations. Every operation carries
// its own id, reused as the idempotency key for that specific mutation — a
// resent batch (client never saw the response) re-applies nothing, it just
// replays the same accepted/conflict/rejected outcome per operation.
export async function POST(request: Request) {
  try {
    const user = resolveAuthUser(request);
    const body = await request.json();
    const { operations } = syncBatchSchema.parse(body);
    const result = await applySyncBatch(operations, user);
    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// Pull: durable catch-up since a cursor, built off task_events (Module 1) rather
// than the tasks table directly — that's what lets a deleted task still show up
// to a client that only has the old, non-tombstoned copy.
export async function GET(request: Request) {
  try {
    const user = resolveAuthUser(request);
    const url = new URL(request.url);
    const { cursor, limit } = syncPullQuerySchema.parse(Object.fromEntries(url.searchParams));
    const page = await listEventsSince(cursor ?? null, user.id, limit);
    return ok(page);
  } catch (error) {
    return toErrorResponse(error);
  }
}
