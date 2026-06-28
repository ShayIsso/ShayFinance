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
  /** User-facing status. Active patterns are checked for anomalies. */
  status: "active" | "paused" | "canceled";
  /**
   * Null = newly detected, not yet confirmed by the user.
   * Non-null = user has confirmed this pattern at the stored timestamp.
   */
  confirmedAt: Date | null;
};

// ── Anomaly alert types ───────────────────────────────────────────────────────

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

/** Alert raised when a payment is overdue by more than 7 days. */
export type MissedPaymentAlert = {
  type: "missed_payment";
  patternId: string;
  merchant: string;
  /** The date the next payment was expected. */
  nextExpectedDate: Date;
  /** How many days overdue (today - nextExpectedDate, whole days). */
  daysOverdue: number;
};

/** Alert raised for patterns that have not yet been confirmed by the user. */
export type NewlyDetectedAlert = {
  type: "newly_detected";
  patternId: string;
  merchant: string;
  expectedAmount: number;
  cadence: Cadence;
};
