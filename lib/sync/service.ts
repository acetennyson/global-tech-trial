import type { AuthUser } from "@/lib/auth";
import {
  createTaskIdempotent,
  softDeleteTaskWithVersionIdempotent,
  updateTaskWithVersionIdempotent,
} from "@/lib/tasks/repository";
import type { Task } from "@/lib/types";
import type { SyncOperationInput } from "./validation";

export interface SyncBatchResult {
  accepted: string[];
  conflicts: { operationId: string; current: Task }[];
  rejected: { operationId: string; error: string; permanent: boolean }[];
}

// Applies operations one at a time, in the order they arrived. Not parallelized:
// two operations in the same batch can legitimately target the same task (e.g.
// an offline client's own create-then-update-then-delete queued together), and
// applying them out of order would corrupt that task's history. Cross-task
// operations paying a small serialization cost is an acceptable trade for that
// correctness guarantee at this stage — see the handoff's exit criteria, which
// asks for correctness under retries/concurrency, not batch throughput.
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
      // Anything unexpected (DB error, etc.) is treated as transient — the
      // client's backoff will retry it, per spec: "server unavailable -> retry".
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
      // Authorization won't change on retry — permanent, same as an auth/validation error.
      result.rejected.push({ operationId, error: "Not allowed to modify this task", permanent: true });
      return;
    case "not_found":
      // A task deleted (tombstoned) or never synced from another device. Not
      // retriable as-is; the client surfaces this rather than looping forever.
      result.rejected.push({ operationId, error: "Task not found", permanent: true });
      return;
  }
}
