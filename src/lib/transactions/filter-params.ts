/**
 * Query-param encoding shared by the transactions-page listing fetch and its
 * CSV export link (issue #163 — WYSIWYG), and reused by the reports page's
 * month-download link (issue #169 — BGR12) so the two exports can never
 * diverge on how a sentinel `categoryId` value maps to `uncategorized` /
 * `needsReview`. No DB import — pure string building over already-resolved
 * filter values, kept as its own leaf module (prior art:
 * `transactions/pagination.ts`) so client components can import it without
 * pulling in the DB-backed `transactions` index.
 */
export type ExportFilterParams = {
  dateFrom: string;
  dateTo: string;
  categoryId: string;
  status: string;
  search: string;
};

/** Deliberately excludes `page`/`pageSize`: export always reads every matching row. */
export function buildFilterSearchParams(filters: ExportFilterParams): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.categoryId === "__uncategorized__") {
    params.set("uncategorized", "true");
  } else if (filters.categoryId === "__needs_review__") {
    params.set("needsReview", "true");
  } else if (filters.categoryId) {
    params.set("categoryId", filters.categoryId);
  }
  if (filters.status) params.set("status", filters.status);
  if (filters.search) params.set("search", filters.search);
  return params;
}
