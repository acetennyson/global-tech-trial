import { withRequestLogging } from "@/lib/observability";
import { resolveAuthUser } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { createTaskIdempotent, listTasks, softDeleteAllTasks, softDeleteTasksByIds, updateTasksByIds } from "@/lib/tasks/repository";
import { bulkDeleteSchema, bulkUpdateSchema, createTaskSchema, searchParamsToObject, taskFiltersSchema } from "@/lib/validation/task";

// list + filter, limited to the caller's own tasks plus everyone's visible ones
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

// create. The creator comes from the JWT, never the body. A retry with the same
// Idempotency-Key returns the original task.
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

// bulk patch (one task: [id]/route.ts). Only touches the caller's tasks, other ids are
// skipped. No version check.
async function handlePATCH(request: Request) {
  try {
    const user = resolveAuthUser(request);
    const body = await request.json();
    const { ids, data } = bulkUpdateSchema.parse(body);
    const affected = await updateTasksByIds(ids, data, user.id);
    return ok({ affected });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// ids[] or {all:true}, never both. Only the caller's tasks ({all:true} = all of mine).
// Soft delete, same as single delete.
async function handleDELETE(request: Request) {
  try {
    const user = resolveAuthUser(request);
    const body = await request.json().catch(() => ({}));
    const parsed = bulkDeleteSchema.parse(body);
    const affected = parsed.all ? await softDeleteAllTasks(user.id) : await softDeleteTasksByIds(parsed.ids!, user.id);
    return ok({ affected });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const GET = withRequestLogging(handleGET);
export const POST = withRequestLogging(handlePOST);
export const PATCH = withRequestLogging(handlePATCH);
export const DELETE = withRequestLogging(handleDELETE);
