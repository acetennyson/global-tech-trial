import { withRequestLogging } from "@/lib/observability";
import { resolveAuthUser } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { createTaskIdempotent, type BulkOutcome, listTasks, softDeleteAllTasks, softDeleteTasksByIds, updateTasksByIds } from "@/lib/tasks/repository";
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

// A failed bulk write changed nothing. Same status codes as the single-task endpoints.
function bulkFailure(result: Exclude<BulkOutcome, { status: "ok" }>, verb: "edit" | "delete") {
  switch (result.status) {
    case "not_found":
      return fail(404, `Some tasks were not found: ${result.ids.join(", ")}`, { ids: result.ids });
    case "forbidden":
      return fail(403, `Only a task's creator can ${verb} it: ${result.ids.join(", ")}`, { ids: result.ids });
    case "conflict":
      return fail(409, "Some tasks were changed by someone else since you last read them", {
        conflicts: result.conflicts,
      });
  }
}

// bulk patch (one task: [id]/route.ts). All-or-nothing: every id must be one of the caller's live
// tasks (404 / 403 otherwise). Optional `versions` gives a per-task version check (409).
async function handlePATCH(request: Request) {
  try {
    const user = resolveAuthUser(request);
    const body = await request.json();
    const { ids, data, versions } = bulkUpdateSchema.parse(body);
    const result = await updateTasksByIds(ids, data, user.id, versions);
    return result.status === "ok" ? ok({ affected: result.affected }) : bulkFailure(result, "edit");
  } catch (error) {
    return toErrorResponse(error);
  }
}

// ids[] or {all:true}, never both. With ids, all-or-nothing like bulk patch. {all:true} = all of
// MY tasks. Soft delete, same as single delete.
async function handleDELETE(request: Request) {
  try {
    const user = resolveAuthUser(request);
    const body = await request.json().catch(() => ({}));
    const parsed = bulkDeleteSchema.parse(body);
    if (parsed.all) return ok({ affected: await softDeleteAllTasks(user.id) });
    const result = await softDeleteTasksByIds(parsed.ids!, user.id);
    return result.status === "ok" ? ok({ affected: result.affected }) : bulkFailure(result, "delete");
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const GET = withRequestLogging(handleGET);
export const POST = withRequestLogging(handlePOST);
export const PATCH = withRequestLogging(handlePATCH);
export const DELETE = withRequestLogging(handleDELETE);
