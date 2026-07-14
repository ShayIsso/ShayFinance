"use server";

import { revalidatePath } from "next/cache";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import { updateTransaction, bulkCategorize } from "@/lib/transactions";
import { changeTransactionCategory } from "@/lib/merchant-memory";
import { updateTransactionActionSchema, bulkCategorizeSchema } from "@/lib/transactions/schemas";

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

export async function updateTransactionAction(
  data: unknown,
): Promise<{ updated?: boolean; fanOutCount?: number; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = updateTransactionActionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { id, ...changes } = parsed.data;

  let fanOutCount: number | undefined;
  if ("categoryId" in changes) {
    if (changes.categoryId === null) {
      await updateTransaction(id, { categoryId: null });
    } else if (changes.categoryId !== undefined) {
      // Category changes route through merchant memory: a first-time label is a
      // memory write, a change to an already-categorized row is a logged
      // correction — and either fans out to same-key siblings (ADR-0010 §4).
      const result = await changeTransactionCategory(id, changes.categoryId);
      fanOutCount = result.fanOutCount;
    }
  }
  if ("customDescription" in changes) {
    await updateTransaction(id, { customDescription: changes.customDescription });
  }

  revalidateTransactionPages();
  return fanOutCount !== undefined ? { updated: true, fanOutCount } : { updated: true };
}

export async function bulkCategorizeAction(
  data: unknown,
): Promise<{ updated?: number; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = bulkCategorizeSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { transactionIds, categoryId } = parsed.data;
  await bulkCategorize(transactionIds, categoryId);
  revalidateTransactionPages();
  return { updated: transactionIds.length };
}
