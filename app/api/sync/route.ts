import { withRequestLogging } from "@/lib/observability";
import { requireVerifiedEmail, resolveAuthUser } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { applySyncBatch } from "@/lib/sync/service";
import { listEventsSince } from "@/lib/sync/eventsRepository";
import { syncBatchSchema, syncPullQuerySchema } from "@/lib/sync/validation";

// Push: apply a batch of offline operations. Each operation's id is its idempotency key,
// so resending a batch (response lost) re-applies nothing and returns the same outcomes.
async function handlePOST(request: Request) {
  try {
    const user = resolveAuthUser(request);
    await requireVerifiedEmail(user.id);
    const body = await request.json();
    const { operations } = syncBatchSchema.parse(body);
    const result = await applySyncBatch(operations, user);
    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// Pull: changes since a cursor, read from task_events. That is how a deleted task
// still reaches a client that only has the old copy.
async function handleGET(request: Request) {
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

export const POST = withRequestLogging(handlePOST);
export const GET = withRequestLogging(handleGET);
