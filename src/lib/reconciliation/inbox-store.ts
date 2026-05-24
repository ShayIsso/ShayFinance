/**
 * Drizzle-backed implementation of InboxStore.
 * Also exports the query used by the /reconciliation page.
 */

import { db } from "@/db";
import {
  transactions,
  categories,
  bankAccounts,
  bankCredentials,
  categoryRules,
} from "@/db/schema";
import { eq, isNull, isNotNull, inArray, asc } from "drizzle-orm";
import type { InboxStore, InboxTransaction } from "./inbox-ops";
import type { CategoryRule } from "@/lib/categories/rules";

// ── Row shape returned by the inbox query ───────────────────────────────────

export type InboxRow = {
  id: string;
  bankAccountId: string;
  bankType: "discount" | "max" | "visaCal";
  accountNumber: string;
  credentialDisplayName: string;
  date: string;
  description: string;
  chargedAmount: number;
  categoryId: string | null;
  categoryName: string | null;
  reconciliationGroupId: string;
  reconciliationRole: "settlement_lump" | "settlement_detail" | "transfer_pair";
  reconciliationConfidence: number;
  reconciliationConfirmedAt: Date | null;
  createdAt: Date;
};

// ── Pending inbox query ──────────────────────────────────────────────────────

/**
 * Fetches all transactions pending reconciliation review:
 * - reconciliationGroupId IS NOT NULL
 * - reconciliationConfirmedAt IS NULL (not yet approved)
 */
export async function getPendingInboxRows(): Promise<InboxRow[]> {
  const rows = await db
    .select({
      id: transactions.id,
      bankAccountId: transactions.bankAccountId,
      bankType: bankCredentials.bankType,
      accountNumber: bankAccounts.accountNumber,
      credentialDisplayName: bankCredentials.displayName,
      date: transactions.date,
      description: transactions.description,
      chargedAmount: transactions.chargedAmount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      reconciliationGroupId: transactions.reconciliationGroupId,
      reconciliationRole: transactions.reconciliationRole,
      reconciliationConfidence: transactions.reconciliationConfidence,
      reconciliationConfirmedAt: transactions.reconciliationConfirmedAt,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .innerJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
    .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id))
    .where(isNull(transactions.reconciliationConfirmedAt))
    // Only rows that belong to a reconciliation group
    .then((rows) => rows.filter((r) => r.reconciliationGroupId !== null));

  return rows
    .filter((r) => r.reconciliationGroupId && r.reconciliationRole && r.reconciliationConfidence)
    .map((r) => ({
      id: r.id,
      bankAccountId: r.bankAccountId,
      bankType: r.bankType as "discount" | "max" | "visaCal",
      accountNumber: r.accountNumber,
      credentialDisplayName: r.credentialDisplayName,
      date: r.date,
      description: r.description,
      chargedAmount: Number(r.chargedAmount),
      categoryId: r.categoryId,
      categoryName: r.categoryName ?? null,
      reconciliationGroupId: r.reconciliationGroupId!,
      reconciliationRole: r.reconciliationRole as
        | "settlement_lump"
        | "settlement_detail"
        | "transfer_pair",
      reconciliationConfidence: Number(r.reconciliationConfidence),
      reconciliationConfirmedAt: r.reconciliationConfirmedAt,
      createdAt: r.createdAt,
    }));
}

/**
 * Count distinct pending reconciliation groups (for dashboard strip + sidebar badge).
 */
export async function getPendingGroupCount(): Promise<number> {
  const rows = await db
    .select({ groupId: transactions.reconciliationGroupId })
    .from(transactions)
    .where(isNull(transactions.reconciliationConfirmedAt))
    .then((rows) => rows.filter((r) => r.groupId !== null));

  const distinct = new Set(rows.map((r) => r.groupId));
  return distinct.size;
}

// ── InboxStore (Drizzle) ──────────────────────────────────────────────────────

function rowToInboxTxn(r: {
  id: string;
  bankAccountId: string;
  bankType: string;
  date: string;
  description: string;
  chargedAmount: unknown;
  categoryId: string | null;
  reconciliationGroupId: string | null;
  reconciliationRole: string | null;
  reconciliationConfidence: number | null;
  reconciliationConfirmedAt: Date | null;
  createdAt: Date;
}): InboxTransaction {
  return {
    id: r.id,
    bankAccountId: r.bankAccountId,
    bankType: r.bankType as "discount" | "max" | "visaCal",
    date: r.date,
    description: r.description,
    chargedAmount: Number(r.chargedAmount),
    categoryId: r.categoryId,
    reconciliationGroupId: r.reconciliationGroupId,
    reconciliationRole: r.reconciliationRole as InboxTransaction["reconciliationRole"],
    reconciliationConfidence: r.reconciliationConfidence,
    reconciliationConfirmedAt: r.reconciliationConfirmedAt,
    createdAt: r.createdAt,
  };
}

export const drizzleInboxStore: InboxStore = {
  async getGroupMembers(groupId: string): Promise<InboxTransaction[]> {
    const rows = await db
      .select({
        id: transactions.id,
        bankAccountId: transactions.bankAccountId,
        bankType: bankCredentials.bankType,
        date: transactions.date,
        description: transactions.description,
        chargedAmount: transactions.chargedAmount,
        categoryId: transactions.categoryId,
        reconciliationGroupId: transactions.reconciliationGroupId,
        reconciliationRole: transactions.reconciliationRole,
        reconciliationConfidence: transactions.reconciliationConfidence,
        reconciliationConfirmedAt: transactions.reconciliationConfirmedAt,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .innerJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
      .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id))
      .where(eq(transactions.reconciliationGroupId, groupId));
    return rows.map(rowToInboxTxn);
  },

  async getGroupMembersByIds(groupIds: string[]): Promise<Map<string, InboxTransaction[]>> {
    if (groupIds.length === 0) return new Map();
    const rows = await db
      .select({
        id: transactions.id,
        bankAccountId: transactions.bankAccountId,
        bankType: bankCredentials.bankType,
        date: transactions.date,
        description: transactions.description,
        chargedAmount: transactions.chargedAmount,
        categoryId: transactions.categoryId,
        reconciliationGroupId: transactions.reconciliationGroupId,
        reconciliationRole: transactions.reconciliationRole,
        reconciliationConfidence: transactions.reconciliationConfidence,
        reconciliationConfirmedAt: transactions.reconciliationConfirmedAt,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .innerJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
      .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id))
      .where(inArray(transactions.reconciliationGroupId, groupIds));

    const map = new Map<string, InboxTransaction[]>();
    for (const row of rows) {
      const txn = rowToInboxTxn(row);
      if (!txn.reconciliationGroupId) continue;
      const arr = map.get(txn.reconciliationGroupId) ?? [];
      arr.push(txn);
      map.set(txn.reconciliationGroupId, arr);
    }
    return map;
  },

  async confirmGroup(groupId: string, now: Date, transferCategoryId: string | null): Promise<void> {
    await db.transaction(async (tx) => {
      // For transfer_pair groups with a known bankSide category flip,
      // we need the members to determine which is bankSide.
      // Re-fetch members inside the transaction for consistency.
      const members = await tx
        .select({
          id: transactions.id,
          bankType: bankCredentials.bankType,
          description: transactions.description,
          reconciliationRole: transactions.reconciliationRole,
          createdAt: transactions.createdAt,
        })
        .from(transactions)
        .innerJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
        .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id))
        .where(eq(transactions.reconciliationGroupId, groupId));

      const hasSettlementLump = members.some((m) => m.reconciliationRole === "settlement_lump");

      if (hasSettlementLump || !transferCategoryId) {
        // P1: confirm all, no category changes
        await tx
          .update(transactions)
          .set({ reconciliationConfirmedAt: now })
          .where(eq(transactions.reconciliationGroupId, groupId));
      } else {
        // P2 transfer_pair: identify bankSide, flip its category
        const { identifyBankSide } = await import("./inbox-ops");
        const bankSide = identifyBankSide(
          members.map((m) => ({
            id: m.id,
            bankAccountId: "",
            bankType: m.bankType as "discount" | "max" | "visaCal",
            date: "",
            description: m.description,
            chargedAmount: 0,
            categoryId: null,
            reconciliationGroupId: groupId,
            reconciliationRole: m.reconciliationRole as InboxTransaction["reconciliationRole"],
            reconciliationConfidence: null,
            reconciliationConfirmedAt: null,
            createdAt: m.createdAt,
          })),
        );

        for (const member of members) {
          if (bankSide && member.id === bankSide.id) {
            await tx
              .update(transactions)
              .set({ reconciliationConfirmedAt: now, categoryId: transferCategoryId })
              .where(eq(transactions.id, member.id));
          } else {
            await tx
              .update(transactions)
              .set({ reconciliationConfirmedAt: now })
              .where(eq(transactions.id, member.id));
          }
        }
      }
    });
  },

  async clearGroup(groupIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (const groupId of groupIds) {
        await tx
          .update(transactions)
          .set({
            reconciliationGroupId: null,
            reconciliationRole: null,
            reconciliationConfidence: null,
            reconciliationConfirmedAt: null,
          })
          .where(eq(transactions.reconciliationGroupId, groupId));
      }
    });
  },

  async clearRows(txnIds: string[]): Promise<void> {
    if (txnIds.length === 0) return;
    await db
      .update(transactions)
      .set({
        reconciliationGroupId: null,
        reconciliationRole: null,
        reconciliationConfidence: null,
        reconciliationConfirmedAt: null,
      })
      .where(inArray(transactions.id, txnIds));
  },

  async setCategory(txnId: string, categoryId: string | null): Promise<void> {
    await db.update(transactions).set({ categoryId }).where(eq(transactions.id, txnId));
  },

  async getCategoryIdByName(name: string): Promise<string | null> {
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.name, name))
      .limit(1);
    return rows[0]?.id ?? null;
  },

  async getRulesOrderedByPriority(): Promise<CategoryRule[]> {
    // Lower priority number = higher priority (verified by reading categorize() in rules.ts:
    // it sorts desc by priority, so highest number wins — but we fetch all and pass to categorize)
    const rows = await db.select().from(categoryRules).orderBy(asc(categoryRules.priority));
    return rows.map((r) => ({
      id: r.id,
      categoryId: r.categoryId,
      matchType: r.matchType,
      pattern: r.pattern,
      priority: r.priority,
    }));
  },
};
