import type { Cadence } from "./types";

/**
 * Produces a deterministic upsert identity for a recurring pattern.
 *
 * Keyed on (merchant, cadence) ONLY — deliberately NOT on amount.
 *
 * Rationale: the fingerprint is the upsert key in `recurring_expenses`, so the
 * same subscription must map to the same row on every sync. `expectedAmount` is
 * a rolling average that drifts sync-to-sync, and any fixed amount bucket has
 * boundary-straddle (two amounts within the ±10% match tolerance can fall either
 * side of a bucket edge — e.g. 35.0 → "35", 35.5 → "36"). Including amount in the
 * key therefore inserts duplicate rows whenever the average nudges across an edge.
 * Keying on (merchant, cadence) is the only fully stable choice.
 *
 * Trade-off: a single merchant billing two distinct monthly subscriptions
 * collapses into one row. Accepted for the RD1 tracer; a genuine price change is
 * meant to stay one subscription (surfaced as an anomaly in RD3), not spawn a new
 * row.
 */
export function buildFingerprint(merchant: string, cadence: Cadence): string {
  const normMerchant = merchant.toLowerCase().trim();
  return `${normMerchant}::${cadence}`;
}
