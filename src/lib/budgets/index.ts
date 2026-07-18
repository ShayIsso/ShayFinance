/**
 * Public interface of the budgets module (CONTEXT.md "budget pace"; decision
 * record #105). Budgets are gauges, not allocations: an optional monthly cap per
 * expense-type category, measured as subtree spend for one calendar month and
 * reset every month (contrast goals, which accumulate). The DB-backed wrappers
 * compose the pure pace core with the same calendar-month transaction window
 * analytics uses, so budget numbers always agree with the Dashboard.
 */
import { db } from "@/db";
import { transactions, categories, monthlyTargets } from "@/db/schema";
import { and, gte, lte, eq } from "drizzle-orm";
import { computeMonthlySummary, type AnalyticsTransaction } from "@/lib/analytics";
import {
  createBudgetWithStore,
  updateBudgetWithStore,
  deleteBudgetWithStore,
  drizzleBudgetStore,
  type BudgetChanges,
  type BudgetWriteData,
  type StoredBudget,
} from "./store";
import {
  computeCategorySpend,
  computeSubtreeSpend,
  evaluateBudget,
  monthElapsed,
  isMonthClosed,
  classifySavingsTarget,
  type BudgetPace,
  type SavingsTargetVerdict,
  type YearMonth,
} from "./pace";

export { DuplicateBudgetCategoryError, NonExpenseBudgetCategoryError } from "./errors";
export type { StoredBudget, BudgetWriteData, BudgetChanges, BudgetStore } from "./store";
export {
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
  type BudgetVerdict,
  type BudgetPace,
  type MonthElapsed,
  type SavingsTargetVerdict,
  type YearMonth,
} from "./pace";

export type BudgetStatus = {
  budget: StoredBudget;
  /** Subtree spend for the month (self + direct children over the one-level tree). */
  pace: BudgetPace;
};

export type MonthlyTargetsData = {
  expenseTarget: number | null;
  savingsTarget: number | null;
};

export type SavingsTargetStatus = {
  target: number;
  netSavings: number;
  monthClosed: boolean;
  /** Null intra-month: the savings target is evaluated at month close only in V1. */
  verdict: SavingsTargetVerdict | null;
};

export async function createBudget(data: BudgetWriteData): Promise<string> {
  return createBudgetWithStore(data, drizzleBudgetStore);
}

export async function updateBudget(id: string, changes: BudgetChanges): Promise<void> {
  await updateBudgetWithStore(id, changes, drizzleBudgetStore);
}

export async function deleteBudget(id: string): Promise<void> {
  await deleteBudgetWithStore(id, drizzleBudgetStore);
}

export async function listBudgets(): Promise<StoredBudget[]> {
  return drizzleBudgetStore.listBudgets();
}

/**
 * The budget on a category, if any. BGR8's category delete-confirm dialog calls
 * this to warn that deleting the category will cascade-delete its budget (schema
 * `ON DELETE CASCADE`); nothing else needs a detach story.
 */
export async function getBudgetForCategory(categoryId: string): Promise<StoredBudget | null> {
  return drizzleBudgetStore.getByCategoryId(categoryId);
}

function monthDateRange(month: YearMonth): { from: string; to: string } {
  const mm = String(month.month).padStart(2, "0");
  const lastDay = new Date(month.year, month.month, 0).getDate();
  return {
    from: `${month.year}-${mm}-01`,
    to: `${month.year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

async function loadMonthTransactions(
  month: YearMonth,
): Promise<(AnalyticsTransaction & { categoryId: string | null })[]> {
  const { from, to } = monthDateRange(month);
  const rows = await db
    .select({
      chargedAmount: transactions.chargedAmount,
      categoryType: categories.type,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)));

  return rows.map((r) => ({
    chargedAmount: Number(r.chargedAmount),
    categoryType: r.categoryType ?? null,
    categoryId: r.categoryId ?? null,
  }));
}

const isoToday = (): string => new Date().toISOString().slice(0, 10);

/**
 * Pace verdict for every budget in `month`. Each budget evaluates independently
 * over its subtree (parent and child budgets coexist with no precedence law).
 * `today` is threaded to the pure core; it defaults to the real date but is a
 * parameter so callers and tests stay deterministic.
 */
export async function getBudgetStatuses(
  year: number,
  month: number,
  today: string = isoToday(),
): Promise<BudgetStatus[]> {
  const budgetRows = await drizzleBudgetStore.listBudgets();
  if (budgetRows.length === 0) return [];

  const ym: YearMonth = { year, month };
  const [txns, categoryRows] = await Promise.all([
    loadMonthTransactions(ym),
    db.select({ id: categories.id, parentId: categories.parentId }).from(categories),
  ]);

  const spend = computeCategorySpend(txns);
  const elapsed = monthElapsed(ym, today);

  return budgetRows.map((budget) => {
    const subtreeSpend = computeSubtreeSpend(budget.categoryId, categoryRows, spend);
    return { budget, pace: evaluateBudget(budget.monthlyLimit, subtreeSpend, elapsed) };
  });
}

export async function getMonthlyTargets(): Promise<MonthlyTargetsData> {
  const [row] = await db
    .select({
      expenseTarget: monthlyTargets.expenseTarget,
      savingsTarget: monthlyTargets.savingsTarget,
    })
    .from(monthlyTargets)
    .where(eq(monthlyTargets.id, 1));

  return {
    expenseTarget: row?.expenseTarget != null ? Number(row.expenseTarget) : null,
    savingsTarget: row?.savingsTarget != null ? Number(row.savingsTarget) : null,
  };
}

/** Upserts the single monthly-targets row (id=1 — mirrors `scheduler_config`). */
export async function setMonthlyTargets(data: MonthlyTargetsData): Promise<void> {
  const values = {
    expenseTarget: data.expenseTarget != null ? String(data.expenseTarget) : null,
    savingsTarget: data.savingsTarget != null ? String(data.savingsTarget) : null,
  };
  await db
    .insert(monthlyTargets)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({
      target: monthlyTargets.id,
      set: { ...values, updatedAt: new Date() },
    });
}

/**
 * The month's savings-target status against Net Savings. Returns null when no
 * savings target is set. The verdict is `met`/`missed` only once the month is
 * closed (`today` past its last day) — intra-month savings pacing is deferred to
 * a later slice (decision record #105 §6).
 */
export async function getSavingsTargetStatus(
  year: number,
  month: number,
  today: string = isoToday(),
): Promise<SavingsTargetStatus | null> {
  const { savingsTarget } = await getMonthlyTargets();
  if (savingsTarget == null) return null;

  const ym: YearMonth = { year, month };
  const txns = await loadMonthTransactions(ym);
  const netSavings = computeMonthlySummary(txns).netSavings;
  const monthClosed = isMonthClosed(ym, today);

  return {
    target: savingsTarget,
    netSavings,
    monthClosed,
    verdict: monthClosed ? classifySavingsTarget(savingsTarget, netSavings) : null,
  };
}
