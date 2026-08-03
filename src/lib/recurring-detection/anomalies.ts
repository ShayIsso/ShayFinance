import {
  cadenceIntervalDays,
  indexChargesByMerchant,
  observedChargesFor,
  projectSeries,
} from "./project";
import type {
  PersistedRecurringPattern,
  DetectionTransaction,
  PriceChangeAlert,
  MissedPaymentAlert,
  NewlyDetectedAlert,
  DormantAlert,
} from "./types";

/** One alert-list result per detector — the shape `countAnomalyAlerts` folds over. */
export type AnomalyAlertLists = {
  priceChanges: readonly PriceChangeAlert[];
  missedPayments: readonly MissedPaymentAlert[];
  dormant: readonly DormantAlert[];
  newlyDetected: readonly NewlyDetectedAlert[];
};

const PRICE_CHANGE_THRESHOLD = 0.15; // strictly greater than 15%
const MISSED_PAYMENT_GRACE_DAYS = 7; // exactly 7 days is NOT missed; 8+ is missed

/**
 * Detects active patterns whose latest observed charge deviates by more than
 * 15% from the stored expectedAmount.
 *
 * Pure function — no Date.now() or side effects.
 *
 * Matching goes through the shared evidence matcher, so price changes, liveness,
 * and the dormant/missed detectors can never disagree on what counts as this
 * series' charge. Uses absolute amounts — expense chargedAmounts are negative in
 * the DB; expectedAmount is stored positive.
 *
 * Boundary: exactly 15% does NOT trigger (strictly greater than).
 */
export function detectPriceChanges(
  patterns: PersistedRecurringPattern[],
  recentTxns: DetectionTransaction[],
): PriceChangeAlert[] {
  const index = indexChargesByMerchant(recentTxns);
  const alerts: PriceChangeAlert[] = [];

  for (const pattern of patterns) {
    if (pattern.status !== "active") continue;

    const observed = observedChargesFor(pattern, index);
    if (observed.length === 0) continue;

    const latestAmount = Math.abs(observed[observed.length - 1].chargedAmount);
    const expectedAmount = pattern.expectedAmount;

    const pctDiff = Math.abs(latestAmount - expectedAmount) / expectedAmount;

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

/**
 * Detects active series that are late past the grace window but still live:
 * their last observed matching charge is older than one cadence interval plus
 * the grace, yet the silence has not reached the death threshold. Mutually
 * exclusive with detectDormant, which owns everything at/above the threshold.
 *
 * Judged from liveness evidence, never from the stored nextExpectedDate
 * (ADR-0012) — a series whose merchant keeps charging is never "missed",
 * however stale that column has grown.
 *
 * Pure function — pass `today` in; never calls new Date() internally.
 * Boundary: exactly grace-days late is NOT missed; one more day is.
 */
export function detectMissedPayments(
  patterns: PersistedRecurringPattern[],
  recentTxns: DetectionTransaction[],
  today: Date,
): MissedPaymentAlert[] {
  const projections = projectSeries(patterns, recentTxns, today);
  const alerts: MissedPaymentAlert[] = [];

  patterns.forEach((pattern, i) => {
    if (pattern.status !== "active") return;

    const { isLive, evidence } = projections[i];
    if (!isLive || !evidence) return;

    const daysOverdue = evidence.silenceDays - cadenceIntervalDays(pattern.cadence);
    if (daysOverdue > MISSED_PAYMENT_GRACE_DAYS) {
      alerts.push({
        type: "missed_payment",
        patternId: pattern.id,
        merchant: pattern.merchant,
        projectedDate: evidence.projectedDate,
        daysOverdue,
      });
    }
  });

  return alerts;
}

/**
 * Detects active series that have gone silent past the death threshold — dead
 * by evidence, but not user-cancelled, so the owner is asked to adjudicate. A
 * series with no matching charge anywhere in the window is dormant too: no
 * evidence means no life (ADR-0012).
 *
 * Mutually exclusive with detectMissedPayments. Derived at read time — nothing
 * is persisted, so a series whose charges resume is live again on the next read.
 *
 * Pure function — pass `today` in; never calls new Date() internally.
 */
export function detectDormant(
  patterns: PersistedRecurringPattern[],
  recentTxns: DetectionTransaction[],
  today: Date,
): DormantAlert[] {
  const projections = projectSeries(patterns, recentTxns, today);
  const alerts: DormantAlert[] = [];

  patterns.forEach((pattern, i) => {
    if (pattern.status !== "active") return;

    const { isLive, evidence } = projections[i];
    if (isLive) return;

    alerts.push({
      type: "dormant",
      patternId: pattern.id,
      merchant: pattern.merchant,
      lastObservedChargeDate: evidence?.lastObservedChargeDate ?? null,
      silenceDays: evidence?.silenceDays ?? null,
      cadence: pattern.cadence,
    });
  });

  return alerts;
}

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

/**
 * Total anomaly-alert count for the dashboard's attention feeder (#196) — a
 * pure fold over the four detectors' outputs, so the count and the
 * subscriptions page's rendered alerts (built from the same four calls) can
 * never disagree on what counts as an alert. Detector categories are
 * independent: each list's length contributes on its own, so one empty
 * category never suppresses another's count.
 */
export function countAnomalyAlerts(alerts: AnomalyAlertLists): number {
  return (
    alerts.priceChanges.length +
    alerts.missedPayments.length +
    alerts.dormant.length +
    alerts.newlyDetected.length
  );
}
