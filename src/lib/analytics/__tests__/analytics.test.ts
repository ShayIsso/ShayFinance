import { describe, it, expect } from "vitest";
import {
  computeMonthlySummary,
  computeSpendingByCategory,
  rollUpSpendingByGroup,
  type CategorySpending,
  type RollupCategory,
} from "../index";

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

describe("rollUpSpendingByGroup", () => {
  // A shape resembling the real 17-leaf / 3-group taxonomy, trimmed to what the
  // roll-up needs: three expense groups plus root leaves.
  const categories: RollupCategory[] = [
    { id: "g-food", name: "אוכל", color: "#e11", icon: "Utensils", parentId: null },
    {
      id: "l-groceries",
      name: "מזון וסופר",
      color: "#e11",
      icon: "ShoppingCart",
      parentId: "g-food",
    },
    { id: "l-restaurants", name: "מסעדות וקפה", color: "#e11", icon: "Coffee", parentId: "g-food" },
    { id: "g-home", name: "בית וחשבונות", color: "#22a", icon: "Home", parentId: null },
    { id: "l-rent", name: "דיור ושכירות", color: "#22a", icon: "Home", parentId: "g-home" },
    { id: "l-utilities", name: "חשבונות ושירותים", color: "#22a", icon: "Zap", parentId: "g-home" },
    { id: "l-transport", name: "תחבורה", color: "#3a3", icon: "Car", parentId: null },
    { id: "l-health", name: "בריאות וטיפוח", color: "#a3a", icon: "Heart", parentId: null },
  ];

  const spend = (categoryId: string, amount: number): CategorySpending => {
    const cat = categories.find((c) => c.id === categoryId)!;
    return { categoryId, categoryName: cat.name, amount, color: cat.color, icon: cat.icon };
  };

  it("rolls leaves up under their group with the group total = sum of leaves", () => {
    const spending = [spend("l-groceries", 300), spend("l-restaurants", 200)];
    const nodes = rollUpSpendingByGroup(spending, categories);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].categoryId).toBe("g-food");
    expect(nodes[0].amount).toBe(500);
    expect(nodes[0].children.map((c) => c.categoryId)).toEqual(["l-groceries", "l-restaurants"]);
  });

  it("places root leaves beside groups at the top level with empty children", () => {
    const spending = [spend("l-groceries", 300), spend("l-transport", 150)];
    const nodes = rollUpSpendingByGroup(spending, categories);

    const transport = nodes.find((n) => n.categoryId === "l-transport");
    expect(transport?.amount).toBe(150);
    expect(transport?.children).toEqual([]);
  });

  it("omits a group with no spending in any leaf", () => {
    const spending = [spend("l-transport", 150)];
    const nodes = rollUpSpendingByGroup(spending, categories);
    expect(nodes.map((n) => n.categoryId)).toEqual(["l-transport"]);
  });

  it("sorts top level and each group's children by amount descending", () => {
    const spending = [
      spend("l-groceries", 100),
      spend("l-restaurants", 400),
      spend("l-transport", 250),
    ];
    const nodes = rollUpSpendingByGroup(spending, categories);

    expect(nodes.map((n) => n.categoryId)).toEqual(["g-food", "l-transport"]);
    expect(nodes[0].children.map((c) => c.categoryId)).toEqual(["l-restaurants", "l-groceries"]);
  });

  it("returns an empty breakdown for empty spending", () => {
    expect(rollUpSpendingByGroup([], categories)).toEqual([]);
  });
});

describe("aggregation-lens invariant (ADR-0011 §4)", () => {
  // Realistic month: income, categorized expenses across groups + root leaves,
  // plus investment/transfer/ignore/uncategorized noise that must not leak.
  const categories: RollupCategory[] = [
    { id: "g-food", name: "אוכל", color: "#e11", icon: "Utensils", parentId: null },
    {
      id: "l-groceries",
      name: "מזון וסופר",
      color: "#e11",
      icon: "ShoppingCart",
      parentId: "g-food",
    },
    { id: "l-restaurants", name: "מסעדות וקפה", color: "#e11", icon: "Coffee", parentId: "g-food" },
    { id: "g-leisure", name: "פנאי וקניות", color: "#a3a", icon: "Gift", parentId: null },
    { id: "l-fun", name: "בילויים ופנאי", color: "#a3a", icon: "Ticket", parentId: "g-leisure" },
    { id: "l-transport", name: "תחבורה", color: "#3a3", icon: "Car", parentId: null },
  ];

  type Row = {
    chargedAmount: number;
    categoryType: "income" | "expense" | "investment" | "transfer" | "ignore" | null;
    categoryId: string | null;
    categoryName: string;
    categoryColor: string;
    categoryIcon: string;
  };

  const expenseRow = (categoryId: string, amount: number): Row => {
    const cat = categories.find((c) => c.id === categoryId)!;
    return {
      chargedAmount: -amount,
      categoryType: "expense",
      categoryId,
      categoryName: cat.name,
      categoryColor: cat.color,
      categoryIcon: cat.icon,
    };
  };

  const rows: Row[] = [
    {
      chargedAmount: 12000,
      categoryType: "income",
      categoryId: "inc",
      categoryName: "משכורת",
      categoryColor: "#0a0",
      categoryIcon: "Banknote",
    },
    expenseRow("l-groceries", 900),
    expenseRow("l-restaurants", 350),
    expenseRow("l-fun", 500),
    expenseRow("l-transport", 400),
    {
      chargedAmount: -2000,
      categoryType: "investment",
      categoryId: "inv",
      categoryName: "השקעה",
      categoryColor: "#00a",
      categoryIcon: "TrendingUp",
    },
    {
      chargedAmount: -1500,
      categoryType: "transfer",
      categoryId: "trf",
      categoryName: "העברה",
      categoryColor: "#888",
      categoryIcon: "ArrowLeftRight",
    },
    {
      chargedAmount: -80,
      categoryType: "ignore",
      categoryId: "ign",
      categoryName: "התעלם",
      categoryColor: "#888",
      categoryIcon: "EyeOff",
    },
    {
      chargedAmount: -70,
      categoryType: null,
      categoryId: null,
      categoryName: "",
      categoryColor: "#888",
      categoryIcon: "MoreHorizontal",
    },
  ];

  it("leaves type-driven totals byte-identical with and without grouping", () => {
    const summary = computeMonthlySummary(rows);
    const flat = computeSpendingByCategory(rows);
    const rolled = rollUpSpendingByGroup(flat, categories);

    // Grouping is a lens over the expense breakdown only; the type-driven
    // summary never reads it — these are exactly the pre-hierarchy numbers.
    expect(summary.income).toBe(12000);
    expect(summary.expenses).toBe(2150);
    expect(summary.investmentTotal).toBe(2000);
    expect(summary.netSavings).toBe(9850);

    // Every fully-categorized expense flows through exactly one leaf: the flat
    // and rolled-up totals both equal Total Expenses, so grouping can neither
    // drop nor double-count a shekel.
    const flatTotal = flat.reduce((sum, s) => sum + s.amount, 0);
    const rolledTotal = rolled.reduce((sum, n) => sum + n.amount, 0);
    expect(flatTotal).toBe(summary.expenses);
    expect(rolledTotal).toBe(summary.expenses);
  });

  it("defines every group total as the sum of its leaves", () => {
    const rolled = rollUpSpendingByGroup(computeSpendingByCategory(rows), categories);
    for (const node of rolled) {
      if (node.children.length > 0) {
        const leafSum = node.children.reduce((sum, c) => sum + c.amount, 0);
        expect(node.amount).toBe(leafSum);
      }
    }
    expect(rolled.find((n) => n.categoryId === "g-food")?.amount).toBe(1250);
  });

  it("keeps root leaves at the top level beside groups", () => {
    const rolled = rollUpSpendingByGroup(computeSpendingByCategory(rows), categories);
    const topLevelIds = rolled.map((n) => n.categoryId);
    expect(topLevelIds).toContain("l-transport");
    expect(topLevelIds).toContain("g-food");
    expect(topLevelIds).toContain("g-leisure");
    // The single-leaf group still surfaces as a group node, not a bare leaf.
    expect(topLevelIds).not.toContain("l-fun");
  });
});
