import { z } from "zod";

const YEAR_MONTH_MESSAGE = "פורמט חודש לא תקין (חודש/שנה)";
const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, YEAR_MONTH_MESSAGE);

const sharedFields = {
  name: z.string().trim().min(1, "שם חובה"),
  startMonth: yearMonthSchema,
  openingAmount: z
    .number({ message: "סכום פתיחה חייב להיות מספר" })
    .min(0, "סכום פתיחה לא יכול להיות שלילי"),
};

/**
 * The form's two entry modes both resolve to the single cumulative
 * `GoalWriteData` shape (CONTEXT.md "savings goal") — "monthly" is per-month
 * phrasing sugar ("₪X לחודש עד תאריך"); the action derives its cumulative
 * `targetAmount` via the goals module's pure `cumulativeTargetFromMonthly`
 * before writing, so storage only ever sees one goal kind.
 */
export const createGoalFormSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("cumulative"),
    ...sharedFields,
    targetAmount: z
      .number({ message: "סכום היעד חייב להיות מספר" })
      .positive("סכום היעד חייב להיות חיובי"),
    targetMonth: yearMonthSchema.nullable(),
  }),
  z.object({
    mode: z.literal("monthly"),
    ...sharedFields,
    monthlyAmount: z
      .number({ message: "סכום חודשי חייב להיות מספר" })
      .positive("סכום חודשי חייב להיות חיובי"),
    // A deadline is what gives per-month phrasing a span to spread across
    // (cumulativeTargetFromMonthly requires a target month); open-ended
    // per-month goals aren't representable, so the cumulative mode is used instead.
    targetMonth: yearMonthSchema,
  }),
]);

export type GoalFormValues = z.infer<typeof createGoalFormSchema>;

export const goalIdSchema = z.object({
  id: z.string().uuid("מזהה יעד לא תקין"),
});

export const reorderGoalSchema = z.object({
  id: z.string().uuid("מזהה יעד לא תקין"),
  direction: z.enum(["up", "down"]),
});

export type ReorderGoalValues = z.infer<typeof reorderGoalSchema>;

/** Tracking-since month for the shared savings pool; null clears the baseline. */
export const trackingSinceSchema = z.object({
  month: yearMonthSchema.nullable(),
});

export type TrackingSinceValues = z.infer<typeof trackingSinceSchema>;

export const updateGoalFormSchema = z.discriminatedUnion("mode", [
  createGoalFormSchema.options[0].extend(goalIdSchema.shape),
  createGoalFormSchema.options[1].extend(goalIdSchema.shape),
]);

export type UpdateGoalFormValues = z.infer<typeof updateGoalFormSchema>;
