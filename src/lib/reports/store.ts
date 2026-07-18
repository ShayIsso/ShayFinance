/**
 * Store-backed unpaginated read for the CSV export (Store pattern — prior art
 * `transactions/store.ts`). Reuses `buildTransactionFilterConditions` from
 * `@/lib/transactions` rather than re-deriving WHERE conditions, so the
 * export can never drift from what the transactions listing filters on
 * (issue #163 — WYSIWYG). Joins bank + category context the listing doesn't
 * need; row shaping/labels stay in the pure `csv.ts` core.
 */
import { db } from "@/db";
import { transactions, bankAccounts, bankCredentials, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  buildTransactionFilterConditions,
  type TransactionFilterConditions,
} from "@/lib/transactions";
import type { ReportRow } from "./csv";

export type ReportsStore = {
  getFilteredTransactions(filters: TransactionFilterConditions): Promise<ReportRow[]>;
};

const parentCategories = alias(categories, "parent_categories");

export const drizzleReportsStore: ReportsStore = {
  async getFilteredTransactions(filters) {
    const whereClause = buildTransactionFilterConditions(filters);

    const rows = await db
      .select({
        date: transactions.date,
        processedDate: transactions.processedDate,
        description: transactions.description,
        customDescription: transactions.customDescription,
        bankType: bankCredentials.bankType,
        accountNumber: bankAccounts.accountNumber,
        categoryName: categories.name,
        categoryType: categories.type,
        groupName: parentCategories.name,
        chargedAmount: transactions.chargedAmount,
        chargedCurrency: transactions.chargedCurrency,
        originalAmount: transactions.originalAmount,
        originalCurrency: transactions.originalCurrency,
        installmentNumber: transactions.installmentNumber,
        installmentTotal: transactions.installmentTotal,
        status: transactions.status,
        categorySource: transactions.categorySource,
        memo: transactions.memo,
      })
      .from(transactions)
      .innerJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
      .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(parentCategories, eq(categories.parentId, parentCategories.id))
      .where(whereClause)
      .orderBy(transactions.date, transactions.createdAt);

    // Decimal columns come back as strings from Drizzle — convert once here so
    // the pure core (csv.ts) only ever sees numbers.
    return rows.map((r) => ({
      ...r,
      chargedAmount: Number(r.chargedAmount),
      originalAmount: Number(r.originalAmount),
    }));
  },
};
