import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1, "שם חובה"),
  type: z.enum(["income", "expense", "investment", "transfer", "ignore"]),
  icon: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "צבע חייב להיות בפורמט hex"),
});

export const updateCategorySchema = createCategorySchema.partial();
