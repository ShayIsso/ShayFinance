import { describe, it, expect } from "vitest";
import {
  computeGoalProgress,
  computeDeadlinePace,
  cumulativeTargetFromMonthly,
  monthlyAmountFromCumulative,
  monthsBetween,
  parseYearMonth,
  formatYearMonth,
  type MonthlyTransactions,
  type YearMonth,
} from "../progress";
import type { AnalyticsTransaction } from "@/lib/analytics";

const ym = (year: number, month: number): YearMonth => ({ year, month });

const month = (
  y: number,
  m: number,
  transactions: AnalyticsTransaction[],
): MonthlyTransactions => ({ month: ym(y, m), transactions });

describe("parseYearMonth / formatYearMonth", () => {
  it("round-trips a YYYY-MM string", () => {
    expect(formatYearMonth(parseYearMonth("2026-07"))).toBe("2026-07");
  });

  it("rejects a malformed or out-of-range month", () => {
    expect(() => parseYearMonth("2026-13")).toThrow();
    expect(() => parseYearMonth("2026-7")).toThrow();
    expect(() => parseYearMonth("not-a-month")).toThrow();
  });
});

describe("monthsBetween", () => {
  it("is a signed calendar-month difference across year boundaries", () => {
    expect(monthsBetween(ym(2026, 1), ym(2026, 12))).toBe(11);
    expect(monthsBetween(ym(2025, 11), ym(2026, 2))).toBe(3);
    expect(monthsBetween(ym(2026, 6), ym(2026, 6))).toBe(0);
    expect(monthsBetween(ym(2026, 6), ym(2026, 3))).toBe(-3);
  });
});

describe("computeGoalProgress", () => {
  const income = (n: number): AnalyticsTransaction => ({
    chargedAmount: n,
    categoryType: "income",
  });
  const expense = (n: number): AnalyticsTransaction => ({
    chargedAmount: -n,
    categoryType: "expense",
  });

  it("sums each month's Net Savings and adds the opening amount", () => {
    const monthly = [
      month(2026, 1, [income(5000), expense(3000)]),
      month(2026, 2, [income(5000), expense(2000)]),
    ];
    const result = computeGoalProgress(1000, ym(2026, 1), ym(2026, 2), monthly);
    expect(result.cumulativeNetSavings).toBe(5000);
    expect(result.opening).toBe(1000);
    expect(result.current).toBe(6000);
  });

  it("lets a negative month drag progress down without clamping", () => {
    const monthly = [
      month(2026, 1, [income(2000), expense(1000)]),
      month(2026, 2, [income(1000), expense(4000)]),
    ];
    const result = computeGoalProgress(0, ym(2026, 1), ym(2026, 2), monthly);
    expect(result.cumulativeNetSavings).toBe(-2000);
    expect(result.current).toBe(-2000);
  });

  it("does not let investment spend reduce progress", () => {
    const monthly = [
      month(2026, 1, [income(5000), { chargedAmount: -3000, categoryType: "investment" }]),
    ];
    const result = computeGoalProgress(0, ym(2026, 1), ym(2026, 1), monthly);
    expect(result.current).toBe(5000);
  });

  it("excludes months outside [startMonth, currentMonth] (edge months)", () => {
    const monthly = [
      month(2025, 12, [income(9999)]),
      month(2026, 1, [income(1000)]),
      month(2026, 2, [income(2000)]),
      month(2026, 3, [income(8888)]),
    ];
    const result = computeGoalProgress(0, ym(2026, 1), ym(2026, 2), monthly);
    expect(result.cumulativeNetSavings).toBe(3000);
  });

  it("treats a start month with no data as zero, not an error", () => {
    const result = computeGoalProgress(500, ym(2026, 1), ym(2026, 3), []);
    expect(result.current).toBe(500);
  });
});

describe("computeDeadlinePace", () => {
  it("returns null for an open-ended goal (no target month)", () => {
    expect(computeDeadlinePace(0, 12000, ym(2026, 1), null, ym(2026, 6))).toBeNull();
  });

  it("rises linearly from opening at start to target at the deadline", () => {
    const start = ym(2026, 1);
    const target = ym(2026, 12);
    expect(computeDeadlinePace(0, 11000, start, target, start)).toBe(0);
    expect(computeDeadlinePace(0, 11000, start, target, ym(2026, 6))).toBe(5000);
    expect(computeDeadlinePace(0, 11000, start, target, target)).toBe(11000);
  });

  it("respects the opening amount in the pace line", () => {
    const start = ym(2026, 1);
    const target = ym(2026, 11);
    expect(computeDeadlinePace(1000, 11000, start, target, ym(2026, 6))).toBe(6000);
  });

  it("clamps to opening before the start and to target past the deadline", () => {
    const start = ym(2026, 3);
    const target = ym(2026, 9);
    expect(computeDeadlinePace(200, 6200, start, target, ym(2026, 1))).toBe(200);
    expect(computeDeadlinePace(200, 6200, start, target, ym(2027, 5))).toBe(6200);
  });

  it("returns the full target when the span is zero (start == target)", () => {
    const m = ym(2026, 4);
    expect(computeDeadlinePace(0, 5000, m, m, m)).toBe(5000);
  });
});

describe("per-month phrasing derivation", () => {
  it("derives the cumulative target from a per-month amount", () => {
    expect(cumulativeTargetFromMonthly(0, 1000, ym(2026, 1), ym(2026, 12))).toBe(11000);
    expect(cumulativeTargetFromMonthly(2000, 500, ym(2026, 1), ym(2026, 11))).toBe(7000);
  });

  it("round-trips through the inverse at exactly the per-month rate", () => {
    const start = ym(2026, 1);
    const target = ym(2026, 12);
    const cumulative = cumulativeTargetFromMonthly(500, 800, start, target);
    expect(monthlyAmountFromCumulative(500, cumulative, start, target)).toBe(800);
  });

  it("returns null from the inverse when there is no finite span", () => {
    expect(monthlyAmountFromCumulative(0, 5000, ym(2026, 1), null)).toBeNull();
    expect(monthlyAmountFromCumulative(0, 5000, ym(2026, 6), ym(2026, 6))).toBeNull();
    expect(monthlyAmountFromCumulative(0, 5000, ym(2026, 6), ym(2026, 3))).toBeNull();
  });

  it("accumulates nothing beyond opening for a non-positive span", () => {
    expect(cumulativeTargetFromMonthly(3000, 900, ym(2026, 6), ym(2026, 6))).toBe(3000);
  });
});
