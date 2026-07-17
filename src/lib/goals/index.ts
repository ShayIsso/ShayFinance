/**
 * Public interface of the goals module (CONTEXT.md "savings goal"). The
 * DB-backed wrappers compose the pure progress core with the same calendar-month
 * transaction window analytics uses, so goal numbers always agree with the
 * Dashboard.
 */
import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { and, gte, lte, eq } from "drizzle-orm";
import type { AnalyticsTransaction } from "@/lib/analytics";
import {
  createGoalWithStore,
  updateGoalWithStore,
  deleteGoalWithStore,
  drizzleGoalStore,
  type GoalChanges,
  type GoalWriteData,
  type StoredGoal,
} from "./store";
import {
  computeGoalProgress,
  computeDeadlinePace,
  formatYearMonth,
  parseYearMonth,
  type MonthlyTransactions,
  type YearMonth,
} from "./progress";

export { InvalidGoalTargetMonthError } from "./errors";
export type { StoredGoal, GoalWriteData, GoalChanges, GoalStore } from "./store";
export {
  computeGoalProgress,
  computeDeadlinePace,
  cumulativeTargetFromMonthly,
  monthlyAmountFromCumulative,
  monthsBetween,
  parseYearMonth,
  formatYearMonth,
  type YearMonth,
  type GoalProgress,
  type MonthlyTransactions,
} from "./progress";

export type GoalStatus = {
  goal: StoredGoal;
  opening: number;
  cumulativeNetSavings: number;
  current: number;
  target: number;
  remaining: number;
  /** Linear deadline pace expected at the current month; null for open-ended goals. */
  expected: number | null;
};

export async function createGoal(data: GoalWriteData): Promise<string> {
  return createGoalWithStore(data, drizzleGoalStore);
}

export async function updateGoal(id: string, changes: GoalChanges): Promise<void> {
  await updateGoalWithStore(id, changes, drizzleGoalStore);
}

export async function deleteGoal(id: string): Promise<void> {
  await deleteGoalWithStore(id, drizzleGoalStore);
}

export async function listGoals(): Promise<StoredGoal[]> {
  return drizzleGoalStore.listGoals();
}

function endOfMonthIso(ym: YearMonth): string {
  const lastDay = new Date(ym.year, ym.month, 0).getDate();
  return `${formatYearMonth(ym)}-${String(lastDay).padStart(2, "0")}`;
}

async function loadMonthlyTransactions(
  startMonth: YearMonth,
  currentMonth: YearMonth,
): Promise<MonthlyTransactions[]> {
  const from = `${formatYearMonth(startMonth)}-01`;
  const to = endOfMonthIso(currentMonth);

  const rows = await db
    .select({
      date: transactions.date,
      chargedAmount: transactions.chargedAmount,
      categoryType: categories.type,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)));

  const byMonth = new Map<string, AnalyticsTransaction[]>();
  for (const r of rows) {
    const monthKey = r.date.slice(0, 7);
    const list = byMonth.get(monthKey) ?? [];
    list.push({ chargedAmount: Number(r.chargedAmount), categoryType: r.categoryType ?? null });
    byMonth.set(monthKey, list);
  }

  return Array.from(byMonth.entries()).map(([key, txns]) => ({
    month: parseYearMonth(key),
    transactions: txns,
  }));
}

function toStatus(
  goal: StoredGoal,
  monthly: MonthlyTransactions[],
  currentMonth: YearMonth,
): GoalStatus {
  const startMonth = parseYearMonth(goal.startMonth);
  const targetMonth = goal.targetMonth ? parseYearMonth(goal.targetMonth) : null;

  const progress = computeGoalProgress(goal.openingAmount, startMonth, currentMonth, monthly);
  const expected = computeDeadlinePace(
    goal.openingAmount,
    goal.targetAmount,
    startMonth,
    targetMonth,
    currentMonth,
  );

  return {
    goal,
    opening: progress.opening,
    cumulativeNetSavings: progress.cumulativeNetSavings,
    current: progress.current,
    target: goal.targetAmount,
    remaining: goal.targetAmount - progress.current,
    expected,
  };
}

function currentMonthFrom(today: Date): YearMonth {
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

export async function getGoalStatus(id: string): Promise<GoalStatus | null> {
  const goal = await drizzleGoalStore.getById(id);
  if (!goal) return null;

  const currentMonth = currentMonthFrom(new Date());
  const monthly = await loadMonthlyTransactions(parseYearMonth(goal.startMonth), currentMonth);
  return toStatus(goal, monthly, currentMonth);
}

export async function getGoalStatuses(): Promise<GoalStatus[]> {
  const goals = await drizzleGoalStore.listGoals();
  if (goals.length === 0) return [];

  const currentMonth = currentMonthFrom(new Date());
  const earliestStart = goals
    .map((g) => parseYearMonth(g.startMonth))
    .reduce((min, ym) => (ym.year * 12 + ym.month < min.year * 12 + min.month ? ym : min));

  const monthly = await loadMonthlyTransactions(earliestStart, currentMonth);
  return goals.map((goal) => toStatus(goal, monthly, currentMonth));
}
