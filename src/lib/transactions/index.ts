import { db } from "@/db";
import { bankAccounts, transactions } from "@/db/schema";
import { eq, and, gte, lte, ilike, inArray } from "drizzle-orm";
import { categorizeTransaction } from "@/lib/categories/rules";
import type { ScrapedAccount } from "@/lib/scraper/types";
import { importTransaction } from "./import";
import { createDbStore } from "./store";
import type { transactionFiltersSchema } from "./schemas";
import type { z } from "zod";

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

export async function getTransactions(filters: z.infer<typeof transactionFiltersSchema>) {
  const { dateFrom, dateTo, bankAccountId, categoryId, status, search, page, pageSize } = filters;
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (dateFrom) conditions.push(gte(transactions.date, dateFrom));
  if (dateTo) conditions.push(lte(transactions.date, dateTo));
  if (bankAccountId) conditions.push(eq(transactions.bankAccountId, bankAccountId));
  if (categoryId) conditions.push(eq(transactions.categoryId, categoryId));
  if (status) conditions.push(eq(transactions.status, status));
  if (search) conditions.push(ilike(transactions.description, `%${search}%`));

  const rows = await db.query.transactions.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: (t, { desc }) => [desc(t.date), desc(t.createdAt)],
    limit: pageSize,
    offset,
  });

  return rows.map((r) => ({
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
  }));
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
