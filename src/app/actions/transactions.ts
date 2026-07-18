"use server";

import { revalidatePath } from "next/cache";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import { updateTransaction } from "@/lib/transactions";
import {
  changeTransactionCategory,
  bulkChangeTransactionCategories,
  undoCategoryFanOut,
  type FannedOutRow,
} from "@/lib/merchant-memory";
import { NotAssignableCategoryError } from "@/lib/categories";
import {
  updateTransactionActionSchema,
  bulkCategorizeSchema,
  undoFanOutSchema,
} from "@/lib/transactions/schemas";
import { notAssignableResult } from "./not-assignable";

/**
 * A transaction's custom description or category assignment renders on the
 * transactions table itself and — through the dashboard's totals,
 * spending-by-category chart and recent transactions list — on "/".
 */
function revalidateTransactionPages() {
  revalidatePath("/transactions");
  revalidatePath("/");
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function updateTransactionAction(data: unknown): Promise<{
  updated?: boolean;
  fanOutCount?: number;
  fannedOut?: FannedOutRow[];
  error?: string;
  fieldErrors?: FieldErrors;
}> {
  const parsed = updateTransactionActionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { id, ...changes } = parsed.data;

  let fanOut: { fanOutCount: number; fannedOut: FannedOutRow[] } | undefined;
  if ("categoryId" in changes) {
    if (changes.categoryId === null) {
      await updateTransaction(id, { categoryId: null });
    } else if (changes.categoryId !== undefined) {
      // Category changes route through merchant memory: a first-time label is a
      // memory write, a change to an already-categorized row is a logged
      // correction — and either fans out to same-key siblings (ADR-0010 §4).
      try {
        fanOut = await changeTransactionCategory(id, changes.categoryId);
      } catch (err) {
        if (err instanceof NotAssignableCategoryError) return notAssignableResult();
        throw err;
      }
    }
  }
  if ("customDescription" in changes) {
    await updateTransaction(id, { customDescription: changes.customDescription });
  }

  revalidateTransactionPages();
  return fanOut
    ? { updated: true, fanOutCount: fanOut.fanOutCount, fannedOut: fanOut.fannedOut }
    : { updated: true };
}

export async function bulkCategorizeAction(data: unknown): Promise<{
  updated?: number;
  fanOutCount?: number;
  fannedOut?: FannedOutRow[];
  error?: string;
  fieldErrors?: FieldErrors;
}> {
  const parsed = bulkCategorizeSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { transactionIds, categoryId } = parsed.data;
  try {
    const { fanOutCount, fannedOut } = await bulkChangeTransactionCategories(
      transactionIds,
      categoryId,
    );
    revalidateTransactionPages();
    return { updated: transactionIds.length, fanOutCount, fannedOut };
  } catch (err) {
    if (err instanceof NotAssignableCategoryError) return notAssignableResult();
    throw err;
  }
}

export async function undoFanOutAction(
  data: unknown,
): Promise<{ undone?: number; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = undoFanOutSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  await undoCategoryFanOut(parsed.data.rows);
  revalidateTransactionPages();
  return { undone: parsed.data.rows.length };
}
