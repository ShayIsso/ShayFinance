import { describe, it, expect } from "vitest";
import {
  monthElapsed,
  isMonthClosed,
  classifyBudget,
  evaluateBudget,
  computeSubtreeSpend,
  computeCategorySpend,
  classifySavingsTarget,
  monthNetSavings,
  WARN_MARGIN,
  REASSURE_MARGIN,
  MUTE_THROUGH_DAY,
  type MonthElapsed,
  type YearMonth,
} from "../pace";
import type { AnalyticsTransaction } from "@/lib/analytics";

const ym = (year: number, month: number): YearMonth => ({ year, month });

/** A MonthElapsed placed past the mute window, so classify's reassure band is reachable. */
const at = (fraction: number, dayOfMonth = MUTE_THROUGH_DAY + 1): MonthElapsed => ({
  dayOfMonth,
  daysInMonth: 30,
  fraction,
});

describe("monthElapsed", () => {
  it("is the inclusive day fraction within the month (first and last day)", () => {
    expect(monthElapsed(ym(2026, 6), "2026-06-01")).toEqual({
      dayOfMonth: 1,
      daysInMonth: 30,
      fraction: 1 / 30,
    });
    expect(monthElapsed(ym(2026, 6), "2026-06-30")).toEqual({
      dayOfMonth: 30,
      daysInMonth: 30,
      fraction: 1,
    });
  });

  it("knows month length across February and 31-day months", () => {
    expect(monthElapsed(ym(2026, 2), "2026-02-28").daysInMonth).toBe(28);
    expect(monthElapsed(ym(2028, 2), "2028-02-29").daysInMonth).toBe(29);
    expect(monthElapsed(ym(2026, 1), "2026-01-31").daysInMonth).toBe(31);
  });

  it("clamps before the month to day 0 / fraction 0 and after it to fully elapsed", () => {
    expect(monthElapsed(ym(2026, 6), "2026-05-31")).toEqual({
      dayOfMonth: 0,
      daysInMonth: 30,
      fraction: 0,
    });
    expect(monthElapsed(ym(2026, 6), "2026-07-01")).toEqual({
      dayOfMonth: 30,
      daysInMonth: 30,
      fraction: 1,
    });
  });
});

describe("isMonthClosed", () => {
  it("is true only once today is past the month's last day", () => {
    expect(isMonthClosed(ym(2026, 6), "2026-06-30")).toBe(false);
    expect(isMonthClosed(ym(2026, 6), "2026-07-01")).toBe(true);
    expect(isMonthClosed(ym(2026, 6), "2026-05-15")).toBe(false);
  });
});

describe("classifyBudget", () => {
  it("is `over` at exactly 100% spent and beyond", () => {
    expect(classifyBudget(1, at(0.5))).toBe("over");
    expect(classifyBudget(1.4, at(0.5))).toBe("over");
    expect(classifyBudget(0.99, at(0.5))).toBe("at-risk");
  });

  it("warns (`at-risk`) only when spend exceeds elapsed by more than the warn margin", () => {
    const elapsed = at(0.5);
    expect(classifyBudget(0.5 + WARN_MARGIN, elapsed)).toBe("on-pace");
    expect(classifyBudget(0.5 + WARN_MARGIN + 0.01, elapsed)).toBe("at-risk");
  });

  it("reassures (`comfortably-under`) only when below elapsed by more than the reassure margin", () => {
    const elapsed = at(0.5);
    expect(classifyBudget(0.5 - REASSURE_MARGIN, elapsed)).toBe("on-pace");
    expect(classifyBudget(0.5 - REASSURE_MARGIN - 0.01, elapsed)).toBe("comfortably-under");
  });

  it("mutes `comfortably-under` through the mute day, then allows it (day 7 vs day 8)", () => {
    const wellUnder = 0.1;
    expect(classifyBudget(wellUnder, at(0.5, MUTE_THROUGH_DAY))).toBe("on-pace");
    expect(classifyBudget(wellUnder, at(0.5, MUTE_THROUGH_DAY + 1))).toBe("comfortably-under");
  });

  it("`over` outranks the mute window — an early blow-through still flags", () => {
    expect(classifyBudget(1.2, at(0.05, 3))).toBe("over");
  });
});

describe("evaluateBudget", () => {
  it("derives spent fraction from limit and spend", () => {
    const pace = evaluateBudget(1000, 250, at(0.5));
    expect(pace.spentFraction).toBe(0.25);
    expect(pace.verdict).toBe("comfortably-under");
  });

  it("treats any spend against a zero limit as over", () => {
    expect(evaluateBudget(0, 1, at(0.5)).verdict).toBe("over");
    expect(evaluateBudget(0, 0, at(0.5)).verdict).toBe("on-pace");
  });

  it("flags a mid-month overspend on the real calendar (day 7 mute vs day 8 reassure)", () => {
    const june = ym(2026, 6);
    expect(evaluateBudget(1000, 50, monthElapsed(june, "2026-06-07")).verdict).toBe("on-pace");
    expect(evaluateBudget(1000, 50, monthElapsed(june, "2026-06-08")).verdict).toBe(
      "comfortably-under",
    );
  });
});

describe("computeCategorySpend", () => {
  const tx = (
    categoryId: string | null,
    categoryType: AnalyticsTransaction["categoryType"],
    chargedAmount: number,
  ) => ({ categoryId, categoryType, chargedAmount });

  it("sums absolute expense spend per category, dropping non-expense and uncategorized", () => {
    const spend = computeCategorySpend([
      tx("food", "expense", -100),
      tx("food", "expense", -50),
      tx("salary", "income", 9000),
      tx("moving", "transfer", -400),
      tx(null, "expense", -30),
      tx("invest", "investment", -1000),
    ]);
    expect(spend).toContainEqual({ categoryId: "food", amount: 150 });
    expect(spend.find((s) => s.categoryId === "salary")).toBeUndefined();
    expect(spend.find((s) => s.categoryId === "moving")).toBeUndefined();
    expect(spend.find((s) => s.categoryId === "invest")).toBeUndefined();
    expect(spend).toHaveLength(1);
  });
});

describe("computeSubtreeSpend", () => {
  const cats = [
    { id: "food", parentId: null },
    { id: "groceries", parentId: "food" },
    { id: "restaurants", parentId: "food" },
    { id: "rent", parentId: null },
  ];
  const spend = [
    { categoryId: "food", amount: 40 },
    { categoryId: "groceries", amount: 100 },
    { categoryId: "restaurants", amount: 60 },
    { categoryId: "rent", amount: 5000 },
  ];

  it("sums self plus direct children for a group budget", () => {
    expect(computeSubtreeSpend("food", cats, spend)).toBe(200);
  });

  it("degenerates to self for a leaf (rent has no children)", () => {
    expect(computeSubtreeSpend("rent", cats, spend)).toBe(5000);
  });

  it("evaluates a child budget independently of its parent — no roll-up either way", () => {
    expect(computeSubtreeSpend("groceries", cats, spend)).toBe(100);
    expect(computeSubtreeSpend("restaurants", cats, spend)).toBe(60);
  });

  it("is zero for a category with no matching spend", () => {
    expect(computeSubtreeSpend("food", cats, [])).toBe(0);
  });
});

describe("parent and child budgets coexist and evaluate independently", () => {
  const cats = [
    { id: "food", parentId: null },
    { id: "restaurants", parentId: "food" },
  ];
  const spend = [
    { categoryId: "food", amount: 200 },
    { categoryId: "restaurants", amount: 900 },
  ];
  const elapsed = monthElapsed({ year: 2026, month: 6 }, "2026-06-15");

  it("a comfortable parent and an over child hold their own verdicts", () => {
    // Parent subtree = food(200) + restaurants(900) = 1100 → 0.22 of a 5000 cap
    // (comfortably-under at day 15); the child's own 900 blows its 800 cap (over).
    const parent = evaluateBudget(5000, computeSubtreeSpend("food", cats, spend), elapsed);
    const child = evaluateBudget(800, computeSubtreeSpend("restaurants", cats, spend), elapsed);
    expect(parent.verdict).toBe("comfortably-under");
    expect(child.verdict).toBe("over");
  });
});

describe("classifySavingsTarget", () => {
  it("is `met` at or above the target, `missed` below (evaluated at month close)", () => {
    expect(classifySavingsTarget(3000, 3000)).toBe("met");
    expect(classifySavingsTarget(3000, 5000)).toBe("met");
    expect(classifySavingsTarget(3000, 2999)).toBe("missed");
  });

  it("honestly misses when the month's Net Savings is negative", () => {
    const monthly: AnalyticsTransaction[] = [
      { chargedAmount: 2000, categoryType: "income" },
      { chargedAmount: -5000, categoryType: "expense" },
    ];
    expect(classifySavingsTarget(1000, monthNetSavings(monthly))).toBe("missed");
  });

  it("composes analytics' Net Savings — investment spend does not reduce it", () => {
    const monthly: AnalyticsTransaction[] = [
      { chargedAmount: 8000, categoryType: "income" },
      { chargedAmount: -3000, categoryType: "expense" },
      { chargedAmount: -4000, categoryType: "investment" },
    ];
    expect(monthNetSavings(monthly)).toBe(5000);
    expect(classifySavingsTarget(5000, monthNetSavings(monthly))).toBe("met");
  });
});
