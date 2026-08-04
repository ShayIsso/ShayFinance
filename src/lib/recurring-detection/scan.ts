import { detectPatterns } from "./detect";
import {
  detectPriceChanges,
  detectMissedPayments,
  detectDormant,
  detectNewlyDetected,
  countAnomalyAlerts,
} from "./anomalies";
import { drizzleRecurringStore, type RecurringStore } from "./store";
import { buildFingerprint } from "./fingerprint";
import { sameMerchant } from "@/lib/transaction-matching";
import type { RecurringPattern, SeriesIdentity } from "./types";

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
 * Renames each candidate onto the series it already is, where one exists: an
 * `existing` row of the same cadence whose stored merchant is the same
 * CONTEXT.md `merchant identity`. Carrying that row's merchant carries its
 * fingerprint, so the upsert updates in place.
 *
 * Detection alone cannot guarantee this. Its representative is canonical for a
 * given scan, but the scan window slides, so the dominant descriptor form of a
 * merchant whose descriptor drifts mid-history can change between syncs — and a
 * new fingerprint means a second row for one series. Both rows would then stay
 * live, because evidence matching heals every form, and the forecast would count
 * the charge twice.
 *
 * Read and write paths therefore agree on identity, not merely on normalization.
 */
export function alignToPersistedSeries(
  detected: RecurringPattern[],
  existing: SeriesIdentity[],
): RecurringPattern[] {
  return detected.map((pattern) => {
    const match = existing.find(
      (row) => row.cadence === pattern.cadence && sameMerchant(row.merchant, pattern.merchant),
    );
    if (!match || match.merchant === pattern.merchant) return pattern;

    return {
      ...pattern,
      merchant: match.merchant,
      patternFingerprint: buildFingerprint(match.merchant, pattern.cadence),
    };
  });
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
  const existing = await store.getSeriesIdentities();

  // Align before deduping: candidates renamed onto one existing series then
  // collapse to that series' current regime rather than racing each other.
  const aligned = alignToPersistedSeries(detected, existing);

  for (const pattern of currentRegimePerFingerprint(aligned)) {
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
