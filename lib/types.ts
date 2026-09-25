export const TASK_STATUSES = ["todo", "inProgress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** API shape. camelCase. */
export interface Task {
  id: number;
  parentId: number | null;
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
}

/** mysql2 shape. snake_case. */
export interface TaskRow {
  id: number;
  parent_id: number | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  visible: number;
  start_time: Date | string;
  end_time: Date | string;
  created_by_id: string;
  created_by_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/** No createdBy* here on purpose. */
export interface CreateTaskInput {
  parentId?: number | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  visible?: boolean;
  startTime: string;
  endTime: string;
}

export type UpdateTaskInput = Partial<CreateTaskInput>;
