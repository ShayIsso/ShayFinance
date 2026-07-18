/**
 * Pure CSV core for transactions export (BGR6). No DB imports — every row
 * shape below is exactly what a caller (currently `reports/store.ts`) hands
 * in, and every Hebrew label / RFC 4180 escaping rule lives here so it's
 * testable without a database.
 *
 * WYSIWYG (issue #163): this module never drops or reshapes rows by category
 * type — `transfer` and `ignore` rows are exported like any other; סוג קטגוריה
 * is the column a consumer filters on to reproduce the app's own totals.
 */

export type BankType = "discount" | "max" | "visaCal";
export type CategoryType = "income" | "expense" | "investment" | "transfer" | "ignore";
export type CategorySource = "rule" | "memory" | "ai" | "user";
export type TransactionStatus = "completed" | "pending";

/**
 * One exported row, already joined and shaped by the store — amounts as
 * numbers (Drizzle returns decimals as strings; the store converts before
 * this boundary), category/group as the leaf's own name and its parent's
 * name (null when uncategorized or a root leaf).
 */
export type ReportRow = {
  date: string;
  processedDate: string;
  description: string;
  customDescription: string | null;
  bankType: BankType;
  accountNumber: string;
  categoryName: string | null;
  categoryType: CategoryType | null;
  groupName: string | null;
  chargedAmount: number;
  chargedCurrency: string | null;
  originalAmount: number;
  originalCurrency: string;
  installmentNumber: number | null;
  installmentTotal: number | null;
  status: TransactionStatus;
  categorySource: CategorySource | null;
  memo: string | null;
};

export const CSV_HEADERS = [
  "תאריך",
  "תאריך חיוב",
  "תיאור",
  "תיאור מקורי",
  "מוסד",
  "חשבון",
  "קטגוריה",
  "קבוצה",
  "סוג קטגוריה",
  "סכום",
  "מטבע",
  "סכום מקורי",
  "מטבע מקורי",
  "תשלום",
  "סטטוס",
  "מקור סיווג",
  "הערות",
] as const;

const BANK_LABELS: Record<BankType, string> = {
  discount: "דיסקונט",
  max: "מקס",
  visaCal: "ויזה כאל",
};

const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  income: "הכנסה",
  expense: "הוצאה",
  investment: "השקעה",
  transfer: "העברה",
  ignore: "התעלם",
};

const STATUS_LABELS: Record<TransactionStatus, string> = {
  completed: "הושלם",
  pending: "ממתין",
};

const CATEGORY_SOURCE_LABELS: Record<CategorySource, string> = {
  rule: "חוק",
  memory: "זיכרון בית עסק",
  ai: "AI",
  user: "ידני",
};

/** Plain signed number, period decimal, exactly two places, no separators/symbols. */
function formatAmount(n: number): string {
  return n.toFixed(2);
}

/** "3/12" for an installment leg; empty for a normal transaction. */
function formatInstallment(
  installmentNumber: number | null,
  installmentTotal: number | null,
): string {
  if (installmentNumber == null || installmentTotal == null) return "";
  return `${installmentNumber}/${installmentTotal}`;
}

/**
 * RFC 4180 field escaping: quote and double-escape a field only when it
 * contains a comma, quote, or line break — leaving plain fields untouched.
 */
function escapeCsvField(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function toCsvFields(row: ReportRow): string[] {
  return [
    row.date,
    row.processedDate,
    // Display description prefers the user override; original is always the
    // raw bank string (CONTEXT.md "transaction" — description never modified).
    row.customDescription ?? row.description,
    row.description,
    BANK_LABELS[row.bankType],
    row.accountNumber,
    row.categoryName ?? "",
    row.groupName ?? "",
    row.categoryType ? CATEGORY_TYPE_LABELS[row.categoryType] : "",
    formatAmount(row.chargedAmount),
    row.chargedCurrency ?? "ILS",
    formatAmount(row.originalAmount),
    row.originalCurrency,
    formatInstallment(row.installmentNumber, row.installmentTotal),
    STATUS_LABELS[row.status],
    row.categorySource ? CATEGORY_SOURCE_LABELS[row.categorySource] : "",
    row.memo ?? "",
  ];
}

function toCsvLine(fields: readonly string[]): string {
  return fields.map(escapeCsvField).join(",");
}

/** Header + data rows, CRLF-terminated throughout (RFC 4180). No BOM. */
export function buildCsv(rows: ReportRow[]): string {
  const lines = [toCsvLine(CSV_HEADERS), ...rows.map((row) => toCsvLine(toCsvFields(row)))];
  return lines.map((line) => line + "\r\n").join("");
}

const UTF8_BOM = "﻿";

/**
 * The exact response body the endpoint sends: a UTF-8 BOM prefix + the CSV
 * text, still a plain `string`. Kept as a string rather than `Buffer`/
 * `Uint8Array` deliberately — a `string` is unambiguous `BodyInit` for
 * `NextResponse` with no Buffer-vs-@types/node friction at that seam, and the
 * runtime UTF-8-encodes it on the wire, which is where the BOM becomes the
 * three bytes `EF BB BF` that Excel and other tools sniff for.
 */
export function buildCsvWithBom(rows: ReportRow[]): string {
  return UTF8_BOM + buildCsv(rows);
}

/**
 * Filename date bounds (issue #163): an explicit filter bound wins; otherwise
 * derive from the actual min/max date in the exported set. An empty set with
 * no filter bound has nothing to derive from, so it falls back to the
 * caller-supplied `todayIso` — kept as an explicit parameter (not `Date.now()`
 * inside this module) so the pure core stays clock-free and testable.
 */
export function resolveExportDateRange(
  filters: { dateFrom?: string; dateTo?: string },
  rows: { date: string }[],
  todayIso: string,
): { from: string; to: string } {
  const dates = rows.map((r) => r.date);
  const minDate = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : todayIso;
  const maxDate = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : todayIso;
  return {
    from: filters.dateFrom ?? minDate,
    to: filters.dateTo ?? maxDate,
  };
}

/** ASCII filename: shayfinance-transactions-<from>_<to>.csv */
export function buildExportFilename(from: string, to: string): string {
  return `shayfinance-transactions-${from}_${to}.csv`;
}
