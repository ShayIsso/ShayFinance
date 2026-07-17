/**
 * Pure progress core for savings goals (#105, #159). No DB, no `new Date()` —
 * the current month is always passed in (analytics idiom: see
 * `computeNextDebitEstimate`'s doc comment for why deterministic date math
 * matters). Progress composes analytics' pure Net Savings function; there is no
 * separate contribution ledger.
 *
 * Domain law: goals accumulate. Progress = opening amount + cumulative Net
 * Savings from the start month onward. Negative months honestly drag progress
 * down — never clamped.
 */
import { computeMonthlySummary, type AnalyticsTransaction } from "@/lib/analytics";

/** A calendar month. Day is deliberately absent — goals reason in whole months. */
export type YearMonth = { year: number; month: number };

export type MonthlyTransactions = {
  month: YearMonth;
  transactions: AnalyticsTransaction[];
};

export type GoalProgress = {
  opening: number;
  /** Cumulative Net Savings across [startMonth, currentMonth]; may be negative. */
  cumulativeNetSavings: number;
  /** opening + cumulativeNetSavings — the live goal balance, never clamped. */
  current: number;
};

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Parses "YYYY-MM" (the storage format) into a {@link YearMonth}. */
export function parseYearMonth(value: string): YearMonth {
  if (!YEAR_MONTH_PATTERN.test(value)) {
    throw new RangeError(`Invalid YYYY-MM month: ${value}`);
  }
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

/** Formats a {@link YearMonth} back into the "YYYY-MM" storage format. */
export function formatYearMonth(ym: YearMonth): string {
  return `${String(ym.year).padStart(4, "0")}-${String(ym.month).padStart(2, "0")}`;
}

/**
 * Signed count of calendar months from `a` to `b` (b − a). The single month
 * metric used everywhere in this module — pacing and per-month sugar share it
 * so a goal created from per-month phrasing paces at exactly that rate.
 */
export function monthsBetween(a: YearMonth, b: YearMonth): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

function inRange(ym: YearMonth, start: YearMonth, end: YearMonth): boolean {
  return monthsBetween(start, ym) >= 0 && monthsBetween(ym, end) >= 0;
}

/**
 * Goal balance at `currentMonth`: opening plus the sum of each month's Net
 * Savings over [startMonth, currentMonth]. Months outside that window (stray
 * past or future data) are ignored, so the window is enforced here rather than
 * trusted from the caller. A month with no transactions contributes 0.
 */
export function computeGoalProgress(
  opening: number,
  startMonth: YearMonth,
  currentMonth: YearMonth,
  monthly: MonthlyTransactions[],
): GoalProgress {
  const cumulativeNetSavings = monthly
    .filter((m) => inRange(m.month, startMonth, currentMonth))
    .reduce((sum, m) => sum + computeMonthlySummary(m.transactions).netSavings, 0);

  return {
    opening,
    cumulativeNetSavings,
    current: opening + cumulativeNetSavings,
  };
}

/**
 * Linear deadline pace on the remaining span:
 * expected(t) = opening + (target − opening) × elapsed ∕ total, where months
 * are measured by {@link monthsBetween} (difference, not inclusive count) so
 * expected rises from `opening` at the start month to exactly `target` at the
 * target month.
 *
 * Edge semantics (#105 leaves these open — chosen and fixed here):
 *  - no target month → `null` (a goal without a deadline is never paced);
 *  - start month == target month (zero span) → `target` (the whole goal is due
 *    at once, no ramp);
 *  - current month before the start → clamped to `opening` (0% elapsed);
 *  - current month past the target → clamped to `target` (100%, no overshoot).
 */
export function computeDeadlinePace(
  opening: number,
  target: number,
  startMonth: YearMonth,
  targetMonth: YearMonth | null,
  currentMonth: YearMonth,
): number | null {
  if (!targetMonth) return null;

  const total = monthsBetween(startMonth, targetMonth);
  if (total <= 0) return target;

  const elapsed = Math.max(0, Math.min(monthsBetween(startMonth, currentMonth), total));
  return opening + (target - opening) * (elapsed / total);
}

/**
 * Per-month phrasing sugar → cumulative target: "save `monthlyAmount` each month
 * until `targetMonth`" resolves to the same cumulative goal the rest of the
 * module reasons about. Uses {@link monthsBetween} so the derived goal paces at
 * exactly `monthlyAmount` per month. A non-positive span accumulates nothing
 * beyond the opening amount.
 */
export function cumulativeTargetFromMonthly(
  opening: number,
  monthlyAmount: number,
  startMonth: YearMonth,
  targetMonth: YearMonth,
): number {
  const total = Math.max(0, monthsBetween(startMonth, targetMonth));
  return opening + monthlyAmount * total;
}

/**
 * Inverse of {@link cumulativeTargetFromMonthly}: the per-month rate a cumulative
 * deadline goal implies. `null` when there is no finite span to spread across (no
 * target month, or target not after start) — a rate is undefined there.
 */
export function monthlyAmountFromCumulative(
  opening: number,
  target: number,
  startMonth: YearMonth,
  targetMonth: YearMonth | null,
): number | null {
  if (!targetMonth) return null;
  const total = monthsBetween(startMonth, targetMonth);
  if (total <= 0) return null;
  return (target - opening) / total;
}
