import { db } from "@/db";
import { bankAccounts, transactions, recurringExpenses } from "@/db/schema";
import { eq, and, gte, lte, ilike, inArray, isNull, count } from "drizzle-orm";
import { categorizeTransaction } from "@/lib/categories/rules";
import type { ScrapedAccount } from "@/lib/scraper/types";
import { importTransaction } from "./import";
import { createDbStore } from "./store";
import type { transactionFiltersSchema } from "./schemas";
import type { z } from "zod";
import { extractMerchant, amountsMatch } from "@/lib/transaction-matching";

export async function importScrapedAccounts(
  credentialId: string,
  scrapedAccounts: ScrapedAccount[],
): Promise<{ inserted: number; updated: number; skipped: number }> {
  const store = createDbStore();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const account of scrapedAccounts) {
    // Upsert bank_account — insert or update balance on conflict
    const [bankAccount] = await db
      .insert(bankAccounts)
      .values({
        credentialId,
        accountNumber: account.accountNumber,
        balance: account.balance?.toString() ?? null,
        balanceUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [bankAccounts.credentialId, bankAccounts.accountNumber],
        set: {
          balance: account.balance?.toString() ?? null,
          balanceUpdatedAt: new Date(),
        },
      })
      .returning({ id: bankAccounts.id });

    const accountId = bankAccount?.id;
    if (!accountId) continue;

    for (const tx of account.transactions) {
      const result = await importTransaction(tx, accountId, store, categorizeTransaction);
      if (result === "inserted") inserted++;
      else if (result === "updated") updated++;
      else skipped++;
    }
  }

  return { inserted, updated, skipped };
}

// ── Pure helpers (DB-free, unit-tested) ──────────────────────────────────────

export type CategoryFilterIntent =
  | { mode: "uncategorized" }
  | { mode: "category"; categoryId: string }
  | { mode: "all" };

/**
 * Resolves how to filter by category. `uncategorized` always wins: when true we
 * match rows with no category and IGNORE any categoryId. Otherwise a concrete
 * categoryId selects that category, and neither means no category constraint.
 */
export function resolveCategoryFilter(input: {
  uncategorized?: boolean;
  categoryId?: string;
}): CategoryFilterIntent {
  if (input.uncategorized) return { mode: "uncategorized" };
  if (input.categoryId) return { mode: "category", categoryId: input.categoryId };
  return { mode: "all" };
}

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** Assembles the paginated API response shape from its parts. */
export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return { data, total, page, pageSize };
}

export async function getTransactions(filters: z.infer<typeof transactionFiltersSchema>) {
  const {
    dateFrom,
    dateTo,
    bankAccountId,
    categoryId,
    status,
    search,
    uncategorized,
    page,
    pageSize,
  } = filters;
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (dateFrom) conditions.push(gte(transactions.date, dateFrom));
  if (dateTo) conditions.push(lte(transactions.date, dateTo));
  if (bankAccountId) conditions.push(eq(transactions.bankAccountId, bankAccountId));
  const categoryFilter = resolveCategoryFilter({ uncategorized, categoryId });
  if (categoryFilter.mode === "uncategorized") {
    conditions.push(isNull(transactions.categoryId));
  } else if (categoryFilter.mode === "category") {
    conditions.push(eq(transactions.categoryId, categoryFilter.categoryId));
  }
  if (status) conditions.push(eq(transactions.status, status));
  if (search) conditions.push(ilike(transactions.description, `%${search}%`));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, activeRecurring, totalResult] = await Promise.all([
    db.query.transactions.findMany({
      where: whereClause,
      orderBy: (t, { desc }) => [desc(t.date), desc(t.createdAt)],
      limit: pageSize,
      offset,
    }),
    // Recurring badges are a non-essential overlay. Isolate this query so a
    // failure (e.g. recurring_expenses not yet migrated) degrades to "no
    // badges" instead of 500ing the entire transactions list.
    db
      .select({
        id: recurringExpenses.id,
        merchant: recurringExpenses.merchant,
        expectedAmount: recurringExpenses.expectedAmount,
        expectedCadence: recurringExpenses.expectedCadence,
      })
      .from(recurringExpenses)
      .where(eq(recurringExpenses.status, "active"))
      .catch(
        () =>
          [] as Array<{
            id: string;
            merchant: string;
            expectedAmount: string;
            expectedCadence: "monthly" | "quarterly" | "annual";
          }>,
      ),
    // Total count across all active filters (same conditions), run in parallel.
    db.select({ count: count() }).from(transactions).where(whereClause),
  ]);

  const total = totalResult[0]?.count ?? 0;

  const data = rows.map((r) => {
    const txnMerchant = extractMerchant(r.description);
    // Detection stores expectedAmount as an absolute (positive) value, while
    // expense chargedAmounts are negative. amountsMatch rejects opposite signs,
    // so compare on absolute value or no expense would ever match.
    const txnAmount = Math.abs(Number(r.chargedAmount));
    const matched = activeRecurring.find(
      (re) => re.merchant === txnMerchant && amountsMatch(txnAmount, Number(re.expectedAmount)),
    );
    return {
      id: r.id,
      bankAccountId: r.bankAccountId,
      externalId: r.externalId,
      date: r.date,
      processedDate: r.processedDate,
      description: r.description,
      customDescription: r.customDescription,
      memo: r.memo,
      originalAmount: Number(r.originalAmount),
      originalCurrency: r.originalCurrency,
      chargedAmount: Number(r.chargedAmount),
      chargedCurrency: r.chargedCurrency,
      type: r.type,
      installmentNumber: r.installmentNumber,
      installmentTotal: r.installmentTotal,
      status: r.status,
      categoryId: r.categoryId,
      reconciliationGroupId: r.reconciliationGroupId,
      reconciliationConfirmedAt: r.reconciliationConfirmedAt
        ? r.reconciliationConfirmedAt.toISOString()
        : null,
      scrapedAt: r.scrapedAt,
      recurringExpenseId: matched?.id ?? null,
      recurringExpense: matched
        ? { id: matched.id, merchant: matched.merchant, cadence: matched.expectedCadence }
        : null,
    };
  });

  return buildPaginatedResult(data, total, page, pageSize);
}

export async function updateTransaction(
  id: string,
  changes: { customDescription?: string | null; categoryId?: string | null },
): Promise<void> {
  const dbChanges: Record<string, unknown> = { updatedAt: new Date() };
  if ("customDescription" in changes) dbChanges.customDescription = changes.customDescription;
  if ("categoryId" in changes) dbChanges.categoryId = changes.categoryId;
  await db.update(transactions).set(dbChanges).where(eq(transactions.id, id));
}

export async function bulkCategorize(transactionIds: string[], categoryId: string): Promise<void> {
  await db
    .update(transactions)
    .set({ categoryId, updatedAt: new Date() })
    .where(inArray(transactions.id, transactionIds));
}
