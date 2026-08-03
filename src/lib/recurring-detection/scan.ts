import { detectPatterns } from "./detect";
import {
  detectPriceChanges,
  detectMissedPayments,
  detectDormant,
  detectNewlyDetected,
  countAnomalyAlerts,
} from "./anomalies";
import { drizzleRecurringStore, type RecurringStore } from "./store";
import type { RecurringPattern } from "./types";

/**
 * Persists detected patterns to the store via upsert.
 * On patternFingerprint conflict: updates amount/date/lastTxnId but NOT status,
 * so user-canceled or paused subscriptions are never silently resurrected.
 */
export async function persistDetectedPatterns(
  detected: RecurringPattern[],
  store: RecurringStore,
): Promise<void> {
  for (const pattern of detected) {
    await store.upsertPattern(pattern);
  }
}

/**
 * Full DB-backed orchestrator.
 * Fetches transactions from the store, runs pure detection, persists results.
 */
export async function runDetection(store: RecurringStore): Promise<void> {
  const txns = await store.getTransactionsForDetection();
  const patterns = detectPatterns(txns);
  await persistDetectedPatterns(patterns, store);
}

/**
 * DB-backed total anomaly count for the dashboard's attention feeder (#196).
 * Runs the same four detector calls the subscriptions page renders from, then
 * folds them with `countAnomalyAlerts` — so the dashboard's number and that
 * page's alert list are always in agreement. `store` defaults to the Drizzle
 * implementation; tests inject a fake to stay DB-free.
 */
export async function countPendingAnomalies(
  store: RecurringStore = drizzleRecurringStore,
  now: Date = new Date(),
): Promise<number> {
  const [patterns, recentTxns] = await Promise.all([
    store.getPersistedPatterns(),
    store.getTransactionsForDetection(),
  ]);

  return countAnomalyAlerts({
    priceChanges: detectPriceChanges(patterns, recentTxns),
    missedPayments: detectMissedPayments(patterns, recentTxns, now),
    dormant: detectDormant(patterns, recentTxns, now),
    newlyDetected: detectNewlyDetected(patterns, recentTxns),
  });
}
