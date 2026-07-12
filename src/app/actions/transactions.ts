"use server";

import { revalidatePath } from "next/cache";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import { updateTransaction, bulkCategorize } from "@/lib/transactions";
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
): Promise<{ updated?: boolean; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = updateTransactionActionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { id, ...changes } = parsed.data;
  await updateTransaction(id, changes);
  revalidateTransactionPages();
  return { updated: true };
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
