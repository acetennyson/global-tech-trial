import { fail, ok, toErrorResponse } from "@/lib/http";
import { deleteTaskById, getTaskById, updateTaskById } from "@/lib/tasks/repository";
import { updateTaskSchema } from "@/lib/validation/task";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

type Params = { params: Promise<{ id: string }> };

// view one
export async function GET(_request: Request, { params }: Params) {
  try {
    const id = parseId((await params).id);
    if (id === null) return fail(400, "id must be a positive integer");

    const task = await getTaskById(id);
    if (!task) return fail(404, `Task ${id} not found`);

    return ok(task);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// update one
export async function PATCH(request: Request, { params }: Params) {
  try {
    const id = parseId((await params).id);
    if (id === null) return fail(400, "id must be a positive integer");

    const body = await request.json();
    const input = updateTaskSchema.parse(body);

    const task = await updateTaskById(id, input);
    if (!task) return fail(404, `Task ${id} not found`);

    return ok(task);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// delete one
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const id = parseId((await params).id);
    if (id === null) return fail(400, "id must be a positive integer");

    const deleted = await deleteTaskById(id);
    if (!deleted) return fail(404, `Task ${id} not found`);

    return ok({ deleted: true, id });
  } catch (error) {
    return toErrorResponse(error);
  }
}
