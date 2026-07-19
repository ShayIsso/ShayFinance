/**
 * PROTOTYPE — hardcoded mock data for the BGR9 (#166) reaction pass. No DB,
 * no module import: mirrors the shapes `getBudgetStatuses` /
 * `getSavingsTargetStatus` return (src/lib/budgets/index.ts) but is a plain
 * local copy so this sandbox has zero runtime dependency on the real module.
 */

export type BudgetVerdict = "over" | "at-risk" | "on-pace" | "comfortably-under";

export type MockBudget = {
  id: string;
  categoryName: string;
  categoryColor: string;
  verdict: BudgetVerdict;
  spent: number;
  limit: number;
};

export type MockSavingsTarget = {
  target: number;
  netSavings: number;
  monthClosed: boolean;
  verdict: "met" | "missed" | null;
};

export type MockScenario = {
  budgets: MockBudget[];
  expenseTarget: number | null;
  expenseActual: number;
  savingsTarget: MockSavingsTarget | null;
};

export type ScenarioKey = "populated" | "targetsOnly" | "monthClosed" | "empty";

export const SCENARIOS: Record<ScenarioKey, MockScenario> = {
  populated: {
    budgets: [
      {
        id: "1",
        categoryName: "מכולת",
        categoryColor: "#16a34a",
        verdict: "over",
        spent: 2200,
        limit: 1800,
      },
      {
        id: "2",
        categoryName: "תחבורה",
        categoryColor: "#2563eb",
        verdict: "at-risk",
        spent: 950,
        limit: 1000,
      },
      {
        id: "3",
        categoryName: "בילויים",
        categoryColor: "#f59e0b",
        verdict: "on-pace",
        spent: 400,
        limit: 900,
      },
      {
        id: "4",
        categoryName: "ביגוד",
        categoryColor: "#a855f7",
        verdict: "comfortably-under",
        spent: 100,
        limit: 600,
      },
    ],
    expenseTarget: 12000,
    expenseActual: 9800,
    savingsTarget: { target: 3000, netSavings: 1200, monthClosed: false, verdict: null },
  },
  targetsOnly: {
    budgets: [],
    expenseTarget: 12000,
    expenseActual: 7200,
    savingsTarget: { target: 3000, netSavings: 2100, monthClosed: false, verdict: null },
  },
  monthClosed: {
    budgets: [
      {
        id: "1",
        categoryName: "מכולת",
        categoryColor: "#16a34a",
        verdict: "over",
        spent: 2400,
        limit: 1800,
      },
      {
        id: "2",
        categoryName: "תחבורה",
        categoryColor: "#2563eb",
        verdict: "on-pace",
        spent: 980,
        limit: 1000,
      },
    ],
    expenseTarget: 12000,
    expenseActual: 13100,
    savingsTarget: { target: 3000, netSavings: 3400, monthClosed: true, verdict: "met" },
  },
  empty: {
    budgets: [],
    expenseTarget: null,
    expenseActual: 0,
    savingsTarget: null,
  },
};
