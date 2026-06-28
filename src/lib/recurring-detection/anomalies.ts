import { extractMerchant } from "@/lib/transaction-matching";
import type {
  PersistedRecurringPattern,
  DetectionTransaction,
  PriceChangeAlert,
  MissedPaymentAlert,
  NewlyDetectedAlert,
} from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const PRICE_CHANGE_THRESHOLD = 0.15; // strictly greater than 15%
const MISSED_PAYMENT_GRACE_DAYS = 7; // exactly 7 days is NOT missed; 8+ is missed

// ── detectPriceChanges ────────────────────────────────────────────────────────

/**
 * Detects active patterns whose latest observed charge deviates by more than
 * 15% from the stored expectedAmount.
 *
 * Pure function — no Date.now() or side effects.
 *
 * Matching: extracts merchant from each recent transaction description and
 * compares (case-insensitive equality after extractMerchant normalisation)
 * against the pattern merchant. Uses absolute amounts — expense chargedAmounts
 * are negative in the DB; expectedAmount is stored positive.
 *
 * Boundary: exactly 15% does NOT trigger (strictly greater than).
 */
export function detectPriceChanges(
  patterns: PersistedRecurringPattern[],
  recentTxns: DetectionTransaction[],
): PriceChangeAlert[] {
  const alerts: PriceChangeAlert[] = [];

  for (const pattern of patterns) {
    if (pattern.status !== "active") continue;

    // Find all recent transactions whose merchant matches this pattern
    const matched = recentTxns.filter((txn) => {
      const txnMerchant = extractMerchant(txn.description);
      return txnMerchant.toLowerCase() === pattern.merchant.toLowerCase();
    });

    if (matched.length === 0) continue;

    // Sort by date descending to find the most-recent match
    const sorted = [...matched].sort((a, b) => b.date.localeCompare(a.date));
    const latestTxn = sorted[0];
    const latestAmount = Math.abs(latestTxn.chargedAmount);
    const expectedAmount = pattern.expectedAmount;

    const pctDiff = Math.abs(latestAmount - expectedAmount) / expectedAmount;

    // Strictly greater than 15% — exactly 15% does NOT trigger
    if (pctDiff > PRICE_CHANGE_THRESHOLD) {
      const pctChange = (latestAmount - expectedAmount) / expectedAmount;
      alerts.push({
        type: "price_change",
        patternId: pattern.id,
        merchant: pattern.merchant,
        oldAmount: expectedAmount,
        newAmount: latestAmount,
        pctChange,
      });
    }
  }

  return alerts;
}

// ── detectMissedPayments ──────────────────────────────────────────────────────

/**
 * Detects active patterns where today is strictly more than 7 days past the
 * nextExpectedDate (i.e. today > nextExpectedDate + 7 days).
 *
 * Pure function — pass `today` in; never calls new Date() internally.
 *
 * Boundary: exactly 7 days overdue is NOT missed; 8+ days is missed.
 * Comparison uses UTC dates (integer day-floor arithmetic), mirroring the
 * datesWithin semantics in src/lib/transaction-matching/dates.ts.
 */
export function detectMissedPayments(
  patterns: PersistedRecurringPattern[],
  today: Date,
): MissedPaymentAlert[] {
  const alerts: MissedPaymentAlert[] = [];
  const MS_PER_DAY = 86_400_000;

  for (const pattern of patterns) {
    if (pattern.status !== "active") continue;

    const diffMs = today.getTime() - pattern.nextExpectedDate.getTime();
    const daysOverdue = Math.floor(diffMs / MS_PER_DAY);

    // Strictly more than 7 days — exactly 7 is NOT missed
    if (daysOverdue > MISSED_PAYMENT_GRACE_DAYS) {
      alerts.push({
        type: "missed_payment",
        patternId: pattern.id,
        merchant: pattern.merchant,
        nextExpectedDate: pattern.nextExpectedDate,
        daysOverdue,
      });
    }
  }

  return alerts;
}

// ── detectNewlyDetected ───────────────────────────────────────────────────────

/**
 * Flags patterns where confirmedAt is null — these are unconfirmed patterns
 * that need the user to review, name, and optionally categorize.
 *
 * By construction, newly-detected patterns already have ≥3 occurrences
 * (that is the detection threshold). The status is 'active' by default.
 *
 * Pure function — no Date.now() or side effects. The `recentTxns` parameter
 * is accepted for API symmetry with the other detectors; it is not used here
 * since the unconfirmed flag is entirely determined by confirmedAt.
 */
export function detectNewlyDetected(
  patterns: PersistedRecurringPattern[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _recentTxns: DetectionTransaction[],
): NewlyDetectedAlert[] {
  const alerts: NewlyDetectedAlert[] = [];

  for (const pattern of patterns) {
    if (pattern.confirmedAt === null) {
      alerts.push({
        type: "newly_detected",
        patternId: pattern.id,
        merchant: pattern.merchant,
        expectedAmount: pattern.expectedAmount,
        cadence: pattern.cadence,
      });
    }
  }

  return alerts;
}
