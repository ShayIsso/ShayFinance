import { db } from "@/db";
import { transactions, categories, bankAccounts, bankCredentials } from "@/db/schema";
import { eq, gte, inArray } from "drizzle-orm";
import type { ReconciliationTransaction } from "./types";

export interface ReconciliationStore {
  getRecentTransactions(windowDays: number): Promise<ReconciliationTransaction[]>;
  getCategoryIdByName(name: string): Promise<string | null>;
  applyAutoReconciliation(args: {
    groupId: string;
    bankLumpId: string;
    cardDetailIds: string[];
    confidence: number;
    settlementCategoryId: string;
  }): Promise<void>;
  queueReconciliation(args: {
    groupId: string;
    bankLumpId: string;
    cardDetailIds: string[];
    confidence: number;
  }): Promise<void>;
}

export const drizzleReconciliationStore: ReconciliationStore = {
  async getRecentTransactions(windowDays: number): Promise<ReconciliationTransaction[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const rows = await db
      .select({
        id: transactions.id,
        bankAccountId: transactions.bankAccountId,
        bankType: bankCredentials.bankType,
        date: transactions.date,
        chargedAmount: transactions.chargedAmount,
        description: transactions.description,
        categoryId: transactions.categoryId,
        reconciliationGroupId: transactions.reconciliationGroupId,
      })
      .from(transactions)
      .innerJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
      .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id))
      .where(gte(transactions.date, cutoffStr));

    return rows.map((row) => ({
      id: row.id,
      bankAccountId: row.bankAccountId,
      bankType: row.bankType as "discount" | "max" | "visaCal",
      date: row.date,
      chargedAmount: Number(row.chargedAmount),
      description: row.description,
      categoryId: row.categoryId,
      reconciliationGroupId: row.reconciliationGroupId,
    }));
  },

  async getCategoryIdByName(name: string): Promise<string | null> {
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.name, name))
      .limit(1);
    return rows[0]?.id ?? null;
  },

  async applyAutoReconciliation(args: {
    groupId: string;
    bankLumpId: string;
    cardDetailIds: string[];
    confidence: number;
    settlementCategoryId: string;
  }): Promise<void> {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(transactions)
        .set({
          reconciliationGroupId: args.groupId,
          reconciliationRole: "settlement_lump",
          reconciliationConfidence: args.confidence,
          reconciliationConfirmedAt: now,
          categoryId: args.settlementCategoryId,
        })
        .where(eq(transactions.id, args.bankLumpId));

      if (args.cardDetailIds.length > 0) {
        await tx
          .update(transactions)
          .set({
            reconciliationGroupId: args.groupId,
            reconciliationRole: "settlement_detail",
            reconciliationConfidence: args.confidence,
            reconciliationConfirmedAt: now,
          })
          .where(inArray(transactions.id, args.cardDetailIds));
      }
    });
  },

  async queueReconciliation(args: {
    groupId: string;
    bankLumpId: string;
    cardDetailIds: string[];
    confidence: number;
  }): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(transactions)
        .set({
          reconciliationGroupId: args.groupId,
          reconciliationRole: "settlement_lump",
          reconciliationConfidence: args.confidence,
        })
        .where(eq(transactions.id, args.bankLumpId));

      if (args.cardDetailIds.length > 0) {
        await tx
          .update(transactions)
          .set({
            reconciliationGroupId: args.groupId,
            reconciliationRole: "settlement_detail",
            reconciliationConfidence: args.confidence,
          })
          .where(inArray(transactions.id, args.cardDetailIds));
      }
    });
  },
};
