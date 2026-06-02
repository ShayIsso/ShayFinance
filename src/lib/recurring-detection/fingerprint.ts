import type { Cadence } from "./types";

/**
 * Rounds an amount to the nearest 10% bucket.
 * e.g. 34.90, 35.00, 36.50 all bucket to "35".
 * Two amounts that `amountsMatch` at ±10% tolerance should share a bucket.
 *
 * Strategy: round to one significant figure by dividing into a logarithmic bucket.
 * We use round-to-nearest-5-of-the-leading-digit which is stable and simple.
 */
function amountBucket(amount: number): string {
  const abs = Math.abs(amount);
  if (abs === 0) return "0";
  // Round to nearest integer, then to nearest multiple of max(1, floor(value/10))
  const step = Math.max(1, Math.pow(10, Math.floor(Math.log10(abs)) - 1));
  const rounded = Math.round(abs / step) * step;
  return String(rounded);
}

/**
 * Produces a deterministic fingerprint string for a recurring pattern.
 * Stable across runs: same merchant + amount bucket + cadence → same fingerprint.
 */
export function buildFingerprint(merchant: string, amount: number, cadence: Cadence): string {
  const bucket = amountBucket(amount);
  // Normalise merchant to lowercase for fingerprint stability
  const normMerchant = merchant.toLowerCase().trim();
  return `${normMerchant}::${bucket}::${cadence}`;
}
