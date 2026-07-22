/**
 * Pure pace core for budgets and monthly targets (CONTEXT.md "budget pace";
 * decision record #105 §3, §4, §6). No DB, no `new Date()` — `today` is always
 * passed in (analytics idiom: see `computeNextDebitEstimate`). Budget spend
 * composes analytics' expense reducer; the monthly savings verdict composes
 * analytics' Net Savings — there is no separate budgets ledger.
 *
 * Budgets reset monthly: each pace evaluation reasons over a single calendar
 * month in isolation (contrast goals, which accumulate). Day counts are
 * inclusive — day 1 is 1∕daysInMonth elapsed, the month's last day is exactly
 * 1 — matching the inclusive-month convention BGR2 locked for goals.
 */
import { computeMonthlySummary, type AnalyticsTransaction } from "@/lib/analytics";

/** A calendar month. Budgets reason per-month; the day lives in {@link MonthElapsed}. */
export type YearMonth = { year: number; month: number };

/**
 * Asymmetric pace bands (decision record #105 §3): warn eagerly, reassure
 * reluctantly. UX tuning values, not spec-frozen numbers — this block is the
 * single edit point. Margins are fractions of the limit (percentage points ∕
 * 100): a spend-fraction more than {@link WARN_MARGIN} above the elapsed
 * fraction warns; more than {@link REASSURE_MARGIN} below it reassures.
 */
export const WARN_MARGIN = 0.1;
export const REASSURE_MARGIN = 0.2;
/** `comfortably-under` is muted through this day-of-month so an early, sparse month never over-reassures. */
export const MUTE_THROUGH_DAY = 7;

export type BudgetVerdict = "over" | "at-risk" | "on-pace" | "comfortably-under";

/** Where `today` sits inside a budget's month. `dayOfMonth` is 0 before the month, `daysInMonth` after it. */
export type MonthElapsed = {
  dayOfMonth: number;
  daysInMonth: number;
  /** Inclusive elapsed fraction: dayOfMonth ∕ daysInMonth, clamped to [0, 1]. */
  fraction: number;
};

export type BudgetPace = {
  limit: number;
  spent: number;
  /** spent ∕ limit; `Infinity` when a non-zero spend meets a zero limit. */
  spentFraction: number;
  elapsedFraction: number;
  verdict: BudgetVerdict;
};

function daysInMonth(month: YearMonth): number {
  return new Date(month.year, month.month, 0).getDate();
}

/**
 * Position of `today` (YYYY-MM-DD) within `month`. Before the month → day 0,
 * fraction 0; after it → last day, fraction 1 (a closed month is fully
 * elapsed); within it → the inclusive day fraction. Deterministic: uses `Date`
 * only for calendar arithmetic on the passed values, never for "now".
 */
export function monthElapsed(month: YearMonth, today: string): MonthElapsed {
  const [ty, tm, td] = today.split("-").map(Number);
  const dim = daysInMonth(month);

  const todayIndex = ty * 12 + tm;
  const monthIndex = month.year * 12 + month.month;

  if (todayIndex < monthIndex) return { dayOfMonth: 0, daysInMonth: dim, fraction: 0 };
  if (todayIndex > monthIndex) return { dayOfMonth: dim, daysInMonth: dim, fraction: 1 };

  return { dayOfMonth: td, daysInMonth: dim, fraction: td / dim };
}

/** A month is closed once `today` (YYYY-MM-DD) is strictly past its last calendar day. */
export function isMonthClosed(month: YearMonth, today: string): boolean {
  const [ty, tm] = today.split("-").map(Number);
  return ty * 12 + tm > month.year * 12 + month.month;
}

/**
 * Verdict for a budget from its spend fraction and where the month stands
 * (decision record #105 §3). Priority: `over` (spent ≥ 100%) → `at-risk`
 * (spend-fraction more than {@link WARN_MARGIN} above elapsed) →
 * `comfortably-under` (more than {@link REASSURE_MARGIN} below elapsed, but
 * never during the early-month mute window) → `on-pace`. Band edges fall to the
 * calmer verdict: exactly at the warn line is on-pace, exactly at the reassure
 * line is on-pace.
 */
export function classifyBudget(spentFraction: number, elapsed: MonthElapsed): BudgetVerdict {
  if (spentFraction >= 1) return "over";
  if (spentFraction > elapsed.fraction + WARN_MARGIN) return "at-risk";

  const muted = elapsed.dayOfMonth <= MUTE_THROUGH_DAY;
  if (!muted && spentFraction < elapsed.fraction - REASSURE_MARGIN) return "comfortably-under";

  return "on-pace";
}

/**
 * Full pace for a budget. A zero (or negative) limit has no headroom, so it is
 * never `comfortably-under`: any spend is `over` (via an `Infinity` fraction),
 * no spend is `on-pace` — you are exactly meeting a ₪0 cap, not under it.
 */
export function evaluateBudget(limit: number, spent: number, elapsed: MonthElapsed): BudgetPace {
  const spentFraction = limit > 0 ? spent / limit : spent > 0 ? Infinity : 0;
  const verdict = limit <= 0 && spent <= 0 ? "on-pace" : classifyBudget(spentFraction, elapsed);
  return {
    limit,
    spent,
    spentFraction,
    elapsedFraction: elapsed.fraction,
    verdict,
  };
}

/** A category's own expense spend for the month, keyed by category id. */
export type CategorySpend = { categoryId: string; amount: number };

/**
 * Subtree spend (decision record #105 §4): a budget on `categoryId` measures
 * that category's own spend plus its direct children's — the one-level tree, so
 * "subtree" is self + children and degenerates to self for a leaf. Parent and
 * child budgets both call this independently; there is no precedence law.
 */
export function computeSubtreeSpend(
  categoryId: string,
  categories: { id: string; parentId: string | null }[],
  spend: CategorySpend[],
): number {
  const ids = new Set<string>([categoryId]);
  for (const c of categories) {
    if (c.parentId === categoryId) ids.add(c.id);
  }
  return spend.filter((s) => ids.has(s.categoryId)).reduce((sum, s) => sum + s.amount, 0);
}

/**
 * Per-category expense spend for a month's transactions (absolute value,
 * `expense`-type only — the same rule analytics applies). Uncategorized rows
 * and non-expense types drop out, so a budget's subtree only ever sums real
 * expense leaves.
 */
export function computeCategorySpend(
  transactions: (AnalyticsTransaction & { categoryId: string | null })[],
): CategorySpend[] {
  const byCategory = new Map<string, number>();
  for (const t of transactions) {
    if (t.categoryType !== "expense" || !t.categoryId) continue;
    byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + Math.abs(t.chargedAmount));
  }
  return Array.from(byCategory.entries()).map(([categoryId, amount]) => ({ categoryId, amount }));
}

export type SavingsTargetVerdict = "met" | "missed";

/**
 * Monthly savings-target verdict (decision record #105 §6): the month's Net
 * Savings against the target. `met` at exactly the target. Evaluated at month
 * close only in V1 — the caller gates on {@link isMonthClosed}; intra-month
 * savings pacing is deliberately deferred.
 */
export function classifySavingsTarget(target: number, netSavings: number): SavingsTargetVerdict {
  return netSavings >= target ? "met" : "missed";
}

/** Net Savings for a month's transactions, composing analytics — no duplicate formula. */
export function monthNetSavings(transactions: AnalyticsTransaction[]): number {
  return computeMonthlySummary(transactions).netSavings;
}

/**
 * Pace for the overall monthly expense target (CONTEXT.md "monthly targets"),
 * composing {@link evaluateBudget} verbatim: month expenses stand in for a
 * budget's subtree spend, `expenseTarget` for its limit. Same bands, same ₪0
 * and month-close behavior as a per-category budget — this is a thin
 * composite, not a second pace semantic. Null when no target is set, mirroring
 * {@link classifySavingsTarget}'s target-optional convention.
 */
export function evaluateExpenseTargetPace(
  expenseTarget: number | null,
  monthExpenses: number,
  elapsed: MonthElapsed,
): BudgetPace | null {
  if (expenseTarget == null) return null;
  return evaluateBudget(expenseTarget, monthExpenses, elapsed);
}
