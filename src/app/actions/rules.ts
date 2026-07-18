"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import {
  previewRetroactiveApply,
  applyRetroactively,
  drizzleRetroactiveStore,
} from "@/lib/categories/retroactive";
import { createRule, updateRule, deleteRule } from "@/lib/categories/rules";
import { NotAssignableCategoryError } from "@/lib/categories/errors";
import {
  createRuleSchema,
  updateRuleActionSchema,
  ruleIdSchema as ruleIdActionSchema,
} from "@/lib/categories/schemas";

const ruleIdSchema = z.object({
  ruleId: z.string().uuid({ message: "מזהה כלל לא תקין" }),
});

const NOT_ASSIGNABLE_MESSAGE = "לא ניתן לשייך לקטגוריית קבוצה — יש לבחור קטגוריית משנה";

function notAssignableResult() {
  return { error: NOT_ASSIGNABLE_MESSAGE, fieldErrors: { categoryId: NOT_ASSIGNABLE_MESSAGE } };
}

export async function previewRetroactiveApplyAction(
  data: unknown,
): Promise<{ count?: number; error?: string }> {
  const parsed = ruleIdSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }
  const { count } = await previewRetroactiveApply(parsed.data.ruleId, drizzleRetroactiveStore);
  return { count };
}

export async function applyRetroactivelyAction(
  data: unknown,
): Promise<{ applied?: number; error?: string }> {
  const parsed = ruleIdSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }
  const { applied } = await applyRetroactively(parsed.data.ruleId, drizzleRetroactiveStore);
  revalidatePath("/transactions");
  return { applied };
}

// ── Rule CRUD actions ─────────────────────────────────────────────────────────

/**
 * Rules render on the settings page (rules list) and drive the
 * auto-categorization the transactions page relies on.
 */
function revalidateRulePages() {
  revalidatePath("/settings");
  revalidatePath("/transactions");
}

export async function createRuleAction(
  data: unknown,
): Promise<{ id?: string; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = createRuleSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  try {
    const id = await createRule(parsed.data);
    revalidateRulePages();
    return { id };
  } catch (err) {
    if (err instanceof NotAssignableCategoryError) return notAssignableResult();
    throw err;
  }
}

export async function updateRuleAction(
  data: unknown,
): Promise<{ updated?: boolean; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = updateRuleActionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { id, ...changes } = parsed.data;
  try {
    await updateRule(id, changes);
    revalidateRulePages();
    return { updated: true };
  } catch (err) {
    if (err instanceof NotAssignableCategoryError) return notAssignableResult();
    throw err;
  }
}

export async function deleteRuleAction(
  data: unknown,
): Promise<{ deleted?: boolean; error?: string }> {
  const parsed = ruleIdActionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }

  await deleteRule(parsed.data.id);
  revalidateRulePages();
  return { deleted: true };
}
