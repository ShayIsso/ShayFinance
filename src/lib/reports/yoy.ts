/**
 * Year-over-year delta — a pure, dependency-free helper (no analytics/DB
 * imports) so client components can call it at runtime without dragging the
 * reports store into the browser bundle. `buildMonthlyReport` and the reports
 * page both consume it.
 */

/** Signed year-over-year change; `pct` is null when there is nothing to compare. */
export type YoyDelta = {
  /** Relative percent change vs last year; null when last year is absent or zero. */
  pct: number | null;
  direction: "up" | "down" | "flat";
};

/**
 * Relative YoY change. A null OR zero base yields `pct: null` — never a
 * fabricated ∞%/100% against a zero denominator (owner decision, prototype
 * gate). Callers render "—" for a null `pct`.
 */
export function computeYoyDelta(current: number, lastYear: number | null): YoyDelta {
  if (lastYear === null || lastYear === 0) {
    return { pct: null, direction: "flat" };
  }
  const diff = current - lastYear;
  if (Math.abs(diff) < 1e-9) return { pct: 0, direction: "flat" };
  return { pct: (diff / Math.abs(lastYear)) * 100, direction: diff > 0 ? "up" : "down" };
}
