"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { recurringExpenses, transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatZodError } from "@/lib/api-utils";

// ── Schemas ───────────────────────────────────────────────────────────────────

const cancelSchema = z.object({
  id: z.string().uuid({ message: "מזהה מנוי לא תקין" }),
});

const acceptPriceChangeSchema = z.object({
  id: z.string().uuid({ message: "מזהה מנוי לא תקין" }),
});

const pauseSchema = z.object({
  id: z.string().uuid({ message: "מזהה מנוי לא תקין" }),
});

const confirmNewlyDetectedSchema = z.object({
  id: z.string().uuid({ message: "מזהה מנוי לא תקין" }),
  name: z.string().min(1, { message: "שם המנוי לא יכול להיות ריק" }),
  categoryId: z.string().uuid({ message: "מזהה קטגוריה לא תקין" }).nullable().optional(),
});

const dismissNewlyDetectedSchema = z.object({
  id: z.string().uuid({ message: "מזהה מנוי לא תקין" }),
});

// ── Actions ───────────────────────────────────────────────────────────────────

export async function cancelRecurringAction(data: unknown): Promise<{ error?: string }> {
  const parsed = cancelSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  await db
    .update(recurringExpenses)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(recurringExpenses.id, parsed.data.id));

  revalidatePath("/subscriptions");
  return {};
}

/**
 * Accepts a price change for a recurring pattern.
 * Looks up the pattern's lastMatchedTxnId transaction and sets expectedAmount
 * to Math.abs(chargedAmount) of that transaction.
 */
export async function acceptPriceChangeAction(data: unknown): Promise<{ error?: string }> {
  const parsed = acceptPriceChangeSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  const pattern = await db
    .select({
      id: recurringExpenses.id,
      lastMatchedTxnId: recurringExpenses.lastMatchedTxnId,
    })
    .from(recurringExpenses)
    .where(eq(recurringExpenses.id, parsed.data.id))
    .limit(1);

  if (!pattern.length || !pattern[0].lastMatchedTxnId) {
    return { error: "לא נמצאה עסקה אחרונה עבור מנוי זה" };
  }

  const txn = await db
    .select({ chargedAmount: transactions.chargedAmount })
    .from(transactions)
    .where(eq(transactions.id, pattern[0].lastMatchedTxnId))
    .limit(1);

  if (!txn.length) {
    return { error: "לא נמצאה עסקה עבור מנוי זה" };
  }

  const newAmount = Math.abs(Number(txn[0].chargedAmount));

  await db
    .update(recurringExpenses)
    .set({ expectedAmount: String(newAmount), updatedAt: new Date() })
    .where(eq(recurringExpenses.id, parsed.data.id));

  revalidatePath("/subscriptions");
  return {};
}

/**
 * Pauses a recurring pattern — sets status to 'paused'.
 */
export async function pauseRecurringAction(data: unknown): Promise<{ error?: string }> {
  const parsed = pauseSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  await db
    .update(recurringExpenses)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(recurringExpenses.id, parsed.data.id));

  revalidatePath("/subscriptions");
  return {};
}

/**
 * Confirms a newly-detected pattern.
 * Sets merchant to the provided name, assigns optional categoryId,
 * stamps confirmedAt, and keeps status = 'active'.
 */
export async function confirmNewlyDetectedAction(data: unknown): Promise<{ error?: string }> {
  const parsed = confirmNewlyDetectedSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  const now = new Date();
  await db
    .update(recurringExpenses)
    .set({
      merchant: parsed.data.name,
      categoryId: parsed.data.categoryId ?? null,
      confirmedAt: now,
      status: "active",
      updatedAt: now,
    })
    .where(eq(recurringExpenses.id, parsed.data.id));

  revalidatePath("/subscriptions");
  return {};
}

/**
 * Dismisses a newly-detected pattern — deletes the row entirely.
 */
export async function dismissNewlyDetectedAction(data: unknown): Promise<{ error?: string }> {
  const parsed = dismissNewlyDetectedSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  await db.delete(recurringExpenses).where(eq(recurringExpenses.id, parsed.data.id));

  revalidatePath("/subscriptions");
  return {};
}
