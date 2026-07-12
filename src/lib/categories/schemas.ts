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

export const updateCategoryActionSchema = updateCategorySchema
  .extend(categoryIdSchema.shape)
  .refine(
    (data) => Object.entries(data).some(([key, value]) => key !== "id" && value !== undefined),
    { message: "לא סופקו שדות לעדכון" },
  );

const INVALID_REGEX_MESSAGE = "ביטוי רגולרי לא תקין";

/**
 * A regex-type rule must carry a compilable pattern — validated here at the
 * boundary (form resolver + Server Action) so a broken pattern can never
 * reach the matcher and crash categorization later. Compiled with the same
 * "i" flag `categorize()` uses.
 */
function regexPatternCompiles(
  data: { matchType?: string; pattern?: string },
  ctx: z.RefinementCtx,
) {
  if (data.matchType !== "regex" || typeof data.pattern !== "string") return;
  try {
    new RegExp(data.pattern, "i");
  } catch {
    ctx.addIssue({ code: "custom", message: INVALID_REGEX_MESSAGE, path: ["pattern"] });
  }
}

const ruleFieldsSchema = z.object({
  categoryId: z.string().uuid("יש לבחור קטגוריה"),
  matchType: z.enum(["contains", "starts_with", "exact", "regex"], {
    message: "יש לבחור סוג התאמה",
  }),
  pattern: z.string().min(1, "תבנית חובה"),
  priority: z
    .number({ message: "עדיפות חייבת להיות מספר" })
    .int("עדיפות חייבת להיות מספר שלם")
    .min(0, "עדיפות לא יכולה להיות שלילית"),
});

export const createRuleSchema = ruleFieldsSchema.superRefine(regexPatternCompiles);

export const ruleIdSchema = z.object({
  id: z.string().uuid("מזהה כלל לא תקין"),
});

export const updateRuleActionSchema = ruleFieldsSchema
  .partial()
  .extend(ruleIdSchema.shape)
  .refine(
    (data) => Object.entries(data).some(([key, value]) => key !== "id" && value !== undefined),
    { message: "לא סופקו שדות לעדכון" },
  )
  .superRefine((data, ctx) => {
    // pattern and matchType must travel together: the regex-compile check
    // below needs both, so a partial update can never smuggle an
    // uncompilable pattern under an existing regex rule (or flip a rule to
    // regex without re-validating its pattern).
    if ((data.pattern === undefined) !== (data.matchType === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "תבנית וסוג התאמה מתעדכנים יחד",
        path: [data.pattern === undefined ? "pattern" : "matchType"],
      });
    }
  })
  .superRefine(regexPatternCompiles);
