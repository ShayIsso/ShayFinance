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
import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  buildTransactionFilterConditions,
  type TransactionFilterConditions,
} from "@/lib/transactions";
import { getGroupLeafIndex } from "@/lib/categories";
import {
  getMonthTransactions,
  getRollupCategories,
  type TransactionWithCategory,
  type RollupCategory,
} from "@/lib/analytics";
import { listBudgets, getMonthlyTargets } from "@/lib/budgets";
import type { ReportRow } from "./csv";

/** A calendar month with at least one transaction, for the report month picker. */
export type ReportMonth = { year: number; month: number };

/** A budget's raw configuration (no display fields — the wrapper joins those from `getRollupCategories`). */
export type BudgetConfigRow = { id: string; categoryId: string; monthlyLimit: number };

export type ReportsStore = {
  getFilteredTransactions(filters: TransactionFilterConditions): Promise<ReportRow[]>;
  /** Typed rows for one calendar month (on `transactions.date`), for the monthly report. */
  getMonthTransactions(year: number, month: number): Promise<TransactionWithCategory[]>;
  /** The category roll-up structure both report months read (ADR-0011 shape). */
  getRollupCategories(): Promise<RollupCategory[]>;
  /** Every calendar month that has any transaction, newest first. */
  getAvailableMonths(): Promise<ReportMonth[]>;
  /** Every budget's current configuration (issue #169 — month-close verdicts are judged against current values). */
  getBudgetConfigs(): Promise<BudgetConfigRow[]>;
  /** The current monthly savings target, or null when unset. */
  getSavingsTarget(): Promise<number | null>;
};

const parentCategories = alias(categories, "parent_categories");

export const drizzleReportsStore: ReportsStore = {
  async getFilteredTransactions(filters) {
    // Same subtree expansion the listing uses (#174), so a group filter exports
    // exactly the rows it lists — WYSIWYG holds through the CSV.
    const groupLeafIds = filters.categoryId ? await getGroupLeafIndex() : undefined;
    const whereClause = buildTransactionFilterConditions(filters, groupLeafIds);

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

  // Month read + roll-up structure are owned by analytics (issue #168) so the
  // report window can never diverge from the Dashboard's; the store just routes
  // through them behind the Store seam for test injection.
  getMonthTransactions,
  getRollupCategories,

  async getAvailableMonths() {
    const rows = await db
      .select({
        year: sql<number>`extract(year from ${transactions.date})::int`,
        month: sql<number>`extract(month from ${transactions.date})::int`,
      })
      .from(transactions)
      .groupBy(
        sql`extract(year from ${transactions.date})`,
        sql`extract(month from ${transactions.date})`,
      )
      .orderBy(
        sql`extract(year from ${transactions.date}) desc`,
        sql`extract(month from ${transactions.date}) desc`,
      );
    return rows.map((r) => ({ year: Number(r.year), month: Number(r.month) }));
  },

  // Both routed through the budgets module's own index.ts (its public
  // interface) rather than querying `budgets`/`monthlyTargets` tables here
  // directly — reports composes budgets' reads, it doesn't duplicate them.
  async getBudgetConfigs() {
    return listBudgets();
  },

  async getSavingsTarget() {
    const { savingsTarget } = await getMonthlyTargets();
    return savingsTarget;
  },
};
