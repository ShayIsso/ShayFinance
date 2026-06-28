import { extractMerchant } from "@/lib/transaction-matching";
import type {
  PersistedRecurringPattern,
  DetectionTransaction,
  PriceChangeAlert,
  MissedPaymentAlert,
  NewlyDetectedAlert,
  DormantAlert,
  Cadence,
} from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const PRICE_CHANGE_THRESHOLD = 0.15; // strictly greater than 15%
const MISSED_PAYMENT_GRACE_DAYS = 7; // exactly 7 days is NOT missed; 8+ is missed
const MS_PER_DAY = 86_400_000;

/** Nominal interval length (days) per cadence — basis for the dormancy threshold. */
const CADENCE_BASE_DAYS: Record<Cadence, number> = {
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

/** A pattern is "dormant" once it is overdue by ≥ base × this multiplier. */
const DORMANT_MULTIPLIER = 1.5;

/**
 * Days-overdue at/above which a pattern is treated as dormant (likely cancelled)
 * rather than a missed payment. monthly ~45d, quarterly ~137d, annual ~548d.
 */
function dormancyThreshold(cadence: Cadence): number {
  return Math.round(CADENCE_BASE_DAYS[cadence] * DORMANT_MULTIPLIER);
}

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
 * Detects active patterns that are overdue past the grace window but NOT yet
 * dormant. Missed and dormant are mutually exclusive:
 *   MISSED_PAYMENT_GRACE_DAYS < daysOverdue < dormancyThreshold(cadence)
 *
 * Pure function — pass `today` in; never calls new Date() internally.
 *
 * Boundary: exactly 7 days overdue is NOT missed; 8+ days is missed. Once a
 * pattern reaches its cadence dormancy threshold it is reported by
 * detectDormant instead (e.g. 8 days → missed; 8 months → dormant only).
 * Comparison uses UTC dates (integer day-floor arithmetic), mirroring the
 * datesWithin semantics in src/lib/transaction-matching/dates.ts.
 */
export function detectMissedPayments(
  patterns: PersistedRecurringPattern[],
  today: Date,
): MissedPaymentAlert[] {
  const alerts: MissedPaymentAlert[] = [];

  for (const pattern of patterns) {
    if (pattern.status !== "active") continue;

    const diffMs = today.getTime() - pattern.nextExpectedDate.getTime();
    const daysOverdue = Math.floor(diffMs / MS_PER_DAY);

    // Strictly more than 7 days, but strictly less than the dormancy threshold —
    // a longer overdue is "dormant", not "missed".
    if (
      daysOverdue > MISSED_PAYMENT_GRACE_DAYS &&
      daysOverdue < dormancyThreshold(pattern.cadence)
    ) {
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

// ── detectDormant ─────────────────────────────────────────────────────────────

/**
 * Detects active patterns that are so far past nextExpectedDate that they are
 * likely cancelled rather than a one-off missed payment. Fires when
 * daysOverdue >= dormancyThreshold(cadence) (monthly ~45d, quarterly ~137d,
 * annual ~548d). Mutually exclusive with detectMissedPayments.
 *
 * Pure function — pass `today` in; never calls new Date() internally. Mirrors
 * the UTC integer day-floor arithmetic and status guard of detectMissedPayments.
 * View-time derived only — nothing is persisted.
 */
export function detectDormant(patterns: PersistedRecurringPattern[], today: Date): DormantAlert[] {
  const alerts: DormantAlert[] = [];

  for (const pattern of patterns) {
    if (pattern.status !== "active") continue;

    const diffMs = today.getTime() - pattern.nextExpectedDate.getTime();
    const daysOverdue = Math.floor(diffMs / MS_PER_DAY);

    if (daysOverdue >= dormancyThreshold(pattern.cadence)) {
      alerts.push({
        type: "dormant",
        patternId: pattern.id,
        merchant: pattern.merchant,
        nextExpectedDate: pattern.nextExpectedDate,
        daysOverdue,
        cadence: pattern.cadence,
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
