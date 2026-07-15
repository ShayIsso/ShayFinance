import { z } from "zod";

export const transactionFiltersSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  bankAccountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["completed", "pending"]).optional(),
  // z.coerce.boolean() is unsafe here: it treats any non-empty string as true,
  // so "false" would coerce to true. Match the literal "true"/"false" instead.
  uncategorized: z
    .enum(["true", "false"], { message: "uncategorized חייב להיות true או false" })
    .optional()
    .transform((v) => v === "true"),
  // Needs-review: exactly the rows with a pending AI suggestion (ticket #149).
  needsReview: z
    .enum(["true", "false"], { message: "needsReview חייב להיות true או false" })
    .optional()
    .transform((v) => v === "true"),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const updateTransactionSchema = z.object({
  customDescription: z.string().nullable().optional(),
  categoryId: z.string().uuid({ message: "מזהה קטגוריה לא תקין" }).nullable().optional(),
});

export const transactionIdSchema = z.object({
  id: z.string().uuid({ message: "מזהה עסקה לא תקין" }),
});

export const updateTransactionActionSchema = updateTransactionSchema
  .extend(transactionIdSchema.shape)
  .refine(
    (data) => Object.entries(data).some(([key, value]) => key !== "id" && value !== undefined),
    { message: "לא סופקו שדות לעדכון" },
  );

export const bulkCategorizeSchema = z.object({
  transactionIds: z
    .array(z.string().uuid({ message: "מזהה עסקה לא תקין" }))
    .min(1, { message: "יש לספק לפחות עסקה אחת" }),
  categoryId: z.string().uuid({ message: "יש לבחור קטגוריה" }),
});

export const undoFanOutSchema = z.object({
  rows: z
    .array(
      z.object({
        id: z.string().uuid({ message: "מזהה עסקה לא תקין" }),
        previousCategoryId: z.string().uuid({ message: "מזהה קטגוריה לא תקין" }).nullable(),
        previousCategorySource: z
          .enum(["rule", "memory", "ai", "user"], { message: "מקור קטגוריה לא תקין" })
          .nullable(),
      }),
    )
    .min(1, { message: "אין החלה לביטול" }),
});
