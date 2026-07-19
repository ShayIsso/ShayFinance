/**
 * Pure month-close verdict composition (issue #169 — Phase 3 BGR12). No DB
 * imports: composes the budgets module's pure pace core — `evaluateBudget`,
 * `classifySavingsTarget`, `monthNetSavings` (CONTEXT.md "budget pace" /
 * "monthly targets") — over a month's rows, category tree, and budget/target
 * configuration a caller (`reports/index.ts`) hands in. Mirrors `monthly.ts`
 * composing analytics: same shape of pure-core-plus-wrapper, different
 * upstream module.
 *
 * Verdicts render for CLOSED months only. A budget and the savings target
 * both reset every month (CONTEXT.md "goals accumulate, budgets reset
 * monthly"), so an in-progress month has no month-close result yet — the
 * Dashboard's live pace chips already cover that case, and re-showing a
 * pretend "verdict" for a month still running would just restate the
 * Dashboard with worse data. `isMonthClosed` gates the whole result.
 *
 * Past months are judged against CURRENT budget limits and the current
 * savings target, never what was configured during that month — the budgets
 * module keeps no historical snapshot of a limit/target's value over time.
 * This is an acknowledged trend-reading simplification (CONTEXT.md "budget
 * pace" / "monthly targets").
 */
import {
  computeCategorySpend,
  computeSubtreeSpend,
  evaluateBudget,
  monthElapsed,
  isMonthClosed,
  classifySavingsTarget,
  monthNetSavings,
  type BudgetVerdict,
  type SavingsTargetVerdict,
  type YearMonth,
} from "@/lib/budgets";
import type { AnalyticsTransaction } from "@/lib/analytics";

export type MonthCloseTransaction = AnalyticsTransaction & { categoryId: string | null };

/** A budget's current configuration, already joined to its category's display fields. */
export type BudgetConfig = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  monthlyLimit: number;
};

/**
 * One category budget's month-close result. Field names deliberately mirror
 * the Dashboard's `BudgetChipData` (BGR9, `budget-status-card.tsx`) so both
 * render through the exact same chip component — the vocabulary law this
 * slice must hold.
 */
export type CategoryBudgetVerdict = {
  id: string;
  categoryName: string;
  categoryColor: string;
  verdict: BudgetVerdict;
  spent: number;
  limit: number;
};

export type SavingsVerdict = {
  target: number;
  netSavings: number;
  verdict: SavingsTargetVerdict;
};

export type MonthCloseVerdicts = {
  /** False for a non-closed month — nothing to show yet (see module doc). */
  monthClosed: boolean;
  budgets: CategoryBudgetVerdict[];
  /** Null when no savings target is set. */
  savingsTarget: SavingsVerdict | null;
};

const NOT_CLOSED: MonthCloseVerdicts = { monthClosed: false, budgets: [], savingsTarget: null };

/**
 * Builds the month-close verdict section for `month`. Returns the
 * not-closed sentinel (empty budgets, null savings target) unless `today` is
 * strictly past the month's last day — the caller's UI hides the section on
 * either that or an all-empty closed result (no budgets and no target set).
 */
export function buildMonthCloseVerdicts(
  month: YearMonth,
  today: string,
  transactions: MonthCloseTransaction[],
  categoryTree: { id: string; parentId: string | null }[],
  budgets: BudgetConfig[],
  savingsTarget: number | null,
): MonthCloseVerdicts {
  if (!isMonthClosed(month, today)) return NOT_CLOSED;

  const spend = computeCategorySpend(transactions);
  const elapsed = monthElapsed(month, today);

  const budgetVerdicts: CategoryBudgetVerdict[] = budgets.map((b) => {
    const spent = computeSubtreeSpend(b.categoryId, categoryTree, spend);
    const pace = evaluateBudget(b.monthlyLimit, spent, elapsed);
    return {
      id: b.id,
      categoryName: b.categoryName,
      categoryColor: b.categoryColor,
      verdict: pace.verdict,
      spent: pace.spent,
      limit: pace.limit,
    };
  });

  let savings: SavingsVerdict | null = null;
  if (savingsTarget != null) {
    const netSavings = monthNetSavings(transactions);
    savings = {
      target: savingsTarget,
      netSavings,
      verdict: classifySavingsTarget(savingsTarget, netSavings),
    };
  }

  return { monthClosed: true, budgets: budgetVerdicts, savingsTarget: savings };
}
