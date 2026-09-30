import { z } from "zod";
import { createTaskSchema, updateFieldsShape } from "@/lib/validation/task";

// Same three operation kinds the client's SyncOperation can hold (client/src/types.ts).
export const syncOperationSchema = z.discriminatedUnion("operation", [
  z.object({
    id: z.string().trim().min(1, "operation id is required"), // doubles as the Idempotency-Key
    entityId: z.string().trim().min(1),
    entityType: z.literal("task"),
    operation: z.literal("create"),
    payload: createTaskSchema,
  }),
  z.object({
    id: z.string().trim().min(1),
    entityId: z.string().trim().min(1),
    entityType: z.literal("task"),
    operation: z.literal("update"),
    payload: z.object({ ...updateFieldsShape, version: z.coerce.number().int().positive() }),
  }),
  z.object({
    id: z.string().trim().min(1),
    entityId: z.string().trim().min(1),
    entityType: z.literal("task"),
    operation: z.literal("delete"),
    payload: z.object({ version: z.coerce.number().int().positive() }),
  }),
]);

export type SyncOperationInput = z.infer<typeof syncOperationSchema>;

export const syncBatchSchema = z.object({
  operations: z.array(syncOperationSchema).min(1, "operations must contain at least one item").max(500),
});

export const syncPullQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
