import { z } from "zod";
import { TASK_STATUSES } from "@/lib/types";

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Must be a valid ISO 8601 date-time" });

const statusSchema = z.enum(TASK_STATUSES);

// task ids are now client- or server-generated ULID/UUID strings, not DB auto-increment ints.
const idString = z.string().trim().min(1, "id must be a non-empty string");

function withTimeOrder<T extends { startTime?: string; endTime?: string }>(value: T, ctx: z.RefinementCtx) {
  if (value.startTime && value.endTime && Date.parse(value.endTime) < Date.parse(value.startTime)) {
    ctx.addIssue({
      code: "custom",
      message: "endTime must not be before startTime",
      path: ["endTime"],
    });
  }
}

export const createTaskSchema = z
  .object({
    // client-supplied stable id for offline-created tasks; server generates one if omitted.
    id: idString.optional(),
    parentId: idString.nullish(),
    title: z.string().trim().min(1, "title is required").max(255),
    description: z.string().trim().max(5000).nullish(),
    status: statusSchema.default("todo"),
    visible: z.boolean().default(true),
    startTime: isoDateTime,
    endTime: isoDateTime,
  })
  .superRefine(withTimeOrder);

// shared by updateTaskSchema (bulk PATCH, no version) and patchTaskSchema
// (single-item PATCH, version required) so the two field sets can't drift apart.
export const updateFieldsShape = {
  parentId: idString.nullish(),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).nullish(),
  status: statusSchema.optional(),
  visible: z.boolean().optional(),
  startTime: isoDateTime.optional(),
  endTime: isoDateTime.optional(),
};

export const updateTaskSchema = z
  .object(updateFieldsShape)
  .superRefine(withTimeOrder)
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field must be provided" });

// PATCH /api/tasks/:id body: same fields, plus the version the client last saw.
// A stale version means someone else (or another device) changed the task since,
// and the request is rejected with 409 rather than silently overwritten.
export const patchTaskSchema = z
  .object({
    ...updateFieldsShape,
    version: z.coerce.number().int().positive({ message: "version is required" }),
  })
  .superRefine(withTimeOrder)
  .refine((value) => Object.keys(value).some((k) => k !== "version"), {
    message: "At least one field besides version must be provided",
  });

export const bulkUpdateSchema = z.object({
  ids: z.array(idString).min(1, "ids must contain at least one id"),
  data: updateTaskSchema,
});

export const bulkDeleteSchema = z
  .object({
    ids: z.array(idString).min(1).optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => (value.all ? true : !!value.ids?.length), {
    message: "Provide either `ids` (non-empty) or `all: true`",
  });

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const csvIds = z.string().transform((value, ctx) => {
  const parsed = z.array(idString).safeParse(splitCsv(value));
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: "Must be a comma-separated list of non-empty ids" });
    return z.NEVER;
  }
  return parsed.data;
});

const csvStatuses = z.string().transform((value, ctx) => {
  const parsed = z.array(statusSchema).safeParse(splitCsv(value));
  if (!parsed.success) {
    ctx.addIssue({
      code: "custom",
      message: `Must be a comma-separated list of: ${TASK_STATUSES.join(", ")}`,
    });
    return z.NEVER;
  }
  return parsed.data;
});

const SORTABLE_FIELDS = ["id", "title", "status", "startTime", "endTime", "createdAt", "updatedAt"] as const;
export type SortableField = (typeof SORTABLE_FIELDS)[number];

export interface SortField {
  field: SortableField;
  asc: boolean;
}

const DEFAULT_SORT: SortField[] = [{ field: "createdAt", asc: false }];

// "-field" = desc, "+field"/"field" = asc, comma = tiebreak order
const sortSchema = z.string().transform((value, ctx) => {
  const specs: SortField[] = [];
  for (const raw of splitCsv(value)) {
    const desc = raw.startsWith("-");
    const field = desc ? raw.slice(1) : raw.startsWith("+") ? raw.slice(1) : raw;
    const parsed = z.enum(SORTABLE_FIELDS).safeParse(field);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown sort field "${field}". Allowed: ${SORTABLE_FIELDS.join(", ")}`,
      });
      return z.NEVER;
    }
    specs.push({ field: parsed.data, asc: !desc });
  }
  return specs;
});

export const taskFiltersSchema = z.object({
  id: csvIds.optional(),
  status: csvStatuses.optional(),
  creator: z.string().trim().min(1).optional(),
  timeField: z.enum(["start", "end"]).default("start"),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  parentId: idString.optional(),
  visible: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  search: z.string().trim().min(1).optional(),
  sort: sortSchema.default(DEFAULT_SORT),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  cursor: idString.optional(), // wins over offset, see repository.ts
});

export type TaskFiltersInput = z.infer<typeof taskFiltersSchema>;

// URLSearchParams -> plain object, taskFiltersSchema's input shape
export function searchParamsToObject(searchParams: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of searchParams.keys()) {
    const value = searchParams.get(key);
    if (value !== null) result[key] = value;
  }
  return result;
}
