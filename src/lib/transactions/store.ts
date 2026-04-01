import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import type { TransactionStore, StoredTransaction, NewTransaction } from "./import";

function rowToStored(row: typeof transactions.$inferSelect): StoredTransaction {
  return {
    id: row.id,
    bankAccountId: row.bankAccountId,
    externalId: row.externalId ?? null,
    date: row.date,
    processedDate: row.processedDate,
    description: row.description,
    chargedAmount: Number(row.chargedAmount),
    status: row.status,
    categoryId: row.categoryId ?? null,
  };
}

export function createDbStore(): TransactionStore {
  return {
    async findByExternalId(externalId, bankAccountId) {
      const row = await db.query.transactions.findFirst({
        where: and(
          eq(transactions.externalId, externalId),
          eq(transactions.bankAccountId, bankAccountId),
        ),
      });
      return row ? rowToStored(row) : null;
    },

    async findByComposite(date, chargedAmount, description, bankAccountId) {
      const row = await db.query.transactions.findFirst({
        where: and(
          isNull(transactions.externalId),
          eq(transactions.date, date),
          eq(transactions.chargedAmount, chargedAmount.toString()),
          eq(transactions.description, description),
          eq(transactions.bankAccountId, bankAccountId),
        ),
      });
      return row ? rowToStored(row) : null;
    },

    async insert(tx: NewTransaction) {
      const [row] = await db
        .insert(transactions)
        .values({
          bankAccountId: tx.bankAccountId,
          externalId: tx.externalId,
          date: tx.date,
          processedDate: tx.processedDate,
          description: tx.description,
          memo: tx.memo,
          originalAmount: tx.originalAmount.toString(),
          originalCurrency: tx.originalCurrency,
          chargedAmount: tx.chargedAmount.toString(),
          chargedCurrency: tx.chargedCurrency,
          type: tx.type,
          installmentNumber: tx.installmentNumber,
          installmentTotal: tx.installmentTotal,
          status: tx.status,
          categoryId: tx.categoryId,
        })
        .returning({ id: transactions.id });
      return row.id;
    },

    async update(id, changes) {
      const dbChanges: Partial<typeof transactions.$inferInsert> = {};
      if (changes.status !== undefined) dbChanges.status = changes.status;
      if (changes.processedDate !== undefined) dbChanges.processedDate = changes.processedDate;
      if (changes.chargedAmount !== undefined)
        dbChanges.chargedAmount = changes.chargedAmount.toString();
      if (changes.externalId !== undefined) dbChanges.externalId = changes.externalId;
      dbChanges.updatedAt = new Date();
      await db.update(transactions).set(dbChanges).where(eq(transactions.id, id));
    },
  };
}
