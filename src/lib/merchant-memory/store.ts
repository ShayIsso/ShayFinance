import { db } from "@/db";
import { merchantMemory, categoryCorrections, transactions, categories } from "@/db/schema";
import { eq, inArray, or, isNull, sql } from "drizzle-orm";
import {
  recordAssignment,
  applyCorrection,
  type MerchantMemoryStore,
  type MemoryEntry,
} from "./memory";

// Both `db` and a transaction handle satisfy this surface, so the store can be
// bound either to the connection (import lookups) or to a single transaction
// (atomic corrections — ADR-0010 §6).
type DbClient = Pick<typeof db, "select" | "insert" | "update">;

export function createMerchantMemoryStore(client: DbClient = db): MerchantMemoryStore {
  return {
    async findEntriesByKeys(keys) {
      if (keys.length === 0) return [];
      const rows = await client
        .select({
          merchantKey: merchantMemory.merchantKey,
          categoryId: merchantMemory.categoryId,
          source: merchantMemory.source,
        })
        .from(merchantMemory)
        .where(inArray(merchantMemory.merchantKey, keys));
      return rows.map((r) => ({
        merchantKey: r.merchantKey,
        categoryId: r.categoryId,
        source: r.source,
      }));
    },

    async recordHits(keys, now) {
      if (keys.length === 0) return;
      await client
        .update(merchantMemory)
        .set({ hitCount: sql`${merchantMemory.hitCount} + 1`, lastHitAt: now })
        .where(inArray(merchantMemory.merchantKey, keys));
    },

    async getEntry(merchantKey) {
      const rows = await client
        .select({
          merchantKey: merchantMemory.merchantKey,
          categoryId: merchantMemory.categoryId,
          source: merchantMemory.source,
        })
        .from(merchantMemory)
        .where(eq(merchantMemory.merchantKey, merchantKey));
      const r = rows[0];
      return r ? { merchantKey: r.merchantKey, categoryId: r.categoryId, source: r.source } : null;
    },

    async upsertEntry(entry: MemoryEntry, now) {
      await client
        .insert(merchantMemory)
        .values({
          merchantKey: entry.merchantKey,
          categoryId: entry.categoryId,
          source: entry.source,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: merchantMemory.merchantKey,
          set: { categoryId: entry.categoryId, source: entry.source, updatedAt: now },
        });
    },

    async getTransaction(id) {
      const rows = await client
        .select({
          id: transactions.id,
          description: transactions.description,
          categoryId: transactions.categoryId,
          categorySource: transactions.categorySource,
        })
        .from(transactions)
        .where(eq(transactions.id, id));
      const r = rows[0];
      return r
        ? {
            id: r.id,
            description: r.description,
            categoryId: r.categoryId ?? null,
            categorySource: r.categorySource ?? null,
          }
        : null;
    },

    async getCategoryName(categoryId) {
      const rows = await client
        .select({ name: categories.name })
        .from(categories)
        .where(eq(categories.id, categoryId));
      return rows[0]?.name ?? null;
    },

    async getOverwritableTransactions() {
      const rows = await client
        .select({
          id: transactions.id,
          description: transactions.description,
          categorySource: transactions.categorySource,
        })
        .from(transactions)
        .where(or(isNull(transactions.categorySource), eq(transactions.categorySource, "ai")));
      return rows.map((r) => ({
        id: r.id,
        description: r.description,
        categorySource: r.categorySource ?? null,
      }));
    },

    async setTransactionCategory(ids, categoryId, source, now) {
      if (ids.length === 0) return;
      await client
        .update(transactions)
        .set({ categoryId, categorySource: source, updatedAt: now })
        .where(inArray(transactions.id, ids));
    },

    async appendCorrection(row) {
      await client.insert(categoryCorrections).values({
        transactionId: row.transactionId,
        merchantKey: row.merchantKey,
        descriptionRedacted: row.descriptionRedacted,
        fromCategoryName: row.fromCategoryName,
        toCategoryName: row.toCategoryName,
        fromCategoryId: row.fromCategoryId,
        toCategoryId: row.toCategoryId,
        fromSource: row.fromSource,
      });
    },
  };
}

/**
 * DB entry point for the transaction category-change path (ADR-0010 §4).
 * Routes an already-categorized transaction through applyCorrection (logs a
 * correction) and a first-time labeling through recordAssignment (no log row).
 * The whole operation runs in one DB transaction so memory, log, and fan-out
 * can never partially apply.
 */
export async function changeTransactionCategory(
  transactionId: string,
  toCategoryId: string,
): Promise<{ fanOutCount: number; wasCorrection: boolean }> {
  return db.transaction(async (tx) => {
    const store = createMerchantMemoryStore(tx);
    const txn = await store.getTransaction(transactionId);
    if (!txn) return { fanOutCount: 0, wasCorrection: false };

    if (txn.categoryId === null) {
      const { fanOutCount } = await recordAssignment(
        { transactionId, toCategoryId, tier: "user" },
        store,
      );
      return { fanOutCount, wasCorrection: false };
    }

    const { fanOutCount } = await applyCorrection({ transactionId, toCategoryId }, store);
    return { fanOutCount, wasCorrection: true };
  });
}
