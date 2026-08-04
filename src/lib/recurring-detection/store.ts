import { db } from "@/db";
import { transactions, recurringExpenses, categories } from "@/db/schema";
import { and, or, eq, gte, lt, ne, isNull, notInArray } from "drizzle-orm";
import type {
  DetectionTransaction,
  RecurringPattern,
  PersistedRecurringPattern,
  SeriesIdentity,
} from "./types";

// ── Store interface ───────────────────────────────────────────────────────────

export interface RecurringStore {
  /**
   * Fetches transactions for the detection scan.
   * Wide window: ≥18 months so quarterly/annual patterns reach 3 occurrences.
   */
  getTransactionsForDetection(): Promise<DetectionTransaction[]>;

  /**
   * Upserts a detected pattern keyed on patternFingerprint.
   * On conflict: update expectedAmount, nextExpectedDate, lastMatchedTxnId, updatedAt.
   * DO NOT overwrite status — preserves user-set paused/canceled state.
   */
  upsertPattern(pattern: RecurringPattern): Promise<void>;

  /**
   * All non-canceled patterns as the anomaly detectors need them. Mirrors the
   * row→pattern mapping in the subscriptions page exactly (#196 attention
   * count), so a pattern that would render an alert there is never miscounted
   * here. `occurrenceDates` is not a DB column — detectors never read it, so
   * it comes back empty.
   */
  getPersistedPatterns(): Promise<PersistedRecurringPattern[]>;

  /**
   * The identity of every persisted series — canceled rows INCLUDED, unlike
   * `getPersistedPatterns`.
   *
   * The write path remaps detected candidates onto these, so canceled series must
   * be visible. Matching only live rows was the alternative, and it lets a
   * dismissed series come back the moment its descriptor drifts: detection mints
   * a fresh active row under the new key, dodging the upsert's promise never to
   * revive a user-retired one. A merchant the user dismissed keeps charging —
   * that is the normal case, not evidence the dismissal was wrong.
   */
  getSeriesIdentities(): Promise<SeriesIdentity[]>;
}

// ── Drizzle implementation ────────────────────────────────────────────────────

export const drizzleRecurringStore: RecurringStore = {
  async getTransactionsForDetection(): Promise<DetectionTransaction[]> {
    // Fetch 18 months of history so quarterly (needs 3× per 3 months = 9 months)
    // and annual (needs 3× = 3 years, but we require ≥3 so we get what we can)
    // can reach the 3-occurrence threshold.
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 18);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Detection only considers money-OUT, non-internal transactions:
    //  - chargedAmount < 0  → expenses are negative; income/refunds are positive.
    //  - category type is NOT transfer/ignore/investment (internal/non-spend flows).
    //    Uncategorized rows (categoryId IS NULL → category.type IS NULL) are KEPT,
    //    since most subscriptions are uncategorized before rules exist.
    const rows = await db
      .select({
        id: transactions.id,
        description: transactions.description,
        chargedAmount: transactions.chargedAmount,
        date: transactions.date,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          gte(transactions.date, cutoffStr),
          lt(transactions.chargedAmount, "0"),
          or(
            isNull(categories.type),
            notInArray(categories.type, ["transfer", "ignore", "investment"]),
          ),
        ),
      )
      // Detection is order-sensitive at the margins (greedy clustering, and the
      // first-match-wins amount buckets), so an unordered scan could shift a
      // verdict between syncs over identical data.
      .orderBy(transactions.date, transactions.id);

    return rows.map((row) => ({
      id: row.id,
      description: row.description,
      chargedAmount: Number(row.chargedAmount),
      date: row.date,
    }));
  },

  async upsertPattern(pattern: RecurringPattern): Promise<void> {
    const nextDateStr = pattern.nextExpectedDate.toISOString().slice(0, 10);
    const now = new Date();

    await db
      .insert(recurringExpenses)
      .values({
        patternFingerprint: pattern.patternFingerprint,
        merchant: pattern.merchant,
        expectedAmount: String(pattern.expectedAmount),
        expectedCadence: pattern.cadence,
        nextExpectedDate: nextDateStr,
        lastMatchedTxnId: pattern.lastMatchedTxnId,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: recurringExpenses.patternFingerprint,
        set: {
          // Update dynamic fields only — DO NOT touch status (preserves canceled/paused)
          // DO NOT touch confirmedAt — preserves user review state across re-detection
          expectedAmount: String(pattern.expectedAmount),
          nextExpectedDate: nextDateStr,
          lastMatchedTxnId: pattern.lastMatchedTxnId,
          updatedAt: now,
        },
      });
  },

  async getSeriesIdentities(): Promise<SeriesIdentity[]> {
    const rows = await db
      .select({
        merchant: recurringExpenses.merchant,
        cadence: recurringExpenses.expectedCadence,
      })
      .from(recurringExpenses)
      .orderBy(recurringExpenses.merchant);

    return rows;
  },

  async getPersistedPatterns(): Promise<PersistedRecurringPattern[]> {
    const rows = await db
      .select({
        id: recurringExpenses.id,
        merchant: recurringExpenses.merchant,
        displayName: recurringExpenses.displayName,
        expectedAmount: recurringExpenses.expectedAmount,
        cadence: recurringExpenses.expectedCadence,
        nextExpectedDate: recurringExpenses.nextExpectedDate,
        status: recurringExpenses.status,
        confirmedAt: recurringExpenses.confirmedAt,
        patternFingerprint: recurringExpenses.patternFingerprint,
        lastMatchedTxnId: recurringExpenses.lastMatchedTxnId,
      })
      .from(recurringExpenses)
      .where(ne(recurringExpenses.status, "canceled"));

    return rows.map((row) => ({
      id: row.id,
      merchant: row.merchant,
      displayName: row.displayName ?? null,
      expectedAmount: Number(row.expectedAmount),
      cadence: row.cadence,
      occurrenceDates: [],
      lastMatchedTxnId: row.lastMatchedTxnId ?? "",
      patternFingerprint: row.patternFingerprint,
      nextExpectedDate: new Date(row.nextExpectedDate),
      status: row.status,
      confirmedAt: row.confirmedAt ?? null,
    }));
  },
};
