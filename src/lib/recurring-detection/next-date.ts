import type { RecurringPattern } from "./types";

const CADENCE_DAYS: Record<RecurringPattern["cadence"], number> = {
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

/**
 * Computes the next expected occurrence date.
 * Pure function — no Date.now().
 * Strategy: last occurrence date + canonical cadence interval in days.
 */
export function computeNextExpectedDate(pattern: RecurringPattern): Date {
  const lastDate = pattern.occurrenceDates[pattern.occurrenceDates.length - 1];
  const intervalDays = CADENCE_DAYS[pattern.cadence];
  const next = new Date(lastDate.getTime());
  next.setUTCDate(next.getUTCDate() + intervalDays);
  return next;
}
