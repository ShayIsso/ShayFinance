/**
 * Pure progress core for savings goals (CONTEXT.md "savings goal"). No DB, no
 * `new Date()` — the current month is always passed in (analytics idiom: see
 * `computeNextDebitEstimate`'s doc comment for why deterministic date math
 * matters). Progress composes analytics' pure Net Savings function; there is no
 * separate contribution ledger.
 *
 * Month counts are inclusive throughout — the start month is month 1, so a
 * Jan→Dec span is 12 months. This matches the progress window (the start
 * month's Net Savings already counts), keeping the three curves consistent: an
 * on-rate saver hits exactly 100% at the deadline with no overshoot.
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
 * Signed count of whole months from `a` to `b` (b − a) — a raw difference, so
 * Jan→Dec is 11. The inclusive span used by pacing and per-month sugar adds one
 * to this (see the module comment on the inclusive convention).
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
 * Linear deadline pace: expected(t) = opening + (target − opening) × elapsed ∕
 * total, over the inclusive span (start month = month 1). Expected rises from
 * one increment at the start month to exactly `target` at the target month.
 *
 * Edge semantics (owner-adjudicated on the review of PR #172):
 *  - no target month → `null` (a goal without a deadline is never paced);
 *  - current month before the start → clamped to `opening` (0% elapsed);
 *  - current month at/past the target → clamped to `target` (no overshoot);
 *  - start month == target month → total = 1, expected = target (single-month
 *    goal, covered by the general formula).
 */
export function computeDeadlinePace(
  opening: number,
  target: number,
  startMonth: YearMonth,
  targetMonth: YearMonth | null,
  currentMonth: YearMonth,
): number | null {
  if (!targetMonth) return null;

  const total = monthsBetween(startMonth, targetMonth) + 1;
  const elapsed = Math.max(0, Math.min(monthsBetween(startMonth, currentMonth) + 1, total));
  return opening + (target - opening) * (elapsed / total);
}

/**
 * Per-month phrasing sugar → cumulative target: "save `monthlyAmount` each month
 * until `targetMonth`" resolves to the same cumulative goal the rest of the
 * module reasons about. Uses the inclusive span so "₪1000 לחודש Jan→Dec" =
 * opening + 12 × 1000 and the derived goal paces at exactly `monthlyAmount`.
 */
export function cumulativeTargetFromMonthly(
  opening: number,
  monthlyAmount: number,
  startMonth: YearMonth,
  targetMonth: YearMonth,
): number {
  const months = Math.max(0, monthsBetween(startMonth, targetMonth) + 1);
  return opening + monthlyAmount * months;
}

/**
 * Inverse of {@link cumulativeTargetFromMonthly}: the per-month rate a cumulative
 * deadline goal implies, over the inclusive span. `null` when there is no span to
 * spread across — no target month, or a target before the start (start == target
 * is a valid one-month span).
 */
export function monthlyAmountFromCumulative(
  opening: number,
  target: number,
  startMonth: YearMonth,
  targetMonth: YearMonth | null,
): number | null {
  if (!targetMonth) return null;
  const diff = monthsBetween(startMonth, targetMonth);
  if (diff < 0) return null;
  return (target - opening) / (diff + 1);
}
