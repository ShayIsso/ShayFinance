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
import {
  createRuleSchema,
  updateRuleActionSchema,
  ruleIdSchema as ruleIdActionSchema,
} from "@/lib/categories/schemas";

const ruleIdSchema = z.object({
  ruleId: z.string().uuid({ message: "מזהה כלל לא תקין" }),
});

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

  const id = await createRule(parsed.data);
  revalidateRulePages();
  return { id };
}

export async function updateRuleAction(
  data: unknown,
): Promise<{ updated?: boolean; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = updateRuleActionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { id, ...changes } = parsed.data;
  await updateRule(id, changes);
  revalidateRulePages();
  return { updated: true };
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
