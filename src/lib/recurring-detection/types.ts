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
