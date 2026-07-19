"use server";

import { revalidatePath } from "next/cache";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import {
  createBudget,
  updateBudget,
  deleteBudget,
  setMonthlyTargets,
  getBudgetForCategory,
} from "@/lib/budgets";
// Imported from the dedicated errors module (not the mocked barrel) so
// instanceof keeps working in action-seam tests that mock "@/lib/budgets".
import { DuplicateBudgetCategoryError, NonExpenseBudgetCategoryError } from "@/lib/budgets/errors";
import {
  createBudgetSchema,
  updateBudgetSchema,
  budgetIdSchema,
  monthlyTargetsSchema,
} from "@/lib/budgets/schemas";
import { categoryIdSchema } from "@/lib/categories/schemas";

const DUPLICATE_BUDGET_MESSAGE = "לקטגוריה זו כבר יש תקציב";
const NON_EXPENSE_MESSAGE = "ניתן להגדיר תקציב רק לקטגוריית הוצאה";

function budgetErrorResult(err: unknown): { error: string; fieldErrors: FieldErrors } | null {
  if (err instanceof DuplicateBudgetCategoryError) {
    return {
      error: DUPLICATE_BUDGET_MESSAGE,
      fieldErrors: { categoryId: DUPLICATE_BUDGET_MESSAGE },
    };
  }
  if (err instanceof NonExpenseBudgetCategoryError) {
    return { error: NON_EXPENSE_MESSAGE, fieldErrors: { categoryId: NON_EXPENSE_MESSAGE } };
  }
  return null;
}

function revalidateBudgetPages() {
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function createBudgetAction(
  data: unknown,
): Promise<{ id?: string; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = createBudgetSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  try {
    const id = await createBudget(parsed.data);
    revalidateBudgetPages();
    return { id };
  } catch (err) {
    const result = budgetErrorResult(err);
    if (result) return result;
    throw err;
  }
}

export async function updateBudgetAction(
  data: unknown,
): Promise<{ updated?: boolean; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = updateBudgetSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { id, monthlyLimit } = parsed.data;
  await updateBudget(id, { monthlyLimit });
  revalidateBudgetPages();
  return { updated: true };
}

export async function deleteBudgetAction(
  data: unknown,
): Promise<{ deleted?: boolean; error?: string }> {
  const parsed = budgetIdSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }

  await deleteBudget(parsed.data.id);
  revalidateBudgetPages();
  return { deleted: true };
}

export async function setMonthlyTargetsAction(
  data: unknown,
): Promise<{ saved?: boolean; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = monthlyTargetsSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  await setMonthlyTargets(parsed.data);
  revalidateBudgetPages();
  return { saved: true };
}

/**
 * Whether `categoryId` already carries a budget — the category delete-confirm
 * dialog (`categories-section.tsx`) calls this before showing its cascade
 * warning (schema `ON DELETE CASCADE`; ADR-0011 §8).
 */
export async function getCategoryBudgetAction(
  data: unknown,
): Promise<{ hasBudget: boolean; error?: string }> {
  const parsed = categoryIdSchema.safeParse(data);
  if (!parsed.success) {
    return { hasBudget: false, error: formatZodError(parsed.error) };
  }

  const budget = await getBudgetForCategory(parsed.data.id);
  return { hasBudget: budget !== null };
}
