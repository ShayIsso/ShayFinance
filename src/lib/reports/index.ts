/**
 * Public interface of the reports module (issue #163 — Phase 3 BGR6). First
 * slice: CSV export of the transactions listing, honoring the exact same
 * filter schema as `/api/transactions` (WYSIWYG — export-everything is just
 * filters cleared). No schema changes; no new tables.
 */
import type { TransactionFilterConditions } from "@/lib/transactions";
import { drizzleReportsStore, type ReportsStore, type ReportMonth } from "./store";
import { buildCsvWithBom, resolveExportDateRange, buildExportFilename } from "./csv";
import { buildMonthlyReport, type MonthlyReport } from "./monthly";
import { buildMonthCloseVerdicts, type BudgetConfig, type MonthCloseVerdicts } from "./month-close";

export type { ReportRow, BankType, CategoryType, CategorySource, TransactionStatus } from "./csv";
export { CSV_HEADERS, buildCsv, buildCsvWithBom } from "./csv";
export type { ReportsStore, ReportMonth, BudgetConfigRow } from "./store";
export { buildMonthlyReport } from "./monthly";
export type {
  MonthlyReport,
  MonthlyReportSummary,
  MonthlyReportNode,
  MonthlyReportLeaf,
  YoyValue,
} from "./monthly";
export { computeYoyDelta } from "./yoy";
export type { YoyDelta } from "./yoy";
export { buildMonthCloseVerdicts } from "./month-close";
export type {
  MonthCloseVerdicts,
  CategoryBudgetVerdict,
  SavingsVerdict,
  BudgetConfig,
  MonthCloseTransaction,
} from "./month-close";

/** The monthly report plus its month-close verdict section (issue #169 — BGR12). */
export type MonthlyReportWithVerdicts = MonthlyReport & { monthClose: MonthCloseVerdicts };

export type TransactionsCsvExport = {
  text: string;
  filename: string;
};

/**
 * Fetches every matching row (unpaginated — `page`/`pageSize` on the filter
 * schema are ignored here) and renders it as the exact response body text
 * for the export endpoint (BOM-prefixed CSV).
 */
export async function exportTransactionsCsv(
  filters: TransactionFilterConditions,
  store: ReportsStore = drizzleReportsStore,
): Promise<TransactionsCsvExport> {
  const rows = await store.getFilteredTransactions(filters);
  const text = buildCsvWithBom(rows);
  const todayIso = new Date().toISOString().slice(0, 10);
  const { from, to } = resolveExportDateRange(filters, rows, todayIso);
  const filename = buildExportFilename(from, to);
  return { text, filename };
}

// UTC, not Israel local time: for ~2-3 hours around midnight IST/IDT (UTC+2/+3)
// this reads as the previous day, so a month can appear "closed" a few hours
// late on the 1st. Same private helper, same tradeoff, as budgets/index.ts's
// `isoToday` — left as-is here for that consistency, not fixed in this slice.
const isoToday = (): string => new Date().toISOString().slice(0, 10);

/**
 * Monthly report for a past month (BGR11 #168): summary + group-first breakdown
 * with a same-month-last-year (YoY) column, plus the month-close verdict
 * section (BGR12 #169) — every budget's and the savings target's result
 * against the month, composed from the budgets module's pure pace core (see
 * `month-close.ts`). Both compositions share the month's already-fetched
 * transactions and category roll-up, so this never issues a second read of
 * either. `today` is threaded through (defaults to the real date) so callers
 * and tests stay deterministic — mirrors the budgets module's own idiom.
 */
export async function getMonthlyReport(
  year: number,
  month: number,
  store: ReportsStore = drizzleReportsStore,
  today: string = isoToday(),
): Promise<MonthlyReportWithVerdicts> {
  const [current, lastYearTransactions, categories, budgetConfigs, savingsTarget] =
    await Promise.all([
      store.getMonthTransactions(year, month),
      store.getMonthTransactions(year - 1, month),
      store.getRollupCategories(),
      store.getBudgetConfigs(),
      store.getSavingsTarget(),
    ]);

  const lastYear = lastYearTransactions.length > 0 ? { transactions: lastYearTransactions } : null;
  const report = buildMonthlyReport({ transactions: current }, lastYear, categories);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const budgets: BudgetConfig[] = budgetConfigs.map((b) => ({
    id: b.id,
    categoryId: b.categoryId,
    categoryName: categoryById.get(b.categoryId)?.name ?? "—",
    categoryColor: categoryById.get(b.categoryId)?.color ?? "#9ca3af",
    monthlyLimit: b.monthlyLimit,
  }));

  const monthClose = buildMonthCloseVerdicts(
    { year, month },
    today,
    current,
    categories,
    budgets,
    savingsTarget,
  );

  return { ...report, monthClose };
}

/** Every calendar month with data, newest first — the report month picker's options. */
export async function getReportMonths(
  store: ReportsStore = drizzleReportsStore,
): Promise<ReportMonth[]> {
  return store.getAvailableMonths();
}
