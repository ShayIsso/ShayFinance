import { describe, it, expect } from "vitest";
import {
  buildMonthCloseVerdicts,
  type BudgetConfig,
  type MonthCloseTransaction,
} from "../month-close";
import type { YearMonth } from "@/lib/budgets";

const MAY: YearMonth = { year: 2026, month: 5 };

// Category tree: a group ("food") with one leaf child ("grocery"), plus an
// unrelated root leaf ("transport") — enough to exercise subtree spend.
const CATEGORY_TREE = [
  { id: "food", parentId: null },
  { id: "grocery", parentId: "food" },
  { id: "transport", parentId: null },
];

function tx(categoryId: string, type: MonthCloseTransaction["categoryType"], amount: number) {
  return { chargedAmount: amount, categoryType: type, categoryId };
}

const expense = (categoryId: string, amount: number): MonthCloseTransaction =>
  tx(categoryId, "expense", -Math.abs(amount));

function budget(overrides: Partial<BudgetConfig> = {}): BudgetConfig {
  return {
    id: "b1",
    categoryId: "food",
    categoryName: "אוכל",
    categoryColor: "#f59e0b",
    monthlyLimit: 1000,
    ...overrides,
  };
}

describe("buildMonthCloseVerdicts — closed-month gate", () => {
  it("returns the not-closed sentinel for the current in-progress month, even with budgets/targets configured", () => {
    const result = buildMonthCloseVerdicts(
      MAY,
      "2026-05-15", // today is inside May — May is not closed yet
      [expense("food", 500)],
      CATEGORY_TREE,
      [budget()],
      3000,
    );
    expect(result).toEqual({ monthClosed: false, budgets: [], savingsTarget: null });
  });

  it("returns the not-closed sentinel when today is still before the month", () => {
    const result = buildMonthCloseVerdicts(MAY, "2026-01-01", [], CATEGORY_TREE, [budget()], 3000);
    expect(result.monthClosed).toBe(false);
  });

  it("computes verdicts once today is strictly past the month's last day", () => {
    const result = buildMonthCloseVerdicts(
      MAY,
      "2026-06-01",
      [expense("food", 500)],
      CATEGORY_TREE,
      [budget()],
      null,
    );
    expect(result.monthClosed).toBe(true);
  });
});

describe("buildMonthCloseVerdicts — hides gracefully with nothing configured", () => {
  it("returns an empty (but closed) result when there are no budgets and no savings target", () => {
    const result = buildMonthCloseVerdicts(
      MAY,
      "2026-06-01",
      [expense("food", 500)],
      CATEGORY_TREE,
      [],
      null,
    );
    expect(result).toEqual({ monthClosed: true, budgets: [], savingsTarget: null });
  });
});

describe("buildMonthCloseVerdicts — category budgets (subtree spend, closed-month pace)", () => {
  const TODAY_AFTER_MAY = "2026-06-10";

  it("sums a group budget's own spend plus its child's (subtree spend)", () => {
    const result = buildMonthCloseVerdicts(
      MAY,
      TODAY_AFTER_MAY,
      [expense("food", 300), expense("grocery", 200)],
      CATEGORY_TREE,
      [budget({ categoryId: "food", monthlyLimit: 1000 })],
      null,
    );
    expect(result.budgets[0].spent).toBe(500);
  });

  it("resolves `over` once spend reaches the limit — a closed month never softens this", () => {
    const result = buildMonthCloseVerdicts(
      MAY,
      TODAY_AFTER_MAY,
      [expense("food", 1000)],
      CATEGORY_TREE,
      [budget({ monthlyLimit: 1000 })],
      null,
    );
    expect(result.budgets[0].verdict).toBe("over");
  });

  it("resolves `comfortably-under` well below the limit and `on-pace` just under it", () => {
    const under = buildMonthCloseVerdicts(
      MAY,
      TODAY_AFTER_MAY,
      [expense("food", 100)],
      CATEGORY_TREE,
      [budget({ monthlyLimit: 1000 })],
      null,
    );
    expect(under.budgets[0].verdict).toBe("comfortably-under"); // 10% spent vs. 100% elapsed

    const onPace = buildMonthCloseVerdicts(
      MAY,
      TODAY_AFTER_MAY,
      [expense("food", 850)],
      CATEGORY_TREE,
      [budget({ monthlyLimit: 1000 })],
      null,
    );
    expect(onPace.budgets[0].verdict).toBe("on-pace"); // 85% spent vs. 100% elapsed
  });

  it("never resolves `at-risk` for a closed month (elapsed fraction is always 1, so over already claims that band)", () => {
    // Every spend fraction from 0 to just under 1 falls in on-pace/comfortably-under;
    // >= 1 is `over`. There is no fraction where a closed month can be `at-risk`.
    for (const spent of [0, 100, 500, 799, 800, 899, 900, 999]) {
      const result = buildMonthCloseVerdicts(
        MAY,
        TODAY_AFTER_MAY,
        [expense("food", spent)],
        CATEGORY_TREE,
        [budget({ monthlyLimit: 1000 })],
        null,
      );
      expect(result.budgets[0].verdict).not.toBe("at-risk");
    }
  });

  it("evaluates independent budgets on unrelated categories without cross-contamination", () => {
    const result = buildMonthCloseVerdicts(
      MAY,
      TODAY_AFTER_MAY,
      [expense("food", 200), expense("transport", 900)],
      CATEGORY_TREE,
      [
        budget({ id: "b-food", categoryId: "food", monthlyLimit: 1000 }),
        budget({
          id: "b-transport",
          categoryId: "transport",
          categoryName: "תחבורה",
          monthlyLimit: 1000,
        }),
      ],
      null,
    );
    const food = result.budgets.find((b) => b.id === "b-food")!;
    const transport = result.budgets.find((b) => b.id === "b-transport")!;
    expect(food.spent).toBe(200);
    expect(food.verdict).toBe("comfortably-under");
    expect(transport.spent).toBe(900);
    expect(transport.verdict).toBe("on-pace");
  });
});

describe("buildMonthCloseVerdicts — savings target (met/missed at month close)", () => {
  const TODAY_AFTER_MAY = "2026-06-10";

  it("is null when no savings target is set", () => {
    const result = buildMonthCloseVerdicts(MAY, TODAY_AFTER_MAY, [], CATEGORY_TREE, [], null);
    expect(result.savingsTarget).toBeNull();
  });

  it("computes Net Savings via analytics (income − expenses) and classifies met/missed", () => {
    const income: MonthCloseTransaction = {
      chargedAmount: 10000,
      categoryType: "income",
      categoryId: "salary",
    };
    const met = buildMonthCloseVerdicts(
      MAY,
      TODAY_AFTER_MAY,
      [income, expense("food", 3000)],
      CATEGORY_TREE,
      [],
      5000,
    );
    expect(met.savingsTarget).toEqual({ target: 5000, netSavings: 7000, verdict: "met" });

    const missed = buildMonthCloseVerdicts(
      MAY,
      TODAY_AFTER_MAY,
      [income, expense("food", 3000)],
      CATEGORY_TREE,
      [],
      8000,
    );
    expect(missed.savingsTarget?.verdict).toBe("missed");
  });

  it("keeps transfer/ignore/investment out of Net Savings, matching the analytics lens", () => {
    const income: MonthCloseTransaction = {
      chargedAmount: 10000,
      categoryType: "income",
      categoryId: "salary",
    };
    const transfer: MonthCloseTransaction = {
      chargedAmount: -5000,
      categoryType: "transfer",
      categoryId: "xfer",
    };
    const investment: MonthCloseTransaction = {
      chargedAmount: -2000,
      categoryType: "investment",
      categoryId: "fund",
    };
    const result = buildMonthCloseVerdicts(
      MAY,
      TODAY_AFTER_MAY,
      [income, transfer, investment],
      CATEGORY_TREE,
      [],
      9000,
    );
    // Net Savings = 10000 (transfer/investment never reduce it) → met against a 9000 target.
    expect(result.savingsTarget).toEqual({ target: 9000, netSavings: 10000, verdict: "met" });
  });
});
