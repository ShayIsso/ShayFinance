/** The three cadences we detect. Annual = once per year. */
export type Cadence = "monthly" | "quarterly" | "annual";

/**
 * A recurring pattern detected from a sequence of transactions.
 * Pure value — no DB IDs; those come from the store.
 */
export type RecurringPattern = {
  /** Normalised merchant name extracted from transaction descriptions. */
  merchant: string;
  /** Rolling average of the last 3 occurrence amounts (absolute value). */
  expectedAmount: number;
  /** Detected cadence. */
  cadence: Cadence;
  /** All matched transaction dates, sorted ascending. */
  occurrenceDates: Date[];
  /** ID of the most-recent matched transaction (for lastMatchedTxnId column). */
  lastMatchedTxnId: string;
  /**
   * Stable deterministic fingerprint of (merchant, amountBucket, cadence).
   * Used as the upsert key so the same recurring charge always maps to the
   * same row in recurring_expenses, regardless of which sync run detected it.
   */
  patternFingerprint: string;
  /** Next expected occurrence date, computed from the last occurrence. */
  nextExpectedDate: Date;
};

/** Minimal transaction shape needed by the detection algorithm. */
export type DetectionTransaction = {
  id: string;
  description: string;
  chargedAmount: number;
  date: string; // ISO date string "YYYY-MM-DD"
};

/**
 * A recurring pattern as it lives in the DB — extends RecurringPattern with
 * the DB row id, status, and confirmedAt so anomaly detectors can work on
 * persisted data without fetching full DB rows.
 */
export type PersistedRecurringPattern = RecurringPattern & {
  /** DB primary key (UUID). */
  id: string;
  /** Optional user-friendly name set on confirm. UI prefers this over merchant; matching never uses it. */
  displayName: string | null;
  /** User-facing status. Active patterns are checked for anomalies. */
  status: "active" | "paused" | "canceled";
  /**
   * Null = newly detected, not yet confirmed by the user.
   * Non-null = user has confirmed this pattern at the stored timestamp.
   */
  confirmedAt: Date | null;
};

/**
 * Enough of a persisted series to recognise it again: its stored match key and
 * cadence. What the write path remaps detected candidates onto so a descriptor
 * that drifted updates the existing row instead of minting a sibling.
 */
export type SeriesIdentity = {
  merchant: string;
  cadence: Cadence;
};

/** Alert raised when a pattern's latest charge deviates > 15% from expectedAmount. */
export type PriceChangeAlert = {
  type: "price_change";
  patternId: string;
  merchant: string;
  /** The pattern's stored expectedAmount before the change. */
  oldAmount: number;
  /** The latest observed charge amount (absolute value). */
  newAmount: number;
  /** Signed percentage change: (newAmount - oldAmount) / oldAmount. */
  pctChange: number;
};

/** Alert raised when a live series is more than 7 days late for its projected charge. */
export type MissedPaymentAlert = {
  type: "missed_payment";
  patternId: string;
  merchant: string;
  /** Projected charge date derived from evidence: last observed charge + cadence interval. */
  projectedDate: Date;
  /** Whole days between the projected date and today. */
  daysOverdue: number;
};

/**
 * Alert raised when a series' silence has reached the death threshold — dead by
 * evidence, not user-cancelled. Derived at read time only, never persisted
 * (ADR-0012).
 */
export type DormantAlert = {
  type: "dormant";
  patternId: string;
  merchant: string;
  /** Last observed matching charge; null when the window holds no evidence at all. */
  lastObservedChargeDate: Date | null;
  /** Days since that charge; null without evidence. */
  silenceDays: number | null;
  /** The series' cadence — drives the death threshold. */
  cadence: Cadence;
};

/** Alert raised for patterns that have not yet been confirmed by the user. */
export type NewlyDetectedAlert = {
  type: "newly_detected";
  patternId: string;
  merchant: string;
  expectedAmount: number;
  cadence: Cadence;
};
