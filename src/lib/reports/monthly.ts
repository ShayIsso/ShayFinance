/**
 * Pure monthly-report aggregation core (BGR11 #168). No DB imports: it composes
 * the analytics module's pure functions — {@link computeMonthlySummary},
 * {@link computeSpendingByCategory}, {@link rollUpSpendingByGroup} — over rows a
 * caller (currently `reports/store.ts`) hands in. Zero duplicated aggregation
 * logic: the lens rules (transfer/ignore excluded, investment tracked
 * separately, group total = sum of leaves) all come from analytics unchanged.
 *
 * YoY is the same month one calendar year earlier. When that month has no data
 * at all the report says so honestly (`hasLastYear: false`, every `lastYear`
 * value null) rather than comparing against a fabricated zero.
 */
import {
  computeMonthlySummary,
  computeSpendingByCategory,
  rollUpSpendingByGroup,
  type TransactionWithCategory,
  type RollupCategory,
  type CategorySpending,
  type MonthlySummary,
} from "@/lib/analytics";

/** Typed rows for a single month — the superset both analytics cores consume. */
export type MonthlyReportInput = {
  transactions: TransactionWithCategory[];
};

/** A metric paired with its same-month-last-year value (null = last year absent). */
export type YoyValue = {
  current: number;
  lastYear: number | null;
};

export type MonthlyReportSummary = {
  income: YoyValue;
  expenses: YoyValue;
  netSavings: YoyValue;
  savingsRate: YoyValue;
  investment: YoyValue;
};

/** A breakdown leaf with its last-year spend (null only when last year is absent). */
export type MonthlyReportLeaf = CategorySpending & {
  lastYearAmount: number | null;
};

/** A top-level breakdown node (group with leaves, or a root leaf with none). */
export type MonthlyReportNode = CategorySpending & {
  lastYearAmount: number | null;
  children: MonthlyReportLeaf[];
};

export type MonthlyReport = {
  /** The selected month has at least one transaction of any type. */
  hasData: boolean;
  /** The same month last year has at least one transaction of any type. */
  hasLastYear: boolean;
  summary: MonthlyReportSummary;
  breakdown: MonthlyReportNode[];
};

function toSummary(current: MonthlySummary, lastYear: MonthlySummary | null): MonthlyReportSummary {
  const pair = (c: number, ly: number | null): YoyValue => ({ current: c, lastYear: ly });
  return {
    income: pair(current.income, lastYear?.income ?? null),
    expenses: pair(current.expenses, lastYear?.expenses ?? null),
    netSavings: pair(current.netSavings, lastYear?.netSavings ?? null),
    savingsRate: pair(current.savingsRate, lastYear?.savingsRate ?? null),
    investment: pair(current.investmentTotal, lastYear?.investmentTotal ?? null),
  };
}

/**
 * Builds the monthly report from a month's rows and, optionally, the same
 * month last year's rows (null when that month is absent). `categories` is the
 * shared roll-up structure both months read for group/leaf shape.
 */
export function buildMonthlyReport(
  current: MonthlyReportInput,
  lastYear: MonthlyReportInput | null,
  categories: RollupCategory[],
): MonthlyReport {
  const hasData = current.transactions.length > 0;
  const hasLastYear = lastYear !== null && lastYear.transactions.length > 0;

  const currentSummary = computeMonthlySummary(current.transactions);
  const lastYearSummary = hasLastYear ? computeMonthlySummary(lastYear.transactions) : null;

  const currentNodes = rollUpSpendingByGroup(
    computeSpendingByCategory(current.transactions),
    categories,
  );

  // Last-year lookups: leaf-level for a group's children and root leaves; node-
  // level for a group total (which folds in leaves that had no current spend and
  // so never appear as a current child row — an honest group-vs-group compare).
  const lastYearLeafAmount = new Map<string, number>();
  const lastYearNodeAmount = new Map<string, number>();
  if (hasLastYear) {
    const lastYearSpending = computeSpendingByCategory(lastYear.transactions);
    for (const leaf of lastYearSpending) lastYearLeafAmount.set(leaf.categoryId, leaf.amount);
    for (const node of rollUpSpendingByGroup(lastYearSpending, categories)) {
      lastYearNodeAmount.set(node.categoryId, node.amount);
    }
  }

  const breakdown: MonthlyReportNode[] = currentNodes.map((node) => {
    const { children, ...leafFields } = node;
    return {
      ...leafFields,
      lastYearAmount: hasLastYear ? (lastYearNodeAmount.get(node.categoryId) ?? 0) : null,
      children: children.map((leaf) => ({
        ...leaf,
        lastYearAmount: hasLastYear ? (lastYearLeafAmount.get(leaf.categoryId) ?? 0) : null,
      })),
    };
  });

  return {
    hasData,
    hasLastYear,
    summary: toSummary(currentSummary, lastYearSummary),
    breakdown,
  };
}
