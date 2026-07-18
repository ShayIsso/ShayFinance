/**
 * Public interface of the reports module (issue #163 — Phase 3 BGR6). First
 * slice: CSV export of the transactions listing, honoring the exact same
 * filter schema as `/api/transactions` (WYSIWYG — export-everything is just
 * filters cleared). No schema changes; no new tables.
 */
import type { TransactionFilterConditions } from "@/lib/transactions";
import { drizzleReportsStore, type ReportsStore } from "./store";
import { buildCsvWithBom, resolveExportDateRange, buildExportFilename } from "./csv";

export type { ReportRow, BankType, CategoryType, CategorySource, TransactionStatus } from "./csv";
export { CSV_HEADERS, buildCsv, buildCsvWithBom } from "./csv";
export type { ReportsStore } from "./store";

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
