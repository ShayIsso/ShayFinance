import { extractMerchant, amountsMatch, scoreSimilarity } from "@/lib/transaction-matching";
import type { DetectionTransaction, RecurringPattern, Cadence } from "./types";
import { buildFingerprint } from "./fingerprint";
import { computeNextExpectedDate } from "./next-date";

// ── Cadence classification ────────────────────────────────────────────────────

/** Day ranges (inclusive) for each cadence class, with ±7d drift tolerance. */
const CADENCE_RANGES: Array<{ cadence: Cadence; min: number; max: number }> = [
  { cadence: "monthly", min: 28 - 7, max: 31 + 7 },
  { cadence: "quarterly", min: 88 - 7, max: 93 + 7 },
  { cadence: "annual", min: 360 - 7, max: 370 + 7 },
];

function classifyDelta(days: number): Cadence | null {
  for (const range of CADENCE_RANGES) {
    if (days >= range.min && days <= range.max) return range.cadence;
  }
  return null;
}

/**
 * Given a sorted list of dates, compute day-deltas between consecutive pairs
 * and return the cadence if ALL deltas agree on the same cadence.
 * Returns null if any delta is unclassifiable or if cadences are mixed.
 */
function classifyCadence(sortedDates: Date[]): Cadence | null {
  if (sortedDates.length < 2) return null;
  let cadence: Cadence | null = null;
  for (let i = 1; i < sortedDates.length; i++) {
    const diffMs = sortedDates[i].getTime() - sortedDates[i - 1].getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const c = classifyDelta(diffDays);
    if (c === null) return null; // unclassifiable gap
    if (cadence === null) {
      cadence = c;
    } else if (cadence !== c) {
      return null; // mixed cadence — reject
    }
  }
  return cadence;
}

// ── Fuzzy merchant clustering ─────────────────────────────────────────────────

const STRONG_MATCH_THRESHOLD = 0.7;

/**
 * Groups transactions by fuzzy merchant similarity.
 * Each group contains transactions that likely belong to the same merchant.
 *
 * Algorithm: greedy single-linkage clustering.
 * - For each transaction, extract its merchant name.
 * - Find the first existing cluster whose representative merchant scores
 *   ≥ 0.7 (JW²) against this transaction's merchant.
 * - If found, add to that cluster; otherwise start a new cluster.
 */
function clusterByMerchant(
  txns: DetectionTransaction[],
): Map<string, { representative: string; txns: DetectionTransaction[] }> {
  const clusters = new Map<string, { representative: string; txns: DetectionTransaction[] }>();

  for (const txn of txns) {
    const merchant = extractMerchant(txn.description);
    if (!merchant) continue;

    let assigned = false;
    for (const [key, cluster] of clusters) {
      const score = scoreSimilarity(cluster.representative, merchant);
      if (score >= STRONG_MATCH_THRESHOLD) {
        cluster.txns.push(txn);
        assigned = true;
        break;
      }
      void key; // suppress unused-var lint
    }

    if (!assigned) {
      clusters.set(merchant, { representative: merchant, txns: [txn] });
    }
  }

  return clusters;
}

// ── Amount sub-clustering ─────────────────────────────────────────────────────

/**
 * Further partitions a merchant cluster into amount buckets (±10%).
 * Returns an array of groups where each group has amounts within ±10% of each other.
 */
function partitionByAmount(
  txns: DetectionTransaction[],
): Array<{ txns: DetectionTransaction[]; representativeAmount: number }> {
  const groups: Array<{ txns: DetectionTransaction[]; representativeAmount: number }> = [];

  for (const txn of txns) {
    const amount = Math.abs(txn.chargedAmount);
    let assigned = false;
    for (const group of groups) {
      if (amountsMatch(amount, group.representativeAmount, { amountTolerancePct: 0.1 })) {
        group.txns.push(txn);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      groups.push({ txns: [txn], representativeAmount: amount });
    }
  }

  return groups;
}

// ── Rolling average of last 3 ─────────────────────────────────────────────────

function rollingAvgLast3(amounts: number[]): number {
  const last3 = amounts.slice(-3);
  return last3.reduce((s, a) => s + a, 0) / last3.length;
}

// ── Main detection function ───────────────────────────────────────────────────

/**
 * Pure function. Detects recurring expense patterns from a slice of transactions.
 *
 * Requirements:
 * - ≥ 3 occurrences in the same merchant + amount bucket
 * - All consecutive date deltas must classify to the same cadence
 * - Mixed/inconsistent cadence groups are rejected
 * - No Date.now() or Math.random() — fully deterministic
 */
export function detectPatterns(txns: DetectionTransaction[]): RecurringPattern[] {
  if (!txns.length) return [];

  const merchantClusters = clusterByMerchant(txns);
  const patterns: RecurringPattern[] = [];

  for (const cluster of merchantClusters.values()) {
    const amountGroups = partitionByAmount(cluster.txns);

    for (const group of amountGroups) {
      if (group.txns.length < 3) continue;

      // Sort by date ascending
      const sorted = [...group.txns].sort((a, b) => a.date.localeCompare(b.date));
      const sortedDates = sorted.map((t) => new Date(t.date));

      const cadence = classifyCadence(sortedDates);
      if (cadence === null) continue; // mixed or unclassifiable — reject

      const amounts = sorted.map((t) => Math.abs(t.chargedAmount));
      const expectedAmount = rollingAvgLast3(amounts);

      const merchant = cluster.representative;
      const fingerprint = buildFingerprint(merchant, cadence);
      const lastMatchedTxnId = sorted[sorted.length - 1].id;

      const pattern: RecurringPattern = {
        merchant,
        expectedAmount,
        cadence,
        occurrenceDates: sortedDates,
        lastMatchedTxnId,
        patternFingerprint: fingerprint,
        nextExpectedDate: new Date(), // placeholder — overwritten below
      };
      pattern.nextExpectedDate = computeNextExpectedDate(pattern);

      patterns.push(pattern);
    }
  }

  return patterns;
}
