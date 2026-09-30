import type { AuthUser } from "@/lib/auth";
import {
  createTaskIdempotent,
  softDeleteTaskWithVersionIdempotent,
  updateTaskWithVersionIdempotent,
} from "@/lib/tasks/repository";
import { IdempotencyKeyReuseError } from "@/lib/idempotency";
import type { Task } from "@/lib/types";
import type { SyncOperationInput } from "./validation";

export interface SyncBatchResult {
  accepted: string[];
  conflicts: { operationId: string; current: Task }[];
  rejected: { operationId: string; error: string; permanent: boolean }[];
}

// Applies operations one at a time, in arrival order. Example: a phone queues create,
// update, delete on the same task. Running them in parallel could apply the delete first.
export async function applySyncBatch(operations: SyncOperationInput[], user: AuthUser): Promise<SyncBatchResult> {
  const result: SyncBatchResult = { accepted: [], conflicts: [], rejected: [] };

  for (const op of operations) {
    try {
      switch (op.operation) {
        case "create": {
          const { id: _ignoredClientId, ...rest } = op.payload;
          void _ignoredClientId;
          const input = { ...rest, id: op.entityId };
          await createTaskIdempotent(input, user, op.id);
          result.accepted.push(op.id);
          break;
        }
        case "update": {
          const { version, ...fields } = op.payload;
          const outcome = await updateTaskWithVersionIdempotent(op.entityId, version, fields, user, op.id);
          applyOutcome(op.id, outcome, result);
          break;
        }
        case "delete": {
          const outcome = await softDeleteTaskWithVersionIdempotent(op.entityId, op.payload.version, user, op.id);
          applyOutcome(op.id, outcome, result);
          break;
        }
      }
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError) {
        // Same operation id, different content: retrying the identical request can't fix it.
        result.rejected.push({ operationId: op.id, error: error.message, permanent: true });
        continue;
      }
      // anything unexpected (DB error, etc.) is treated as temporary, so the client retries
      result.rejected.push({
        operationId: op.id,
        error: error instanceof Error ? error.message : "Unknown error applying operation",
        permanent: false,
      });
    }
  }

  return result;
}

function applyOutcome(
  operationId: string,
  outcome: { status: "ok" | "not_found" | "forbidden" | "conflict"; task?: Task; current?: Task },
  result: SyncBatchResult
): void {
  switch (outcome.status) {
    case "ok":
      result.accepted.push(operationId);
      return;
    case "conflict":
      result.conflicts.push({ operationId, current: outcome.current! });
      return;
    case "forbidden":
      // retrying won't change who owns the task
      result.rejected.push({ operationId, error: "Not allowed to modify this task", permanent: true });
      return;
    case "not_found":
      // deleted, or never synced. Retrying won't help, so the client should surface it.
      result.rejected.push({ operationId, error: "Task not found", permanent: true });
      return;
  }
}
