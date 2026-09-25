import { resolveAuthUser } from "@/lib/auth";
import { ok, toErrorResponse } from "@/lib/http";
import { deleteAllTasks, deleteTasksByIds, createTask, listTasks, updateTasksByIds } from "@/lib/tasks/repository";
import { bulkDeleteSchema, bulkUpdateSchema, createTaskSchema, searchParamsToObject, taskFiltersSchema } from "@/lib/validation/task";

// list + filter
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters = taskFiltersSchema.parse(searchParamsToObject(url.searchParams));
    const page = await listTasks(filters);
    return ok(page);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// create. creator from headers, never body.
export async function POST(request: Request) {
  try {
    const user = resolveAuthUser(request);
    const body = await request.json();
    const input = createTaskSchema.parse(body);
    const task = await createTask(input, user);
    return ok(task, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}

// bulk patch, one id -> [id]/route.ts instead
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { ids, data } = bulkUpdateSchema.parse(body);
    const affected = await updateTasksByIds(ids, data);
    return ok({ affected });
  } catch (error) {
    return toErrorResponse(error);
  }
}

// ids[] or {all:true}, never both paths at once
export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = bulkDeleteSchema.parse(body);
    const affected = parsed.all ? await deleteAllTasks() : await deleteTasksByIds(parsed.ids!);
    return ok({ affected });
  } catch (error) {
    return toErrorResponse(error);
  }
}
