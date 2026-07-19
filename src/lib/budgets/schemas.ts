import { z } from "zod";

export const budgetIdSchema = z.object({
  id: z.string().uuid("מזהה תקציב לא תקין"),
});

const monthlyLimitSchema = z
  .number({ message: "סכום התקציב חייב להיות מספר" })
  .positive("סכום התקציב חייב להיות חיובי");

export const createBudgetSchema = z.object({
  categoryId: z.string().uuid("יש לבחור קטגוריה"),
  monthlyLimit: monthlyLimitSchema,
});

export const updateBudgetSchema = z
  .object({ monthlyLimit: monthlyLimitSchema })
  .extend(budgetIdSchema.shape);

export type CreateBudgetFormValues = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetFormValues = z.infer<typeof updateBudgetSchema>;

/**
 * Both targets are opt-in (decision record #105 §1, §6) — the client sends
 * `null` to clear a target, never omits the field, so the single-row upsert
 * always writes both columns explicitly.
 */
export const monthlyTargetsSchema = z.object({
  expenseTarget: z
    .number({ message: "יעד ההוצאות חייב להיות מספר" })
    .positive("יעד ההוצאות חייב להיות חיובי")
    .nullable(),
  savingsTarget: z
    .number({ message: "יעד החיסכון חייב להיות מספר" })
    .positive("יעד החיסכון חייב להיות חיובי")
    .nullable(),
});

export type MonthlyTargetsFormValues = z.infer<typeof monthlyTargetsSchema>;
