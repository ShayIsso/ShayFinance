/**
 * Pure waterfall fold for the goal ladder (CONTEXT.md "goal ladder", "savings
 * pool"). No DB, no `new Date()` — the pool total and the ordered active goals
 * are passed in. The fold is stateless: distribute the current pool top-down,
 * each rung claiming up to its need (target − opening), the remainder spilling
 * to the next rung. A shrinking pool retreats bottom-first by construction
 * (there is no drain rule), so the top priority is the most protected.
 *
 * Amended by #183 — supersedes the per-goal independent accumulation of #105 §5,
 * where the same shekel advanced every goal at once.
 */
import {
  computeDeadlinePace,
  computeGoalPaceVerdict,
  computeGoalProgress,
  type GoalPaceVerdict,
  type MonthlyTransactions,
  type YearMonth,
} from "./progress";

/** One active goal's ladder inputs. Priority is the array position (index 0 = top rung). */
export type LadderGoal = {
  id: string;
  opening: number;
  target: number;
  startMonth: YearMonth;
  targetMonth: YearMonth | null;
};

export type LadderRung = {
  id: string;
  opening: number;
  /** need = max(0, target − opening): this goal's claim on the pool. */
  need: number;
  /** Pool slice this rung receives, in [0, need]. */
  fill: number;
  /** opening + fill, capped at target — the display value, never past 100%. */
  current: number;
  target: number;
  /** Linear deadline pace at currentMonth; null for open-ended goals. */
  expected: number | null;
  paceVerdict: GoalPaceVerdict;
};

export type LadderDistribution = {
  pool: number;
  rungs: LadderRung[];
  /** Pool beyond all active needs (עודף ללא יעד); 0 unless the pool exceeds them. */
  surplus: number;
};

/**
 * Savings pool (CONTEXT.md "savings pool"): cumulative Net Savings since the
 * tracking-since month through currentMonth. Reuses the progress core's window
 * fold with a zero opening — the pool is one global stream, never per-goal.
 */
export function computeSavingsPool(
  trackingSince: YearMonth,
  currentMonth: YearMonth,
  monthly: MonthlyTransactions[],
): number {
  return computeGoalProgress(0, trackingSince, currentMonth, monthly).cumulativeNetSavings;
}

/**
 * The stateless ladder fold. `goals` is already in priority order (top rung
 * first). Each rung's fill is `clamp(pool − needConsumedAbove, 0, need)`, so a
 * negative or under-filling pool leaves lower rungs at 0 (bottom-first retreat)
 * and no shekel is counted toward two goals.
 */
export function distributeLadder(
  pool: number,
  goals: LadderGoal[],
  currentMonth: YearMonth,
): LadderDistribution {
  let consumed = 0;
  const rungs: LadderRung[] = goals.map((g) => {
    const need = Math.max(0, g.target - g.opening);
    const fill = Math.max(0, Math.min(need, pool - consumed));
    consumed += need;
    const current = Math.min(g.target, g.opening + fill);
    const expected = computeDeadlinePace(
      g.opening,
      g.target,
      g.startMonth,
      g.targetMonth,
      currentMonth,
    );
    return {
      id: g.id,
      opening: g.opening,
      need,
      fill,
      current,
      target: g.target,
      expected,
      paceVerdict: computeGoalPaceVerdict(current, expected),
    };
  });

  return { pool, rungs, surplus: Math.max(0, pool - consumed) };
}
