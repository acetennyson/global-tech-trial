import { withRequestLogging } from "@/lib/observability";
import { resolveAuthUser } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { deleteAllTasks, deleteTasksByIds, createTaskIdempotent, listTasks, updateTasksByIds } from "@/lib/tasks/repository";
import { bulkDeleteSchema, bulkUpdateSchema, createTaskSchema, searchParamsToObject, taskFiltersSchema } from "@/lib/validation/task";

// list + filter. scoped to what the caller may see: their own tasks, plus
// everyone's visible ones.
async function handleGET(request: Request) {
  try {
    const user = resolveAuthUser(request);
    const url = new URL(request.url);
    const filters = taskFiltersSchema.parse(searchParamsToObject(url.searchParams));
    const page = await listTasks(filters, user.id);
    return ok(page);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// create. creator from headers, never body. an Idempotency-Key header makes a
// retried request return the original task instead of creating a duplicate.
async function handlePOST(request: Request) {
  try {
    const user = resolveAuthUser(request);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || undefined;
    const body = await request.json();
    const input = createTaskSchema.parse(body);
    const { task, replayed } = await createTaskIdempotent(input, user, idempotencyKey);
    return ok(task, replayed ? 200 : 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// bulk patch, one id -> [id]/route.ts instead. No version check here yet — bulk
// operations move to an async job (Module 5) rather than gaining per-row
// optimistic concurrency in this synchronous path.
async function handlePATCH(request: Request) {
  try {
    const body = await request.json();
    const { ids, data } = bulkUpdateSchema.parse(body);
    const affected = await updateTasksByIds(ids, data);
    return ok({ affected });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// ids[] or {all:true}, never both paths at once. Still a hard delete — see
// repository.ts; Module 5 converts this to a tombstoning background job.
async function handleDELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = bulkDeleteSchema.parse(body);
    const affected = parsed.all ? await deleteAllTasks() : await deleteTasksByIds(parsed.ids!);
    return ok({ affected });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const GET = withRequestLogging(handleGET);
export const POST = withRequestLogging(handlePOST);
export const PATCH = withRequestLogging(handlePATCH);
export const DELETE = withRequestLogging(handleDELETE);
