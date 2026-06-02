import { detectPatterns } from "./detect";
import type { RecurringStore } from "./store";
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
