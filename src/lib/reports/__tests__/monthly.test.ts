import { describe, it, expect } from "vitest";
import { buildMonthlyReport, type MonthlyReportInput } from "../monthly";
import { computeYoyDelta } from "../yoy";
import type { TransactionWithCategory, RollupCategory } from "@/lib/analytics";

// ── fixtures ──────────────────────────────────────────────────────────────────
// A small typed taxonomy: one expense group (אוכל) with two leaves, one expense
// root leaf (תחבורה), plus income and investment leaves. Mirrors the seeded shape.

const CATS = {
  food: "food-group",
  grocery: "grocery",
  restaurant: "restaurant",
  transport: "transport",
  salary: "salary",
  fund: "fund",
} as const;

const categories: RollupCategory[] = [
  { id: CATS.food, name: "אוכל", color: "#f59e0b", icon: "Utensils", parentId: null },
  {
    id: CATS.grocery,
    name: "מזון וסופר",
    color: "#fbbf24",
    icon: "ShoppingCart",
    parentId: CATS.food,
  },
  {
    id: CATS.restaurant,
    name: "מסעדות וקפה",
    color: "#f97316",
    icon: "Coffee",
    parentId: CATS.food,
  },
  { id: CATS.transport, name: "תחבורה", color: "#14b8a6", icon: "Bus", parentId: null },
  { id: CATS.salary, name: "משכורת", color: "#10b981", icon: "Wallet", parentId: null },
  { id: CATS.fund, name: "קרן השתלמות", color: "#3b82f6", icon: "TrendingUp", parentId: null },
];

type TxSpec = {
  amount: number;
  type: TransactionWithCategory["categoryType"];
  categoryId?: string;
  categoryName?: string;
  color?: string;
  icon?: string;
};

function tx(spec: TxSpec): TransactionWithCategory {
  return {
    chargedAmount: spec.amount,
    categoryType: spec.type,
    categoryId: spec.categoryId ?? null,
    categoryName: spec.categoryName ?? "",
    categoryColor: spec.color ?? "#888888",
    categoryIcon: spec.icon ?? "MoreHorizontal",
  };
}

function expense(categoryId: string, amount: number): TransactionWithCategory {
  const cat = categories.find((c) => c.id === categoryId)!;
  return tx({
    amount: -Math.abs(amount),
    type: "expense",
    categoryId,
    categoryName: cat.name,
    color: cat.color,
    icon: cat.icon,
  });
}

const income = (amount: number) =>
  tx({ amount, type: "income", categoryId: CATS.salary, categoryName: "משכורת" });
const investment = (amount: number) =>
  tx({
    amount: -Math.abs(amount),
    type: "investment",
    categoryId: CATS.fund,
    categoryName: "קרן השתלמות",
  });

// A representative current month: income, two food leaves, transport, investment,
// plus a transfer and an ignore row that must stay invisible to every total.
const currentMonth: MonthlyReportInput = {
  transactions: [
    income(20000),
    expense(CATS.grocery, 3000),
    expense(CATS.restaurant, 1000),
    expense(CATS.transport, 1500),
    investment(2000),
    tx({ amount: -5000, type: "transfer", categoryId: "xfer", categoryName: "העברה פנימית" }),
    tx({ amount: -800, type: "ignore", categoryId: "ign", categoryName: "התעלם" }),
  ],
};

describe("buildMonthlyReport — summary (lens rules)", () => {
  it("computes income/expenses/net savings/investment excluding transfer and ignore", () => {
    const report = buildMonthlyReport(currentMonth, null, categories);

    expect(report.summary.income.current).toBe(20000);
    expect(report.summary.expenses.current).toBe(5500); // 3000 + 1000 + 1500
    expect(report.summary.netSavings.current).toBe(14500); // 20000 - 5500
    expect(report.summary.investment.current).toBe(2000); // separate track
    expect(report.summary.savingsRate.current).toBeCloseTo(72.5, 5);
  });

  it("matches the analytics lens exactly (investment never reduces net savings)", () => {
    const report = buildMonthlyReport(currentMonth, null, categories);
    // Net savings ignores the 2000 investment and the 5000 transfer / 800 ignore.
    expect(report.summary.netSavings.current).toBe(
      report.summary.income.current - report.summary.expenses.current,
    );
  });
});

describe("buildMonthlyReport — group-first breakdown", () => {
  it("rolls leaves under their group with root leaves alongside; group total = sum of leaves", () => {
    const report = buildMonthlyReport(currentMonth, null, categories);

    const food = report.breakdown.find((n) => n.categoryId === CATS.food)!;
    expect(food.children.map((c) => c.categoryId).sort()).toEqual(
      [CATS.grocery, CATS.restaurant].sort(),
    );
    expect(food.amount).toBe(4000); // 3000 + 1000
    expect(food.amount).toBe(food.children.reduce((s, c) => s + c.amount, 0));

    const transport = report.breakdown.find((n) => n.categoryId === CATS.transport)!;
    expect(transport.children).toEqual([]);
    expect(transport.amount).toBe(1500);
  });

  it("breakdown total equals the expenses total (aggregation lens never changes a total)", () => {
    const report = buildMonthlyReport(currentMonth, null, categories);
    const breakdownTotal = report.breakdown.reduce((s, n) => s + n.amount, 0);
    expect(breakdownTotal).toBe(report.summary.expenses.current);
  });
});

describe("buildMonthlyReport — YoY column", () => {
  const lastYear: MonthlyReportInput = {
    transactions: [
      income(18000),
      expense(CATS.grocery, 2500),
      expense(CATS.restaurant, 900),
      expense(CATS.transport, 1200),
    ],
  };

  it("fills last-year values on every summary metric when last year has data", () => {
    const report = buildMonthlyReport(currentMonth, lastYear, categories);

    expect(report.hasLastYear).toBe(true);
    expect(report.summary.income.lastYear).toBe(18000);
    expect(report.summary.expenses.lastYear).toBe(4600); // 2500 + 900 + 1200
    expect(report.summary.netSavings.lastYear).toBe(13400);
  });

  it("attaches last-year amounts per breakdown node and leaf, group total folding all leaves", () => {
    const report = buildMonthlyReport(currentMonth, lastYear, categories);

    const food = report.breakdown.find((n) => n.categoryId === CATS.food)!;
    expect(food.lastYearAmount).toBe(3400); // 2500 + 900
    const grocery = food.children.find((c) => c.categoryId === CATS.grocery)!;
    expect(grocery.lastYearAmount).toBe(2500);

    const transport = report.breakdown.find((n) => n.categoryId === CATS.transport)!;
    expect(transport.lastYearAmount).toBe(1200);
  });

  it("gives a current-only category a zero last-year amount (present month, unmatched leaf)", () => {
    const lastYearNoTransport: MonthlyReportInput = {
      transactions: [income(18000), expense(CATS.grocery, 2500)],
    };
    const report = buildMonthlyReport(currentMonth, lastYearNoTransport, categories);
    const transport = report.breakdown.find((n) => n.categoryId === CATS.transport)!;
    expect(transport.lastYearAmount).toBe(0); // month present, this category absent
  });
});

describe("buildMonthlyReport — absent last year", () => {
  it("marks hasLastYear false and nulls every last-year value when last year is null", () => {
    const report = buildMonthlyReport(currentMonth, null, categories);

    expect(report.hasLastYear).toBe(false);
    expect(report.summary.income.lastYear).toBeNull();
    expect(report.summary.expenses.lastYear).toBeNull();
    expect(report.summary.savingsRate.lastYear).toBeNull();
    for (const node of report.breakdown) {
      expect(node.lastYearAmount).toBeNull();
      for (const leaf of node.children) expect(leaf.lastYearAmount).toBeNull();
    }
  });

  it("treats an empty last-year transaction set the same as absent", () => {
    const report = buildMonthlyReport(currentMonth, { transactions: [] }, categories);
    expect(report.hasLastYear).toBe(false);
    expect(report.summary.income.lastYear).toBeNull();
  });

  it("reports hasData false for an empty selected month", () => {
    const report = buildMonthlyReport({ transactions: [] }, null, categories);
    expect(report.hasData).toBe(false);
    expect(report.breakdown).toEqual([]);
    expect(report.summary.income.current).toBe(0);
  });
});

describe("computeYoyDelta", () => {
  it("returns a signed relative percent and direction for a normal comparison", () => {
    expect(computeYoyDelta(120, 100)).toEqual({ pct: 20, direction: "up" });
    expect(computeYoyDelta(80, 100)).toEqual({ pct: -20, direction: "down" });
  });

  it("returns flat with zero pct for an unchanged value", () => {
    expect(computeYoyDelta(100, 100)).toEqual({ pct: 0, direction: "flat" });
  });

  it("returns null pct (no fake ∞%) when last year is zero or absent", () => {
    expect(computeYoyDelta(500, 0).pct).toBeNull();
    expect(computeYoyDelta(500, null).pct).toBeNull();
  });
});
