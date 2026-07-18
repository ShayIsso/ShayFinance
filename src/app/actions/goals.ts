"use server";

import { revalidatePath } from "next/cache";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import { createGoal, updateGoal, deleteGoal } from "@/lib/goals";
// Pure derivation and the typed error are imported from their dedicated
// (non-DB) submodules rather than the barrel, so action-seam tests can mock
// "@/lib/goals" (the DB-backed CRUD) while still exercising the real
// derivation math and instanceof checks.
import { cumulativeTargetFromMonthly, parseYearMonth } from "@/lib/goals/progress";
import { InvalidGoalTargetMonthError } from "@/lib/goals/errors";
import type { GoalWriteData } from "@/lib/goals/store";
import {
  createGoalFormSchema,
  updateGoalFormSchema,
  goalIdSchema,
  type GoalFormValues,
} from "@/lib/goals/schemas";

const TARGET_MONTH_MESSAGE = "חודש היעד לא יכול להיות לפני חודש ההתחלה";

function targetMonthErrorResult(err: unknown): { error: string; fieldErrors: FieldErrors } | null {
  if (err instanceof InvalidGoalTargetMonthError) {
    return { error: TARGET_MONTH_MESSAGE, fieldErrors: { targetMonth: TARGET_MONTH_MESSAGE } };
  }
  return null;
}

function revalidateGoalPages() {
  revalidatePath("/settings");
  revalidatePath("/");
}

/**
 * Resolves either form entry mode to the single stored shape: "cumulative"
 * passes its targetAmount straight through; "monthly" derives the identical
 * cumulative targetAmount via the goals module's pure derivation function
 * (CONTEXT.md "savings goal" — one goal kind in storage, not a second shape).
 */
function toWriteData(values: GoalFormValues): GoalWriteData {
  const { name, startMonth, openingAmount } = values;

  if (values.mode === "monthly") {
    const targetAmount = cumulativeTargetFromMonthly(
      openingAmount,
      values.monthlyAmount,
      parseYearMonth(startMonth),
      parseYearMonth(values.targetMonth),
    );
    return { name, startMonth, openingAmount, targetMonth: values.targetMonth, targetAmount };
  }

  return {
    name,
    startMonth,
    openingAmount,
    targetMonth: values.targetMonth,
    targetAmount: values.targetAmount,
  };
}

export async function createGoalAction(
  data: unknown,
): Promise<{ id?: string; targetAmount?: number; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = createGoalFormSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const writeData = toWriteData(parsed.data);
  try {
    const id = await createGoal(writeData);
    revalidateGoalPages();
    // The derived cumulative amount rides back on the result — a monthly-mode
    // goal's stored targetAmount only exists after this derivation runs, and
    // the client (goals-section.tsx) needs it for its optimistic row without
    // re-importing the pure derivation into the client bundle (it would drag
    // in analytics' DB-backed index.ts transitively — see progress.ts).
    return { id, targetAmount: writeData.targetAmount };
  } catch (err) {
    const targetMonthResult = targetMonthErrorResult(err);
    if (targetMonthResult) return targetMonthResult;
    throw err;
  }
}

export async function updateGoalAction(data: unknown): Promise<{
  updated?: boolean;
  targetAmount?: number;
  error?: string;
  fieldErrors?: FieldErrors;
}> {
  const parsed = updateGoalFormSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { id, ...values } = parsed.data;
  const writeData = toWriteData(values);

  try {
    await updateGoal(id, writeData);
    revalidateGoalPages();
    return { updated: true, targetAmount: writeData.targetAmount };
  } catch (err) {
    const targetMonthResult = targetMonthErrorResult(err);
    if (targetMonthResult) return targetMonthResult;
    throw err;
  }
}

export async function deleteGoalAction(
  data: unknown,
): Promise<{ deleted?: boolean; error?: string }> {
  const parsed = goalIdSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }

  await deleteGoal(parsed.data.id);
  revalidateGoalPages();
  return { deleted: true };
}
