import { merchantKey, sameMerchant } from "@/lib/transaction-matching";
import type { Cadence, DetectionTransaction, PersistedRecurringPattern } from "./types";

const MS_PER_DAY = 86_400_000;

/** Nominal interval length (days) per cadence — basis for projection and the death threshold. */
const CADENCE_INTERVAL_DAYS: Record<Cadence, number> = {
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

/** A series is dead once its silence reaches base × this multiplier. */
const DEATH_THRESHOLD_MULTIPLIER = 1.5;

export function cadenceIntervalDays(cadence: Cadence): number {
  return CADENCE_INTERVAL_DAYS[cadence];
}

/**
 * Silence (days) at/above which a series is dead — CONTEXT.md "death threshold".
 * monthly ~45d, quarterly ~137d, annual ~548d. The single 1.5× basis shared by
 * liveness, `detectDormant`, and `detectMissedPayments`, so a series can never be
 * dormant on one page and upcoming on another (ADR-0012).
 */
export function dormancyThreshold(cadence: Cadence): number {
  return Math.round(CADENCE_INTERVAL_DAYS[cadence] * DEATH_THRESHOLD_MULTIPLIER);
}

/** Money-out charges grouped by `merchantKey` — one bucket per merchant identity. */
export type MerchantChargeIndex = Map<string, DetectionTransaction[]>;

export function indexChargesByMerchant(txns: DetectionTransaction[]): MerchantChargeIndex {
  const index: MerchantChargeIndex = new Map();
  for (const txn of txns) {
    const key = merchantKey(txn.description);
    if (!key) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(txn);
    else index.set(key, [txn]);
  }
  return index;
}

/**
 * The series' observed charges, oldest first. Matching is on `merchant` — the
 * immutable match key — never `displayName`, and is amount-agnostic: a price
 * change must not kill a series (ADR-0012).
 *
 * Matching is CONTEXT.md `merchant identity` — the same predicate that clustered
 * these charges into the series at detection time, so detection and evidence can
 * never disagree about which charges belong to it (#237). `merchantKey` is
 * idempotent, so a PERSISTED `merchant` re-keys into the same bucket as a raw
 * description and stored rows heal without a migration.
 *
 * Scans the index's keys rather than doing one lookup: a drifted charge sits
 * under a different key by definition. Keys are distinct merchants, not
 * transactions, so this stays small.
 */
export function observedChargesFor(
  pattern: PersistedRecurringPattern,
  index: MerchantChargeIndex,
): DetectionTransaction[] {
  const matched: DetectionTransaction[] = [];
  for (const [candidateKey, charges] of index) {
    if (sameMerchant(candidateKey, pattern.merchant)) matched.push(...charges);
  }
  return matched.sort((a, b) => a.date.localeCompare(b.date));
}

/** What the window's matching charges say about one series. All-or-nothing. */
export type ChargeEvidence = {
  /** Most recent observed matching charge. */
  lastObservedChargeDate: Date;
  /** Days elapsed since that charge — CONTEXT.md "silence". */
  silenceDays: number;
  /** That charge + the cadence interval. May be in the past. */
  projectedDate: Date;
  /** Rolling average of the last ≤3 observed charges (absolute). */
  observedAmount: number;
};

/** Derived lifecycle verdict for one series. Never persisted (ADR-0012). */
export type SeriesProjection = {
  patternId: string;
  /** Silence under the death threshold. No evidence means no life. */
  isLive: boolean;
  /** null when the window holds no matching charge. */
  evidence: ChargeEvidence | null;
};

/** A forecast entry for a live series — CONTEXT.md "projected charge". */
export type ProjectedCharge = {
  patternId: string;
  /** The immutable match key. */
  merchant: string;
  /** User-set name; the UI prefers it over `merchant`. */
  displayName: string | null;
  cadence: Cadence;
  /** Last observed charge + cadence interval. In the past when the series is late but live. */
  projectedDate: Date;
  /** Rolling average of the last ≤3 observed charges. */
  expectedAmount: number;
  lastObservedChargeDate: Date;
};

export type UpcomingChargesForecast = {
  /** Live, non-paused series projected inside the horizon, earliest first. */
  upcoming: ProjectedCharge[];
  total: number;
};

/**
 * Horizon wide enough that every live monthly series appears exactly once:
 * a live monthly series is at most 44 days silent, so its projection lands no
 * further out than 30 days (ADR-0012).
 */
export const DEFAULT_HORIZON_DAYS = 31;

function toUtcMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/**
 * Derives each series' liveness verdict and forecast from transaction evidence —
 * one entry per input pattern, in input order, so callers can zip the two lists.
 *
 * Comparison uses UTC integer day-floor arithmetic, mirroring the `datesWithin`
 * semantics in src/lib/transaction-matching/dates.ts.
 */
export function projectSeries(
  patterns: PersistedRecurringPattern[],
  recentTxns: DetectionTransaction[],
  today: Date,
): SeriesProjection[] {
  const index = indexChargesByMerchant(recentTxns);

  return patterns.map((pattern) => {
    const observed = observedChargesFor(pattern, index);

    if (observed.length === 0) {
      return { patternId: pattern.id, isLive: false, evidence: null };
    }

    const lastObservedChargeDate = toUtcMidnight(observed[observed.length - 1].date);
    const silenceDays = Math.floor(
      (today.getTime() - lastObservedChargeDate.getTime()) / MS_PER_DAY,
    );

    const projectedDate = new Date(lastObservedChargeDate.getTime());
    projectedDate.setUTCDate(projectedDate.getUTCDate() + cadenceIntervalDays(pattern.cadence));

    const last3 = observed.slice(-3).map((txn) => Math.abs(txn.chargedAmount));

    return {
      patternId: pattern.id,
      isLive: silenceDays < dormancyThreshold(pattern.cadence),
      evidence: {
        lastObservedChargeDate,
        silenceDays,
        projectedDate,
        observedAmount: last3.reduce((sum, amount) => sum + amount, 0) / last3.length,
      },
    };
  });
}

/**
 * The upcoming-charges forecast: live, non-paused series whose projected charge
 * lands within `horizonDays`. A projection already in the past (the series is
 * late but not yet dead) is kept and sorts first — "expected any day".
 *
 * Paused series are excluded here rather than treated as dead: pausing is a user
 * decision to stop forecasting, not evidence that the charges stopped.
 */
export function projectUpcomingCharges(
  patterns: PersistedRecurringPattern[],
  recentTxns: DetectionTransaction[],
  today: Date,
  horizonDays: number = DEFAULT_HORIZON_DAYS,
): UpcomingChargesForecast {
  const projections = projectSeries(patterns, recentTxns, today);
  const upcoming: ProjectedCharge[] = [];

  patterns.forEach((pattern, i) => {
    const { isLive, evidence } = projections[i];
    if (pattern.status !== "active" || !isLive || !evidence) return;

    const daysUntilProjected = cadenceIntervalDays(pattern.cadence) - evidence.silenceDays;
    if (daysUntilProjected > horizonDays) return;

    upcoming.push({
      patternId: pattern.id,
      merchant: pattern.merchant,
      displayName: pattern.displayName,
      cadence: pattern.cadence,
      projectedDate: evidence.projectedDate,
      expectedAmount: evidence.observedAmount,
      lastObservedChargeDate: evidence.lastObservedChargeDate,
    });
  });

  upcoming.sort((a, b) => a.projectedDate.getTime() - b.projectedDate.getTime());

  return {
    upcoming,
    total: upcoming.reduce((sum, charge) => sum + charge.expectedAmount, 0),
  };
}
