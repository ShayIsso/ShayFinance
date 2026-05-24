"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatZodError } from "@/lib/api-utils";
import {
  approveGroup,
  approveGroups,
  rejectGroup,
  rejectGroups,
  undoTransaction,
} from "@/lib/reconciliation/inbox-ops";
import { drizzleInboxStore } from "@/lib/reconciliation/inbox-store";

// ── Schemas ──────────────────────────────────────────────────────────────────

const groupIdSchema = z.object({
  groupId: z.string().uuid({ message: "מזהה קבוצה לא תקין" }),
});

const groupIdsSchema = z.object({
  groupIds: z
    .array(z.string().uuid({ message: "מזהה קבוצה לא תקין" }))
    .min(1, { message: "יש לספק לפחות קבוצה אחת" }),
});

const txnIdSchema = z.object({
  txnId: z.string().uuid({ message: "מזהה עסקה לא תקין" }),
});

function revalidateAll() {
  revalidatePath("/reconciliation");
  revalidatePath("/transactions");
  revalidatePath("/");
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function approveReconciliationAction(
  data: unknown,
): Promise<{ approved?: boolean; error?: string }> {
  const parsed = groupIdSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  const result = await approveGroup(parsed.data.groupId, drizzleInboxStore);
  if (result.error) return { error: result.error };

  revalidateAll();
  return { approved: true };
}

export async function rejectReconciliationAction(
  data: unknown,
): Promise<{ rejected?: boolean; error?: string }> {
  const parsed = groupIdSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  const result = await rejectGroup(parsed.data.groupId, drizzleInboxStore);
  if (result.error) return { error: result.error };

  revalidateAll();
  return { rejected: true };
}

export async function approveReconciliationsAction(
  data: unknown,
): Promise<{ approved?: number; error?: string }> {
  const parsed = groupIdsSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  const result = await approveGroups(parsed.data.groupIds, drizzleInboxStore);
  if (result.error) return { error: result.error };

  revalidateAll();
  return { approved: parsed.data.groupIds.length };
}

export async function rejectReconciliationsAction(
  data: unknown,
): Promise<{ rejected?: number; error?: string }> {
  const parsed = groupIdsSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  const result = await rejectGroups(parsed.data.groupIds, drizzleInboxStore);
  if (result.error) return { error: result.error };

  revalidateAll();
  return { rejected: parsed.data.groupIds.length };
}

export async function undoReconciliationAction(
  data: unknown,
): Promise<{ undone?: boolean; error?: string }> {
  const parsed = txnIdSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  const { txnId } = parsed.data;

  // Fetch the transaction's group members to pass to the pure function
  // We need to find the groupId first, then get all members
  const members = await drizzleInboxStore.getGroupMembers(txnId).catch(() => []);

  // If getGroupMembers returned nothing (txnId is not a groupId), get the txn directly
  // and then get its group members
  const { db } = await import("@/db");
  const { transactions } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const txnRows = await db
    .select({ reconciliationGroupId: transactions.reconciliationGroupId })
    .from(transactions)
    .where(eq(transactions.id, txnId))
    .limit(1);

  const groupId = txnRows[0]?.reconciliationGroupId;
  if (!groupId) return { error: "העסקה אינה חלק מקבוצת התאמה" };

  const groupMembers = await drizzleInboxStore.getGroupMembers(groupId);

  const result = await undoTransaction(txnId, groupMembers, drizzleInboxStore);
  if (result.error) return { error: result.error };

  revalidateAll();
  return { undone: true };
}
