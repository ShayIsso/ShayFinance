import { describe, it, expect } from "vitest";
import { buildTrendsReport, enumerateMonthRange, type TrendsMonthInput } from "../trends";
import { buildMonthlyReport, type MonthlyReportInput } from "../monthly";
import type { TransactionWithCategory, RollupCategory } from "@/lib/analytics";

// ── fixtures ──────────────────────────────────────────────────────────────────
// Same typed taxonomy shape the monthly-report suite uses: one expense group
// (אוכל) with two leaves, one expense root leaf (תחבורה), plus income and
// investment leaves.

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

const month = (
  year: number,
  m: number,
  transactions: TransactionWithCategory[],
): TrendsMonthInput => ({ year, month: m, transactions });

// ── enumerateMonthRange ─────────────────────────────────────────────────────

describe("enumerateMonthRange", () => {
  it("defaults to 12 chronological months ending at today's calendar month", () => {
    const months = enumerateMonthRange("2026-07-15", 12);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ year: 2025, month: 8 });
    expect(months[11]).toEqual({ year: 2026, month: 7 });
  });

  it("wraps correctly across a year boundary", () => {
    const months = enumerateMonthRange("2026-02-10", 3);
    expect(months).toEqual([
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  it("handles a single-month range", () => {
    expect(enumerateMonthRange("2026-05-01", 1)).toEqual([{ year: 2026, month: 5 }]);
  });
});

// ── series shape ──────────────────────────────────────────────────────────────

describe("buildTrendsReport — monthly series", () => {
  const months = [
    month(2026, 4, [income(18000), expense(CATS.grocery, 3000), investment(1000)]),
    month(2026, 5, [income(20000), expense(CATS.grocery, 3500), expense(CATS.transport, 1500)]),
  ];

  it("produces one point per input month, in order, with lens-correct metrics", () => {
    const report = buildTrendsReport(months, categories);

    expect(report.months).toHaveLength(2);
    expect(report.months[0]).toMatchObject({ year: 2026, month: 4, income: 18000, expenses: 3000 });
    expect(report.months[0].netSavings).toBe(15000);
    expect(report.months[0].investment).toBe(1000);
    expect(report.months[1]).toMatchObject({ year: 2026, month: 5, income: 20000, expenses: 5000 });
    expect(report.months[1].netSavings).toBe(15000);
  });

  it("flags overall hasData and per-month hasData", () => {
    const report = buildTrendsReport(months, categories);
    expect(report.hasData).toBe(true);
    expect(report.months.every((p) => p.hasData)).toBe(true);
  });
});

describe("buildTrendsReport — range edges (partial first/last months of data)", () => {
  const months = [
    month(2026, 1, []), // no data at the start of the range
    month(2026, 2, [income(20000), expense(CATS.grocery, 4000)]),
    month(2026, 3, []), // no data at the end of the range
  ];

  it("keeps empty edge months as zero-valued points rather than dropping them", () => {
    const report = buildTrendsReport(months, categories);
    expect(report.months).toHaveLength(3);
    expect(report.months[0]).toMatchObject({
      year: 2026,
      month: 1,
      income: 0,
      expenses: 0,
      hasData: false,
    });
    expect(report.months[2]).toMatchObject({ year: 2026, month: 3, hasData: false });
    expect(report.months[1].hasData).toBe(true);
    expect(report.hasData).toBe(true);
  });

  it("reports hasData false when no month in the range has any transaction", () => {
    const report = buildTrendsReport([month(2026, 1, []), month(2026, 2, [])], categories);
    expect(report.hasData).toBe(false);
    expect(report.breakdown).toEqual([]);
    expect(report.years).toEqual([]);
  });
});

// ── group/leaf drill-down + aggregation lens ─────────────────────────────────

describe("buildTrendsReport — group/leaf breakdown series", () => {
  const months = [
    month(2026, 4, [
      expense(CATS.grocery, 3000),
      expense(CATS.restaurant, 1000),
      expense(CATS.transport, 1500),
    ]),
    month(2026, 5, [expense(CATS.grocery, 3500), expense(CATS.transport, 1200)]),
  ];

  it("rolls leaves under their group with per-month amounts aligned to the series", () => {
    const report = buildTrendsReport(months, categories);

    const food = report.breakdown.find((n) => n.categoryId === CATS.food)!;
    expect(food.amounts).toEqual([4000, 3500]); // (3000+1000), (3500+0)
    expect(food.total).toBe(7500);
    expect(food.children.map((c) => c.categoryId).sort()).toEqual(
      [CATS.grocery, CATS.restaurant].sort(),
    );

    const grocery = food.children.find((c) => c.categoryId === CATS.grocery)!;
    expect(grocery.amounts).toEqual([3000, 3500]);
    const restaurant = food.children.find((c) => c.categoryId === CATS.restaurant)!;
    expect(restaurant.amounts).toEqual([1000, 0]); // absent in month 2 → zero
  });

  it("obeys the aggregation lens: group amount per month = sum of its leaves that month", () => {
    const report = buildTrendsReport(months, categories);
    const food = report.breakdown.find((n) => n.categoryId === CATS.food)!;
    for (let i = 0; i < food.amounts.length; i++) {
      expect(food.amounts[i]).toBe(food.children.reduce((s, c) => s + c.amounts[i], 0));
    }
  });

  it("keeps a root leaf at the top level with no children", () => {
    const report = buildTrendsReport(months, categories);
    const transport = report.breakdown.find((n) => n.categoryId === CATS.transport)!;
    expect(transport.children).toEqual([]);
    expect(transport.amounts).toEqual([1500, 1200]);
  });
});

// ── annual fold-in as year rows ──────────────────────────────────────────────

describe("buildTrendsReport — annual year rows", () => {
  const months = [
    month(2025, 11, [income(10000), expense(CATS.grocery, 4000)]),
    month(2025, 12, [income(12000), expense(CATS.grocery, 5000)]),
    month(2026, 1, [income(20000), expense(CATS.grocery, 6000), investment(2000)]),
  ];

  it("folds monthly points into per-year totals", () => {
    const report = buildTrendsReport(months, categories);

    const y2025 = report.years.find((y) => y.year === 2025)!;
    expect(y2025.income).toBe(22000); // 10000 + 12000
    expect(y2025.expenses).toBe(9000); // 4000 + 5000
    expect(y2025.netSavings).toBe(13000);
    expect(y2025.monthCount).toBe(2);

    const y2026 = report.years.find((y) => y.year === 2026)!;
    expect(y2026.income).toBe(20000);
    expect(y2026.expenses).toBe(6000);
    expect(y2026.investment).toBe(2000);
    expect(y2026.monthCount).toBe(1);
  });

  it("orders year rows newest first", () => {
    const report = buildTrendsReport(months, categories);
    expect(report.years.map((y) => y.year)).toEqual([2026, 2025]);
  });
});

// ── cross-check: trends totals agree with the monthly report ─────────────────

describe("buildTrendsReport — agreement with the monthly report", () => {
  const overlapping: TransactionWithCategory[] = [
    income(20000),
    expense(CATS.grocery, 3000),
    expense(CATS.restaurant, 1000),
    expense(CATS.transport, 1500),
    investment(2000),
    tx({ amount: -5000, type: "transfer", categoryId: "xfer", categoryName: "העברה פנימית" }),
    tx({ amount: -800, type: "ignore", categoryId: "ign", categoryName: "התעלם" }),
  ];

  it("matches the monthly report's summary for any overlapping month", () => {
    const trends = buildTrendsReport([month(2026, 4, []), month(2026, 5, overlapping)], categories);
    const monthly = buildMonthlyReport(
      { transactions: overlapping } as MonthlyReportInput,
      null,
      categories,
    );

    const point = trends.months.find((p) => p.month === 5)!;
    expect(point.income).toBe(monthly.summary.income.current);
    expect(point.expenses).toBe(monthly.summary.expenses.current);
    expect(point.netSavings).toBe(monthly.summary.netSavings.current);
    expect(point.investment).toBe(monthly.summary.investment.current);
  });

  it("matches the monthly report's group breakdown amounts for the overlapping month", () => {
    const trends = buildTrendsReport([month(2026, 5, overlapping)], categories);
    const monthly = buildMonthlyReport(
      { transactions: overlapping } as MonthlyReportInput,
      null,
      categories,
    );

    for (const node of monthly.breakdown) {
      const series = trends.breakdown.find((s) => s.categoryId === node.categoryId)!;
      expect(series.amounts[0]).toBe(node.amount);
    }
  });
});
