import { z } from "zod";
import { TASK_STATUSES } from "@/lib/types";

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: "Must be a valid ISO 8601 date-time" });

const statusSchema = z.enum(TASK_STATUSES);

const positiveInt = z.coerce.number().int().positive();

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
    parentId: positiveInt.nullish(),
    title: z.string().trim().min(1, "title is required").max(255),
    description: z.string().trim().max(5000).nullish(),
    status: statusSchema.default("todo"),
    visible: z.boolean().default(true),
    startTime: isoDateTime,
    endTime: isoDateTime,
  })
  .superRefine(withTimeOrder);

export const updateTaskSchema = z
  .object({
    parentId: positiveInt.nullish(),
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(5000).nullish(),
    status: statusSchema.optional(),
    visible: z.boolean().optional(),
    startTime: isoDateTime.optional(),
    endTime: isoDateTime.optional(),
  })
  .superRefine(withTimeOrder)
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field must be provided" });

export const bulkUpdateSchema = z.object({
  ids: z.array(positiveInt).min(1, "ids must contain at least one id"),
  data: updateTaskSchema,
});

export const bulkDeleteSchema = z
  .object({
    ids: z.array(positiveInt).min(1).optional(),
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

const csvNumbers = z.string().transform((value, ctx) => {
  const parsed = z.array(positiveInt).safeParse(splitCsv(value));
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: "Must be a comma-separated list of positive integers" });
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
  id: csvNumbers.optional(),
  status: csvStatuses.optional(),
  creator: z.string().trim().min(1).optional(),
  timeField: z.enum(["start", "end"]).default("start"),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  parentId: positiveInt.optional(),
  visible: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  search: z.string().trim().min(1).optional(),
  sort: sortSchema.default(DEFAULT_SORT),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  cursor: positiveInt.optional(), // wins over offset, see repository.ts
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
