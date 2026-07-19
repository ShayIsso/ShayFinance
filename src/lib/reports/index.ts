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

export type { ReportRow, BankType, CategoryType, CategorySource, TransactionStatus } from "./csv";
export { CSV_HEADERS, buildCsv, buildCsvWithBom } from "./csv";
export type { ReportsStore, ReportMonth } from "./store";
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

/**
 * Monthly report for a past month (BGR11 #168): summary + group-first breakdown
 * with a same-month-last-year (YoY) column. Composes the pure core over rows the
 * store fetches for the month and the same month one year earlier — the latter
 * passed as null when it has no data, so YoY reads honestly.
 */
export async function getMonthlyReport(
  year: number,
  month: number,
  store: ReportsStore = drizzleReportsStore,
): Promise<MonthlyReport> {
  const [current, lastYearTransactions, categories] = await Promise.all([
    store.getMonthTransactions(year, month),
    store.getMonthTransactions(year - 1, month),
    store.getRollupCategories(),
  ]);

  const lastYear = lastYearTransactions.length > 0 ? { transactions: lastYearTransactions } : null;
  return buildMonthlyReport({ transactions: current }, lastYear, categories);
}

/** Every calendar month with data, newest first — the report month picker's options. */
export async function getReportMonths(
  store: ReportsStore = drizzleReportsStore,
): Promise<ReportMonth[]> {
  return store.getAvailableMonths();
}
