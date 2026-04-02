import { describe, it, expect } from "vitest";
import { computeMonthlySummary, computeSpendingByCategory } from "../index";

type AnalyticsTransaction = {
  chargedAmount: number;
  categoryType: "income" | "expense" | "investment" | "transfer" | "ignore" | null;
};

type TransactionWithCategory = AnalyticsTransaction & {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
};

describe("computeMonthlySummary", () => {
  it("sums income transactions", () => {
    const txs: AnalyticsTransaction[] = [
      { chargedAmount: 5000, categoryType: "income" },
      { chargedAmount: 3000, categoryType: "income" },
    ];
    const result = computeMonthlySummary(txs);
    expect(result.income).toBe(8000);
  });

  it("sums expenses as absolute values", () => {
    const txs: AnalyticsTransaction[] = [
      { chargedAmount: -200, categoryType: "expense" },
      { chargedAmount: -150, categoryType: "expense" },
    ];
    const result = computeMonthlySummary(txs);
    expect(result.expenses).toBe(350);
  });

  it("computes net savings as income minus expenses", () => {
    const txs: AnalyticsTransaction[] = [
      { chargedAmount: 5000, categoryType: "income" },
      { chargedAmount: -2000, categoryType: "expense" },
    ];
    const result = computeMonthlySummary(txs);
    expect(result.netSavings).toBe(3000);
  });

  it("computes savings rate as (netSavings / income) * 100", () => {
    const txs: AnalyticsTransaction[] = [
      { chargedAmount: 10000, categoryType: "income" },
      { chargedAmount: -3000, categoryType: "expense" },
    ];
    const result = computeMonthlySummary(txs);
    expect(result.savingsRate).toBe(70);
  });

  it("tracks investment total separately and does not reduce net savings", () => {
    const txs: AnalyticsTransaction[] = [
      { chargedAmount: 10000, categoryType: "income" },
      { chargedAmount: -2000, categoryType: "expense" },
      { chargedAmount: -1500, categoryType: "investment" },
    ];
    const result = computeMonthlySummary(txs);
    expect(result.investmentTotal).toBe(1500);
    expect(result.netSavings).toBe(8000); // investment does NOT reduce net savings
  });

  it("excludes transfer and ignore from all totals", () => {
    const txs: AnalyticsTransaction[] = [
      { chargedAmount: 5000, categoryType: "income" },
      { chargedAmount: -500, categoryType: "transfer" },
      { chargedAmount: -300, categoryType: "ignore" },
    ];
    const result = computeMonthlySummary(txs);
    expect(result.income).toBe(5000);
    expect(result.expenses).toBe(0);
    expect(result.investmentTotal).toBe(0);
    expect(result.netSavings).toBe(5000);
  });

  it("excludes uncategorized (null) transactions from all totals", () => {
    const txs: AnalyticsTransaction[] = [
      { chargedAmount: 5000, categoryType: "income" },
      { chargedAmount: -999, categoryType: null },
    ];
    const result = computeMonthlySummary(txs);
    expect(result.income).toBe(5000);
    expect(result.expenses).toBe(0);
    expect(result.netSavings).toBe(5000);
  });

  it("returns savings rate 0 when income is zero to avoid division by zero", () => {
    const txs: AnalyticsTransaction[] = [{ chargedAmount: -200, categoryType: "expense" }];
    const result = computeMonthlySummary(txs);
    expect(result.savingsRate).toBe(0);
  });

  it("returns all zeros for empty transactions array", () => {
    const result = computeMonthlySummary([]);
    expect(result).toEqual({
      income: 0,
      expenses: 0,
      netSavings: 0,
      savingsRate: 0,
      investmentTotal: 0,
    });
  });

  it("handles mixed batch with all category types correctly", () => {
    const txs: AnalyticsTransaction[] = [
      { chargedAmount: 8000, categoryType: "income" },
      { chargedAmount: 2000, categoryType: "income" },
      { chargedAmount: -1500, categoryType: "expense" },
      { chargedAmount: -500, categoryType: "expense" },
      { chargedAmount: -1000, categoryType: "investment" },
      { chargedAmount: -400, categoryType: "transfer" },
      { chargedAmount: -100, categoryType: "ignore" },
      { chargedAmount: -50, categoryType: null },
    ];
    const result = computeMonthlySummary(txs);
    expect(result.income).toBe(10000);
    expect(result.expenses).toBe(2000);
    expect(result.investmentTotal).toBe(1000);
    expect(result.netSavings).toBe(8000); // 10000 - 2000, investment excluded
    expect(result.savingsRate).toBe(80); // 8000 / 10000 * 100
  });
});

describe("computeSpendingByCategory", () => {
  it("groups expense transactions by category and sums amounts", () => {
    const txs: TransactionWithCategory[] = [
      {
        chargedAmount: -300,
        categoryType: "expense",
        categoryId: "cat-1",
        categoryName: "מזון",
        categoryColor: "#ff0000",
        categoryIcon: "ShoppingCart",
      },
      {
        chargedAmount: -200,
        categoryType: "expense",
        categoryId: "cat-1",
        categoryName: "מזון",
        categoryColor: "#ff0000",
        categoryIcon: "ShoppingCart",
      },
      {
        chargedAmount: -150,
        categoryType: "expense",
        categoryId: "cat-2",
        categoryName: "תחבורה",
        categoryColor: "#0000ff",
        categoryIcon: "Car",
      },
    ];
    const result = computeSpendingByCategory(txs);
    const food = result.find((r) => r.categoryId === "cat-1");
    const transport = result.find((r) => r.categoryId === "cat-2");
    expect(food?.amount).toBe(500);
    expect(transport?.amount).toBe(150);
  });

  it("returns results sorted by amount descending", () => {
    const txs: TransactionWithCategory[] = [
      {
        chargedAmount: -100,
        categoryType: "expense",
        categoryId: "cat-small",
        categoryName: "קטן",
        categoryColor: "#aaa",
        categoryIcon: "MoreHorizontal",
      },
      {
        chargedAmount: -800,
        categoryType: "expense",
        categoryId: "cat-big",
        categoryName: "גדול",
        categoryColor: "#bbb",
        categoryIcon: "MoreHorizontal",
      },
      {
        chargedAmount: -400,
        categoryType: "expense",
        categoryId: "cat-mid",
        categoryName: "בינוני",
        categoryColor: "#ccc",
        categoryIcon: "MoreHorizontal",
      },
    ];
    const result = computeSpendingByCategory(txs);
    expect(result[0].categoryId).toBe("cat-big");
    expect(result[1].categoryId).toBe("cat-mid");
    expect(result[2].categoryId).toBe("cat-small");
  });

  it("excludes non-expense categories from spending breakdown", () => {
    const txs: TransactionWithCategory[] = [
      {
        chargedAmount: 5000,
        categoryType: "income",
        categoryId: "cat-inc",
        categoryName: "משכורת",
        categoryColor: "#green",
        categoryIcon: "Banknote",
      },
      {
        chargedAmount: -200,
        categoryType: "expense",
        categoryId: "cat-exp",
        categoryName: "הוצאה",
        categoryColor: "#red",
        categoryIcon: "ShoppingCart",
      },
      {
        chargedAmount: -500,
        categoryType: "investment",
        categoryId: "cat-inv",
        categoryName: "השקעה",
        categoryColor: "#blue",
        categoryIcon: "TrendingUp",
      },
      {
        chargedAmount: -300,
        categoryType: "transfer",
        categoryId: "cat-trans",
        categoryName: "העברה",
        categoryColor: "#gray",
        categoryIcon: "ArrowLeftRight",
      },
    ];
    const result = computeSpendingByCategory(txs);
    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-exp");
  });
});
