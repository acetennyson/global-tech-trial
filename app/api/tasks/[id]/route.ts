import { resolveAuthUser } from "@/lib/auth";
import { fail, ok, toErrorResponse } from "@/lib/http";
import { getTaskById, softDeleteTaskById, updateTaskWithVersion } from "@/lib/tasks/repository";
import { patchTaskSchema } from "@/lib/validation/task";

function parseId(raw: string): string | null {
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

type Params = { params: Promise<{ id: string }> };

// view one. a task not visible to the caller (not theirs, and not `visible`)
// 404s the same as a task that doesn't exist — existence isn't leaked either way.
export async function GET(request: Request, { params }: Params) {
  try {
    const user = resolveAuthUser(request);
    const id = parseId((await params).id);
    if (id === null) return fail(400, "id must be a non-empty string");

    const task = await getTaskById(id);
    if (!task) return fail(404, `Task ${id} not found`);
    if (!task.visible && task.createdById !== user.id) return fail(404, `Task ${id} not found`);

    return ok(task);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// update one. requires the version the client last saw; a mismatch means
// someone else changed it first and comes back as 409, not a silent overwrite.
// Only the task's creator may edit it.
export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = resolveAuthUser(request);
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

// delete one — a tombstone (`deleted_at`), not a row removal. Only the task's
// creator may delete it.
export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = resolveAuthUser(request);
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
