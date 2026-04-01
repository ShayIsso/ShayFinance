import { z } from "zod";

export const transactionFiltersSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  bankAccountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["completed", "pending"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const updateTransactionSchema = z.object({
  customDescription: z.string().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
});

export const bulkCategorizeSchema = z.object({
  transactionIds: z.array(z.string().uuid()).min(1),
  categoryId: z.string().uuid(),
});
