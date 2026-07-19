/**
 * Public interface of the goals module (CONTEXT.md "savings goal", "goal
 * ladder"). The DB-backed wrappers compose the pure ladder core with the same
 * calendar-month transaction window analytics uses, so goal numbers always agree
 * with the Dashboard. Since #183 active goals share one `savings pool`
 * distributed top-down by priority — there is no per-goal accumulation window.
 */
import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { and, gte, lte, eq } from "drizzle-orm";
import type { AnalyticsTransaction } from "@/lib/analytics";
import {
  createGoalWithStore,
  updateGoalWithStore,
  deleteGoalWithStore,
  reorderGoalWithStore,
  archiveGoalWithStore,
  drizzleGoalStore,
  type GoalChanges,
  type GoalWriteData,
  type StoredGoal,
} from "./store";
import {
  formatYearMonth,
  parseYearMonth,
  type MonthlyTransactions,
  type YearMonth,
} from "./progress";
import { computeSavingsPool, distributeLadder, type LadderGoal, type LadderRung } from "./ladder";

export { InvalidGoalTargetMonthError } from "./errors";
export type { StoredGoal, GoalWriteData, GoalChanges, GoalStore } from "./store";
export type { LadderGoal, LadderRung, LadderDistribution } from "./ladder";
export { computeSavingsPool, distributeLadder } from "./ladder";
export {
  computeGoalProgress,
  computeDeadlinePace,
  computeGoalPaceVerdict,
  cumulativeTargetFromMonthly,
  monthlyAmountFromCumulative,
  monthsBetween,
  parseYearMonth,
  formatYearMonth,
  type YearMonth,
  type GoalProgress,
  type GoalPaceVerdict,
  type MonthlyTransactions,
} from "./progress";

export async function createGoal(data: GoalWriteData): Promise<string> {
  return createGoalWithStore(data, drizzleGoalStore);
}

export async function updateGoal(id: string, changes: GoalChanges): Promise<void> {
  await updateGoalWithStore(id, changes, drizzleGoalStore);
}

export async function deleteGoal(id: string): Promise<void> {
  await deleteGoalWithStore(id, drizzleGoalStore);
}

export async function reorderGoal(id: string, direction: "up" | "down"): Promise<void> {
  await reorderGoalWithStore(id, direction, drizzleGoalStore);
}

export async function archiveGoal(id: string): Promise<void> {
  await archiveGoalWithStore(id, drizzleGoalStore);
}

export async function listGoals(): Promise<StoredGoal[]> {
  return drizzleGoalStore.listGoals();
}

export async function getTrackingSinceMonth(): Promise<string | null> {
  return drizzleGoalStore.getTrackingSinceMonth();
}

export async function setTrackingSinceMonth(month: string | null): Promise<void> {
  await drizzleGoalStore.setTrackingSinceMonth(month);
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

function currentMonthFrom(today: Date): YearMonth {
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

/** A ladder rung joined back to its stored goal, for display. */
export type GoalLadderRung = LadderRung & { goal: StoredGoal };

export type GoalLadder = {
  trackingSinceMonth: string | null;
  pool: number;
  surplus: number;
  rungs: GoalLadderRung[];
};

/**
 * The live goal ladder: active goals in priority order, each with its capped
 * fill and pace verdict, plus the shared pool total and any unallocated surplus
 * (עודף ללא יעד). Archived goals are excluded. When no tracking-since month is
 * set the pool is 0 — the baseline is never inferred at runtime.
 */
export async function getGoalLadder(): Promise<GoalLadder> {
  const all = await drizzleGoalStore.listGoals();
  const active = all.filter((g) => g.archivedAt == null).sort((a, b) => a.priority - b.priority);
  const trackingSinceMonth = await drizzleGoalStore.getTrackingSinceMonth();
  const currentMonth = currentMonthFrom(new Date());

  if (active.length === 0) {
    return { trackingSinceMonth, pool: 0, surplus: 0, rungs: [] };
  }

  let pool = 0;
  if (trackingSinceMonth) {
    const trackingSince = parseYearMonth(trackingSinceMonth);
    const monthly = await loadMonthlyTransactions(trackingSince, currentMonth);
    pool = computeSavingsPool(trackingSince, currentMonth, monthly);
  }

  const ladderGoals: LadderGoal[] = active.map((g) => ({
    id: g.id,
    opening: g.openingAmount,
    target: g.targetAmount,
    startMonth: parseYearMonth(g.startMonth),
    targetMonth: g.targetMonth ? parseYearMonth(g.targetMonth) : null,
  }));

  const distribution = distributeLadder(pool, ladderGoals, currentMonth);
  const byId = new Map(active.map((g) => [g.id, g]));

  return {
    trackingSinceMonth,
    pool: distribution.pool,
    surplus: distribution.surplus,
    rungs: distribution.rungs.map((rung) => ({ ...rung, goal: byId.get(rung.id)! })),
  };
}
