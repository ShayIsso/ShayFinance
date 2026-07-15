import { db } from "@/db";
import { merchantMemory, categoryCorrections, transactions, categories } from "@/db/schema";
import { eq, inArray, or, and, isNull, ilike, sql, type SQL } from "drizzle-orm";
import {
  recordAssignment,
  applyCorrection,
  applyBulkCategorization,
  undoFanOut,
  type MerchantMemoryStore,
  type MemoryEntry,
  type FannedOutRow,
} from "./memory";

// Both `db` and a transaction handle satisfy this surface, so the store can be
// bound either to the connection (import lookups) or to a single transaction
// (atomic corrections — ADR-0010 §6).
type DbClient = Pick<typeof db, "select" | "insert" | "update" | "delete">;

/**
 * The overwrite law (ADR-0010 §3) as a Drizzle predicate — the single SQL
 * expression of "automation may touch this row". Owned here because
 * merchant-memory owns the law; retroactive rule application consumes it too.
 */
export function overwriteLawSql(): SQL {
  return or(isNull(transactions.categorySource), eq(transactions.categorySource, "ai"))!;
}

/**
 * Over-inclusive SQL prefilter for fan-out candidates. extractMerchant only
 * strips prefixes/digit-tokens/domain suffixes, lowercases Latin, and
 * collapses whitespace — so every whitespace-separated token of a key appears
 * verbatim and in order in any description that derives to that key. ILIKE
 * '%tok1%tok2%…%' therefore never excludes a true match (exact key equality
 * is re-checked in JS by selectFanOutTargets) while keeping the scan off the
 * whole table. Assumes stored descriptions are NFC like the key.
 */
function merchantKeyPrefilter(merchantKey: string): SQL | undefined {
  const tokens = merchantKey.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return undefined;
  const escaped = tokens.map((t) => t.replace(/[\\%_]/g, "\\$&"));
  return ilike(transactions.description, `%${escaped.join("%")}%`);
}

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

    async deleteEntry(merchantKey) {
      await client.delete(merchantMemory).where(eq(merchantMemory.merchantKey, merchantKey));
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

    async getOverwritableTransactions(merchantKey) {
      const rows = await client
        .select({
          id: transactions.id,
          description: transactions.description,
          categoryId: transactions.categoryId,
          categorySource: transactions.categorySource,
        })
        .from(transactions)
        .where(and(overwriteLawSql(), merchantKeyPrefilter(merchantKey)));
      return rows.map((r) => ({
        id: r.id,
        description: r.description,
        categoryId: r.categoryId ?? null,
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

    async restoreTransactionCategories(rows, now) {
      for (const row of rows) {
        await client
          .update(transactions)
          .set({
            categoryId: row.previousCategoryId,
            categorySource: row.previousCategorySource,
            updatedAt: now,
          })
          .where(eq(transactions.id, row.id));
      }
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
): Promise<{ fanOutCount: number; fannedOut: FannedOutRow[]; wasCorrection: boolean }> {
  return db.transaction(async (tx) => {
    const store = createMerchantMemoryStore(tx);
    const txn = await store.getTransaction(transactionId);
    if (!txn) return { fanOutCount: 0, fannedOut: [], wasCorrection: false };

    if (txn.categoryId === null) {
      const result = await recordAssignment({ transactionId, toCategoryId, tier: "user" }, store);
      return { ...result, wasCorrection: false };
    }

    const result = await applyCorrection({ transactionId, toCategoryId }, store);
    return { ...result, wasCorrection: true };
  });
}

/**
 * DB entry point for bulk manual categorization — one transaction wrapping
 * applyBulkCategorization so log rows, memory writes, and fan-out never
 * partially apply.
 */
export async function bulkChangeTransactionCategories(
  transactionIds: string[],
  toCategoryId: string,
): Promise<{ fanOutCount: number; fannedOut: FannedOutRow[] }> {
  return db.transaction(async (tx) =>
    applyBulkCategorization({ transactionIds, toCategoryId }, createMerchantMemoryStore(tx)),
  );
}

/** DB entry point for one-click fan-out undo — restores in one transaction. */
export async function undoCategoryFanOut(rows: FannedOutRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db.transaction(async (tx) => undoFanOut(rows, createMerchantMemoryStore(tx)));
}
