/**
 * Pure business logic for reconciliation inbox operations.
 * All functions accept a store interface — no direct DB calls here.
 * This keeps the logic testable without a real database.
 */

import { categorize, type CategoryRule } from "@/lib/categories/rules";

// ── Store interface ──────────────────────────────────────────────────────────

export type InboxTransaction = {
  id: string;
  bankAccountId: string;
  bankType: "discount" | "max" | "visaCal";
  date: string; // YYYY-MM-DD
  description: string;
  chargedAmount: number;
  categoryId: string | null;
  reconciliationGroupId: string | null;
  reconciliationRole: "settlement_lump" | "settlement_detail" | "transfer_pair" | null;
  reconciliationConfidence: number | null;
  reconciliationConfirmedAt: Date | null;
  createdAt: Date;
};

export type InboxGroup = {
  groupId: string;
  members: InboxTransaction[];
};

export type InboxStore = {
  getGroupMembers(groupId: string): Promise<InboxTransaction[]>;
  getGroupMembersByIds(groupIds: string[]): Promise<Map<string, InboxTransaction[]>>;
  confirmGroup(groupId: string, now: Date, transferCategoryId: string | null): Promise<void>;
  clearGroup(groupIds: string[]): Promise<void>;
  clearRows(txnIds: string[]): Promise<void>;
  setCategory(txnId: string, categoryId: string | null): Promise<void>;
  getCategoryIdByName(name: string): Promise<string | null>;
  getRulesOrderedByPriority(): Promise<CategoryRule[]>;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Identify the bankSide row in a transfer_pair group.
 *
 * Heuristic (in priority order):
 * 1. If one row has description containing "ביט" (Bit) markers, that is the cardSide;
 *    the other is bankSide.
 * 2. If both or neither have markers, prefer bankType === "discount" as bankSide
 *    (Discount is our canonical bank account; Max/Cal are credit/card accounts).
 * 3. If both same bankType, pick the row with earlier createdAt as bankSide
 *    (deterministic tie-break).
 *
 * Rationale: A future PR may add an explicit role-side column — this heuristic
 * bridges the gap until then.
 */
export function identifyBankSide(members: InboxTransaction[]): InboxTransaction | null {
  if (members.length !== 2) return null;
  const [a, b] = members;

  const BIT_MARKER = /ביט/i;
  const aHasBit = BIT_MARKER.test(a.description);
  const bHasBit = BIT_MARKER.test(b.description);

  // Rule 1: the non-marker row is bankSide
  if (aHasBit && !bHasBit) return b;
  if (bHasBit && !aHasBit) return a;

  // Rule 2: prefer discount as bankSide
  if (a.bankType === "discount" && b.bankType !== "discount") return a;
  if (b.bankType === "discount" && a.bankType !== "discount") return b;

  // Rule 3: deterministic tie-break — earlier createdAt is bankSide
  return a.createdAt <= b.createdAt ? a : b;
}

// ── Approve ───────────────────────────────────────────────────────────────────

export async function approveGroup(
  groupId: string,
  store: InboxStore,
): Promise<{ error?: string }> {
  const members = await store.getGroupMembers(groupId);
  if (members.length === 0) return { error: "קבוצת ההתאמה לא נמצאה" };

  const transferCategoryId = await store.getCategoryIdByName("העברה פנימית");

  // Determine group type from members' roles
  const hasSettlementLump = members.some((m) => m.reconciliationRole === "settlement_lump");

  if (hasSettlementLump) {
    // P1 settlement group: confirm all members; lump already has settlement category
    await store.confirmGroup(groupId, new Date(), null);
  } else {
    // P2 transfer_pair group: confirm all; flip bankSide to transfer category
    const bankSide = identifyBankSide(members);
    if (bankSide && transferCategoryId) {
      await store.confirmGroup(groupId, new Date(), transferCategoryId);
    } else {
      await store.confirmGroup(groupId, new Date(), null);
    }
  }

  return {};
}

export async function approveGroups(
  groupIds: string[],
  store: InboxStore,
): Promise<{ error?: string }> {
  for (const groupId of groupIds) {
    const result = await approveGroup(groupId, store);
    if (result.error) return result;
  }
  return {};
}

// ── Reject ────────────────────────────────────────────────────────────────────

export async function rejectGroup(groupId: string, store: InboxStore): Promise<{ error?: string }> {
  const members = await store.getGroupMembers(groupId);
  if (members.length === 0) return { error: "קבוצת ההתאמה לא נמצאה" };

  // Queued candidates do NOT have their category flipped — only re-rule-engine
  // rows that were part of an auto-applied group (reconciliationConfirmedAt set).
  // For the queue case, just clear reconciliation columns; category is unchanged.
  await store.clearGroup([groupId]);

  // Re-run rule engine for any rows whose category may have been system-assigned
  const rules = await store.getRulesOrderedByPriority();
  for (const member of members) {
    const newCategoryId = categorize(member.description, rules);
    await store.setCategory(member.id, newCategoryId);
  }

  return {};
}

export async function rejectGroups(
  groupIds: string[],
  store: InboxStore,
): Promise<{ error?: string }> {
  for (const groupId of groupIds) {
    const result = await rejectGroup(groupId, store);
    if (result.error) return result;
  }
  return {};
}

// ── Undo auto-applied ─────────────────────────────────────────────────────────

export async function undoTransaction(
  txnId: string,
  allGroupMembers: InboxTransaction[],
  store: InboxStore,
): Promise<{ error?: string }> {
  const txn = allGroupMembers.find((m) => m.id === txnId);
  if (!txn) return { error: "עסקה לא נמצאה" };
  if (!txn.reconciliationGroupId) return { error: "העסקה אינה חלק מקבוצת התאמה" };

  const rules = await store.getRulesOrderedByPriority();

  // Clear this row's reconciliation columns
  await store.clearRows([txnId]);
  const newCategoryId = categorize(txn.description, rules);
  await store.setCategory(txnId, newCategoryId);

  // Check remaining group members
  const remaining = allGroupMembers.filter(
    (m) => m.id !== txnId && m.reconciliationGroupId === txn.reconciliationGroupId,
  );

  if (remaining.length <= 1) {
    // Group has become a singleton (or is empty) — clear the remaining member too
    for (const rem of remaining) {
      await store.clearRows([rem.id]);
      const remCategoryId = categorize(rem.description, rules);
      await store.setCategory(rem.id, remCategoryId);
    }
  }

  return {};
}
