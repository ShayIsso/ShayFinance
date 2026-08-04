import { merchantKey, amountsMatch, sameMerchant } from "@/lib/transaction-matching";
import type { DetectionTransaction, RecurringPattern, Cadence } from "./types";
import { buildFingerprint } from "./fingerprint";
import { computeNextExpectedDate } from "./next-date";

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

/** Occurrences at one amount that make it a CONTEXT.md `price regime`. */
const REGIME_MIN_OCCURRENCES = 3;

/**
 * Minimum share of the activity a candidate series is weighed against — itself
 * plus the merchant's CONTEXT.md `incidental charge`s, never the merchant's
 * other price regimes. Rejects habitual-purchase false positives (a ₪25 bakery
 * visited 3× among ~20 varied charges) while keeping real subscriptions.
 */
const MERCHANT_EXCLUSIVITY_RATIO = 0.5;

/**
 * Groups transactions by CONTEXT.md `merchant identity`, greedy single-linkage:
 * each transaction joins the first cluster whose representative `sameMerchant`s
 * it, or starts a new one.
 *
 * Representatives are identity KEYS, so the `merchant` a pattern carries into
 * `recurring_expenses` can never be one charge's decorated descriptor.
 *
 * The representative is then re-elected canonically (see `electRepresentative`),
 * because the key a cluster is *seeded* with is whichever charge the scan read
 * first. Where drift leaves a merchant with several keys that only `sameMerchant`
 * unites — a plain form alongside tokenized ones — that seed decided the upsert
 * fingerprint, so input order alone could mint a sibling row for one series.
 */
/**
 * The cluster's canonical name: the identity key most of its charges carry, ties
 * broken lexicographically. Independent of input order, and it prefers the
 * merchant's dominant descriptor form — usually the one already persisted.
 */
function electRepresentative(txns: DetectionTransaction[]): string {
  const counts = new Map<string, number>();
  for (const txn of txns) {
    const key = merchantKey(txn.description);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let elected = "";
  let electedCount = 0;
  for (const [key, count] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count > electedCount) {
      elected = key;
      electedCount = count;
    }
  }
  return elected;
}

function clusterByMerchant(
  txns: DetectionTransaction[],
): Map<string, { representative: string; txns: DetectionTransaction[] }> {
  const clusters = new Map<string, { representative: string; txns: DetectionTransaction[] }>();

  for (const txn of txns) {
    const merchant = merchantKey(txn.description);
    if (!merchant) continue;

    let assigned = false;
    for (const cluster of clusters.values()) {
      if (sameMerchant(cluster.representative, merchant)) {
        cluster.txns.push(txn);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      clusters.set(merchant, { representative: merchant, txns: [txn] });
    }
  }

  for (const cluster of clusters.values()) {
    cluster.representative = electRepresentative(cluster.txns);
  }

  return clusters;
}

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

function rollingAvgLast3(amounts: number[]): number {
  const last3 = amounts.slice(-3);
  return last3.reduce((s, a) => s + a, 0) / last3.length;
}

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

  // Input filter: detection only considers money-OUT transactions. Income,
  // refunds, and credits (chargedAmount >= 0) are never recurring expenses.
  // Belt-and-suspenders alongside the store-level SQL filter, and it keeps the
  // pure function unit-testable without a DB.
  const expenseTxns = txns.filter((t) => t.chargedAmount < 0);
  if (!expenseTxns.length) return [];

  const merchantClusters = clusterByMerchant(expenseTxns);
  const patterns: RecurringPattern[] = [];

  for (const cluster of merchantClusters.values()) {
    const amountGroups = partitionByAmount(cluster.txns);

    const incidentalCount = amountGroups
      .filter((group) => group.txns.length < REGIME_MIN_OCCURRENCES)
      .reduce((sum, group) => sum + group.txns.length, 0);

    for (const group of amountGroups) {
      if (group.txns.length < REGIME_MIN_OCCURRENCES) continue;

      // Boundary: exactly MERCHANT_EXCLUSIVITY_RATIO is KEPT.
      const weighedAgainst = group.txns.length + incidentalCount;
      if (group.txns.length / weighedAgainst < MERCHANT_EXCLUSIVITY_RATIO) {
        continue;
      }

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
