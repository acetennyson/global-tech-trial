export const TASK_STATUSES = ["todo", "inProgress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** API shape. camelCase. */
export interface Task {
  id: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  visible: boolean;
  startTime: string;
  endTime: string;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
}

/** pg row shape. snake_case. */
export interface TaskRow {
  id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  visible: boolean;
  start_time: Date | string;
  end_time: Date | string;
  created_by_id: string;
  created_by_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  // BIGINT comes back from `pg` as a string, to avoid silent precision loss.
  version: number | string;
  deleted_at: Date | string | null;
}

/** No createdBy* here on purpose. */
export interface CreateTaskInput {
  /** supplied by offline clients; the server generates one if omitted */
  id?: string;
  parentId?: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  visible?: boolean;
  startTime: string;
  endTime: string;
}

export type UpdateTaskInput = Partial<Omit<CreateTaskInput, "id">>;
