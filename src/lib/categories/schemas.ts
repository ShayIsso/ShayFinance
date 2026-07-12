import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "שם חובה"),
  type: z.enum(["income", "expense", "investment", "transfer", "ignore"], {
    message: "יש לבחור סוג קטגוריה",
  }),
  icon: z.string().min(1, "יש לבחור אייקון"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "צבע חייב להיות בפורמט hex"),
});

export const updateCategorySchema = createCategorySchema.partial();

export const categoryIdSchema = z.object({
  id: z.string().uuid("מזהה קטגוריה לא תקין"),
});

export const updateCategoryActionSchema = updateCategorySchema.extend(categoryIdSchema.shape);

export const createRuleSchema = z.object({
  categoryId: z.string().uuid(),
  matchType: z.enum(["contains", "starts_with", "exact", "regex"]),
  pattern: z.string().min(1, "תבנית חובה"),
  priority: z.number().int().min(0).default(0),
});

export const updateRuleSchema = createRuleSchema.partial();
