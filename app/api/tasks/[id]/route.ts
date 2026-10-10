import { withRequestLogging } from "@/lib/observability";
import { requireVerifiedEmail, resolveAuthUser } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getVisibleTaskById, softDeleteTaskById, updateTaskWithVersion } from "@/lib/tasks/repository";
import { patchTaskSchema } from "@/lib/validation/task";

function parseId(raw: string): string | null {
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

type Params = { params: Promise<{ id: string }> };

// view one. A hidden task 404s, same as a missing one.
async function handleGET(request: Request, { params }: Params) {
  try {
    const user = resolveAuthUser(request);
    const id = parseId((await params).id);
    if (id === null) return fail(400, "id must be a non-empty string");

    const task = await getVisibleTaskById(id, user.id);
    if (!task) return fail(404, `Task ${id} not found`);

    return ok(task);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// update one. Needs the version the client last saw. A stale one returns 409.
// Creator only.
async function handlePATCH(request: Request, { params }: Params) {
  try {
    const user = resolveAuthUser(request);
    await requireVerifiedEmail(user.id);
    const id = parseId((await params).id);
    if (id === null) return fail(400, "id must be a non-empty string");

    const body = await request.json();
    const { version, ...input } = patchTaskSchema.parse(body);

    const result = await updateTaskWithVersion(id, version, input, user);
    switch (result.status) {
      case "not_found":
        return fail(404, `Task ${id} not found`);
      case "forbidden":
        return fail(403, "Only the task's creator can edit it");
      case "conflict":
        return fail(409, "Task was changed by someone else since you last read it", {
          current: result.current,
        });
      case "ok":
        return ok(result.task);
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}

// delete one: sets `deleted_at`, the row stays. Creator only.
async function handleDELETE(request: Request, { params }: Params) {
  try {
    const user = resolveAuthUser(request);
    await requireVerifiedEmail(user.id);
    const id = parseId((await params).id);
    if (id === null) return fail(400, "id must be a non-empty string");

    const result = await softDeleteTaskById(id, user);
    switch (result.status) {
      case "not_found":
        return fail(404, `Task ${id} not found`);
      case "forbidden":
        return fail(403, "Only the task's creator can delete it");
      case "ok":
        return ok({ deleted: true, id });
      default:
        return fail(500, "Unexpected delete outcome");
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const GET = withRequestLogging(handleGET);
export const PATCH = withRequestLogging(handlePATCH);
export const DELETE = withRequestLogging(handleDELETE);
