import { z } from "zod";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "חודש חייב להיות בפורמט YYYY-MM");

export const createGoalSchema = z.object({
  name: z.string().trim().min(1, "שם חובה"),
  targetAmount: z
    .number({ message: "סכום יעד חייב להיות מספר" })
    .positive("סכום יעד חייב להיות חיובי"),
  startMonth: monthSchema,
  openingAmount: z
    .number({ message: "סכום פתיחה חייב להיות מספר" })
    .min(0, "סכום פתיחה לא יכול להיות שלילי")
    .default(0),
  targetMonth: monthSchema.nullish(),
});

export const updateGoalSchema = createGoalSchema.partial();

export const goalIdSchema = z.object({
  id: z.string().uuid("מזהה יעד לא תקין"),
});

export const updateGoalActionSchema = updateGoalSchema
  .extend(goalIdSchema.shape)
  .refine(
    (data) => Object.entries(data).some(([key, value]) => key !== "id" && value !== undefined),
    { message: "לא סופקו שדות לעדכון" },
  );
