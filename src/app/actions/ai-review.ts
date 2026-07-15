"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatZodError } from "@/lib/api-utils";
import { db } from "@/db";
import {
  acceptSuggestion,
  rejectSuggestion,
  undoAiAssignment,
  createReviewStore,
} from "@/lib/ai-categorization";
import { createMerchantMemoryStore, type FannedOutRow } from "@/lib/merchant-memory";

// ── Schemas ──────────────────────────────────────────────────────────────────

const acceptSuggestionSchema = z.object({
  transactionId: z.string().uuid({ message: "מזהה עסקה לא תקין" }),
  suggestionId: z.string().uuid({ message: "מזהה הצעה לא תקין" }),
  categoryId: z.string().uuid({ message: "מזהה קטגוריה לא תקין" }),
});

const rejectSuggestionSchema = z.object({
  suggestionId: z.string().uuid({ message: "מזהה הצעה לא תקין" }),
});

const undoAiAssignmentSchema = z.object({
  transactionId: z.string().uuid({ message: "מזהה עסקה לא תקין" }),
});

/**
 * A suggestion's accept/reject/undo renders on the transactions table itself
 * and — through the dashboard's totals and category breakdown — on "/".
 */
function revalidateTransactionPages() {
  revalidatePath("/transactions");
  revalidatePath("/");
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function acceptSuggestionAction(data: unknown): Promise<{
  accepted?: boolean;
  fanOutCount?: number;
  fannedOut?: FannedOutRow[];
  error?: string;
}> {
  const parsed = acceptSuggestionSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  // One DB transaction so the memory write, fan-out, and suggestion status
  // change can never partially apply (mirrors changeTransactionCategory).
  const result = await db.transaction(async (tx) =>
    acceptSuggestion(parsed.data, createReviewStore(tx), createMerchantMemoryStore(tx)),
  );

  revalidateTransactionPages();
  return { accepted: true, fanOutCount: result.fanOutCount, fannedOut: result.fannedOut };
}

export async function rejectSuggestionAction(
  data: unknown,
): Promise<{ rejected?: boolean; error?: string }> {
  const parsed = rejectSuggestionSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  await rejectSuggestion(parsed.data, createReviewStore());

  revalidateTransactionPages();
  return { rejected: true };
}

export async function undoAiAssignmentAction(
  data: unknown,
): Promise<{ undone?: boolean; error?: string }> {
  const parsed = undoAiAssignmentSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  const result = await db.transaction(async (tx) =>
    undoAiAssignment(parsed.data, createReviewStore(tx), createMerchantMemoryStore(tx)),
  );

  revalidateTransactionPages();
  return { undone: result.undone };
}
