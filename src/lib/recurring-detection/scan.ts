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

function lastOccurrence(pattern: RecurringPattern): number {
  const dates = pattern.occurrenceDates;
  return dates.length ? dates[dates.length - 1].getTime() : 0;
}

/**
 * One pattern per fingerprint: the regime whose last occurrence is most recent.
 *
 * A merchant billing several `price regime`s at one cadence yields one candidate
 * per regime, and the fingerprint is keyed on (merchant, cadence) — so they all
 * address the SAME row. Upserting each in turn would leave the row describing
 * whichever regime the scan happened to write last, and the store's query has no
 * ORDER BY, so the stored amount could flip between regimes sync to sync. The
 * current regime is the one the row should describe.
 */
function currentRegimePerFingerprint(detected: RecurringPattern[]): RecurringPattern[] {
  const byFingerprint = new Map<string, RecurringPattern>();

  for (const pattern of detected) {
    const held = byFingerprint.get(pattern.patternFingerprint);
    if (!held || lastOccurrence(pattern) > lastOccurrence(held)) {
      byFingerprint.set(pattern.patternFingerprint, pattern);
    }
  }

  return [...byFingerprint.values()];
}

/**
 * Persists detected patterns to the store via upsert.
 * On patternFingerprint conflict: updates amount/date/lastTxnId but NOT status,
 * so user-canceled or paused subscriptions are never silently resurrected.
 */
export async function persistDetectedPatterns(
  detected: RecurringPattern[],
  store: RecurringStore,
): Promise<void> {
  for (const pattern of currentRegimePerFingerprint(detected)) {
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
