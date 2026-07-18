import { describe, it, expect } from "vitest";
import {
  computeGoalProgress,
  computeDeadlinePace,
  computeGoalPaceVerdict,
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

  it("rises linearly over the inclusive span, one increment at the start month", () => {
    const start = ym(2026, 1);
    const target = ym(2026, 12); // inclusive span = 12 months, ₪1000/month
    expect(computeDeadlinePace(0, 12000, start, target, start)).toBe(1000);
    expect(computeDeadlinePace(0, 12000, start, target, ym(2026, 6))).toBe(6000);
    expect(computeDeadlinePace(0, 12000, start, target, target)).toBe(12000);
  });

  it("respects the opening amount in the pace line", () => {
    const start = ym(2026, 1);
    const target = ym(2026, 11); // inclusive span = 11 months
    expect(computeDeadlinePace(1000, 12000, start, target, ym(2026, 6))).toBe(7000);
  });

  it("clamps to opening before the start and to target past the deadline", () => {
    const start = ym(2026, 3);
    const target = ym(2026, 9);
    expect(computeDeadlinePace(200, 6200, start, target, ym(2026, 1))).toBe(200);
    expect(computeDeadlinePace(200, 6200, start, target, ym(2027, 5))).toBe(6200);
  });

  it("returns the full target when the span is one month (start == target)", () => {
    const m = ym(2026, 4);
    expect(computeDeadlinePace(0, 5000, m, m, m)).toBe(5000);
  });
});

describe("computeGoalPaceVerdict", () => {
  it("is no-deadline whenever expected is null, regardless of current", () => {
    expect(computeGoalPaceVerdict(0, null)).toBe("no-deadline");
    expect(computeGoalPaceVerdict(-5000, null)).toBe("no-deadline");
  });

  it("is ahead-or-on-pace when current is at or above the expected line", () => {
    expect(computeGoalPaceVerdict(1000, 1000)).toBe("ahead-or-on-pace");
    expect(computeGoalPaceVerdict(1500, 1000)).toBe("ahead-or-on-pace");
  });

  it("is behind-pace when current falls short of the expected line", () => {
    expect(computeGoalPaceVerdict(500, 1000)).toBe("behind-pace");
  });

  it("tolerates float noise around the boundary without flipping verdicts", () => {
    expect(computeGoalPaceVerdict(999.995, 1000)).toBe("ahead-or-on-pace");
    expect(computeGoalPaceVerdict(989, 1000)).toBe("behind-pace");
  });
});

describe("per-month phrasing derivation", () => {
  it("derives the cumulative target from a per-month amount over the inclusive span", () => {
    expect(cumulativeTargetFromMonthly(0, 1000, ym(2026, 1), ym(2026, 12))).toBe(12000);
    expect(cumulativeTargetFromMonthly(2000, 500, ym(2026, 1), ym(2026, 11))).toBe(7500);
  });

  it("round-trips through the inverse at exactly the per-month rate", () => {
    const start = ym(2026, 1);
    const target = ym(2026, 12);
    const cumulative = cumulativeTargetFromMonthly(500, 800, start, target);
    expect(monthlyAmountFromCumulative(500, cumulative, start, target)).toBe(800);
  });

  it("returns null from the inverse only without a target or with target before start", () => {
    expect(monthlyAmountFromCumulative(0, 5000, ym(2026, 1), null)).toBeNull();
    expect(monthlyAmountFromCumulative(0, 5000, ym(2026, 6), ym(2026, 3))).toBeNull();
  });

  it("treats start == target as a valid one-month span in both directions", () => {
    expect(cumulativeTargetFromMonthly(3000, 900, ym(2026, 6), ym(2026, 6))).toBe(3900);
    expect(monthlyAmountFromCumulative(0, 5000, ym(2026, 6), ym(2026, 6))).toBe(5000);
  });
});

describe("cross-curve consistency (on-rate saver)", () => {
  const income = (n: number): AnalyticsTransaction => ({
    chargedAmount: n,
    categoryType: "income",
  });

  const start = ym(2026, 1);
  const target = ym(2026, 12);
  const opening = 500;
  const rate = 1000;
  const derivedTarget = cumulativeTargetFromMonthly(opening, rate, start, target);
  const monthly = Array.from({ length: 12 }, (_, i) => month(2026, i + 1, [income(rate)]));

  it("progress reaches exactly the derived target at the deadline, no overshoot", () => {
    const progress = computeGoalProgress(opening, start, target, monthly);
    expect(progress.current).toBe(derivedTarget);
    expect(computeDeadlinePace(opening, derivedTarget, start, target, target)).toBe(derivedTarget);
  });

  it("current equals expected at every intermediate month", () => {
    for (let m = 1; m <= 12; m++) {
      const current = ym(2026, m);
      const progress = computeGoalProgress(opening, start, current, monthly);
      const expected = computeDeadlinePace(opening, derivedTarget, start, target, current);
      expect(progress.current).toBe(expected);
    }
  });
});
