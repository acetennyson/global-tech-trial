export const TASK_STATUSES = ["todo", "inProgress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** A task as returned by the API (camelCase, JSON-friendly). */
export interface Task {
  id: number;
  parentId: number | null; // id of the parent task, if this is a subtask
  title: string;
  description: string | null;
  status: TaskStatus;
  visible: boolean; // false = only the creator can see it
  startTime: string; // ISO 8601, maps to `start_time`
  endTime: string; // ISO 8601, maps to `end_time`
  createdById: string; // resolved from auth data, never from client input
  createdByName: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** Raw shape returned by mysql2 (snake_case columns). */
export interface TaskRow {
  id: number;
  parent_id: number | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  visible: number; // MySQL TINYINT(1)
  start_time: Date | string;
  end_time: Date | string;
  created_by_id: string;
  created_by_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/** Fields a client may submit when creating a task. `createdBy*` is never accepted from the body. */
export interface CreateTaskInput {
  parentId?: number | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  visible?: boolean;
  startTime: string;
  endTime: string;
}

/** Fields a client may submit when updating a task. Everything is optional. */
export type UpdateTaskInput = Partial<CreateTaskInput>;

/** Query-string filters accepted by `GET /api/tasks`. */
export interface TaskFilters {
  id?: number[];
  status?: TaskStatus[];
  creator?: string;
  timeField?: "start" | "end";
  from?: string;
  to?: string;
  parentId?: number | null;
  visible?: boolean;
  search?: string;
  orderBy?: string;
  asc?: boolean;
  limit?: number;
  offset?: number;
}
