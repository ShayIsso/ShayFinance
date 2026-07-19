import { describe, it, expect } from "vitest";
import { computeSavingsPool, distributeLadder, type LadderGoal } from "../ladder";
import { computeGoalProgress, type MonthlyTransactions, type YearMonth } from "../progress";
import type { AnalyticsTransaction } from "@/lib/analytics";

const ym = (year: number, month: number): YearMonth => ({ year, month });

const income = (n: number): AnalyticsTransaction => ({ chargedAmount: n, categoryType: "income" });
const expense = (n: number): AnalyticsTransaction => ({
  chargedAmount: -n,
  categoryType: "expense",
});
const month = (y: number, m: number, txns: AnalyticsTransaction[]): MonthlyTransactions => ({
  month: ym(y, m),
  transactions: txns,
});

const goal = (over: Partial<LadderGoal> & Pick<LadderGoal, "id">): LadderGoal => ({
  opening: 0,
  target: 1000,
  startMonth: ym(2026, 1),
  targetMonth: null,
  ...over,
});

const now = ym(2026, 6);

describe("computeSavingsPool", () => {
  it("is cumulative Net Savings since the tracking-since month (one global stream)", () => {
    const monthly = [
      month(2026, 1, [income(5000), expense(3000)]),
      month(2026, 2, [income(5000), expense(2000)]),
    ];
    expect(computeSavingsPool(ym(2026, 1), ym(2026, 2), monthly)).toBe(5000);
  });

  it("keeps investment spend as pool money (deployment, not consumption)", () => {
    const monthly = [
      month(2026, 1, [income(5000), { chargedAmount: -3000, categoryType: "investment" }]),
    ];
    expect(computeSavingsPool(ym(2026, 1), ym(2026, 1), monthly)).toBe(5000);
  });

  it("excludes months before the tracking-since month", () => {
    const monthly = [
      month(2025, 12, [income(9999)]),
      month(2026, 1, [income(1000)]),
      month(2026, 2, [income(2000)]),
    ];
    expect(computeSavingsPool(ym(2026, 1), ym(2026, 2), monthly)).toBe(3000);
  });

  it("can be negative when the window's net savings is negative", () => {
    const monthly = [month(2026, 1, [income(1000), expense(4000)])];
    expect(computeSavingsPool(ym(2026, 1), ym(2026, 1), monthly)).toBe(-3000);
  });
});

describe("distributeLadder — top-down fill and spill", () => {
  it("fills the top rung first, spilling the remainder to the next", () => {
    const dist = distributeLadder(
      1000,
      [goal({ id: "a", target: 600 }), goal({ id: "b", target: 600 })],
      now,
    );
    expect(dist.rungs.map((r) => r.fill)).toEqual([600, 400]);
  });

  it("never advances the same shekel to two goals (one shared stream)", () => {
    const dist = distributeLadder(
      1000,
      [goal({ id: "a", target: 600 }), goal({ id: "b", target: 600 })],
      now,
    );
    const totalFill = dist.rungs.reduce((s, r) => s + r.fill, 0);
    expect(totalFill).toBe(1000);
    expect(totalFill).toBeLessThanOrEqual(1000);
  });

  it("reduces a rung's claim by its opening (per-goal head start)", () => {
    const dist = distributeLadder(500, [goal({ id: "a", target: 1000, opening: 800 })], now);
    expect(dist.rungs[0].need).toBe(200);
    expect(dist.rungs[0].fill).toBe(200);
    expect(dist.rungs[0].current).toBe(1000);
    expect(dist.surplus).toBe(300);
  });
});

describe("distributeLadder — capped fill (never past 100%)", () => {
  it("caps a rung's current at its target and spills overflow to the next", () => {
    const dist = distributeLadder(
      1500,
      [goal({ id: "a", target: 1000 }), goal({ id: "b", target: 1000 })],
      now,
    );
    expect(dist.rungs[0].current).toBe(1000);
    expect(dist.rungs[0].fill).toBe(1000);
    expect(dist.rungs[1].fill).toBe(500);
    expect(dist.rungs[1].current).toBe(500);
  });

  it("never lets a rung's current exceed its target no matter how large the pool", () => {
    const dist = distributeLadder(1_000_000, [goal({ id: "a", target: 1000 })], now);
    expect(dist.rungs[0].current).toBe(1000);
    expect(dist.rungs[0].fill).toBe(1000);
  });

  it("reports unallocated surplus only once the pool exceeds all needs", () => {
    const under = distributeLadder(800, [goal({ id: "a", target: 1000 })], now);
    expect(under.surplus).toBe(0);

    const over = distributeLadder(1300, [goal({ id: "a", target: 1000 })], now);
    expect(over.surplus).toBe(300);
  });
});

describe("distributeLadder — one-goal ladder ≡ Pure Primary", () => {
  // Distinct per-month net savings so window boundaries are observable.
  const monthly = [
    month(2026, 1, [income(1000)]),
    month(2026, 2, [income(2000)]),
    month(2026, 3, [income(500)]),
    month(2026, 4, [income(500)]),
    month(2026, 5, [income(500)]),
    month(2026, 6, [income(500)]),
  ];
  const opening = 500;
  const start = ym(2026, 3);
  const current = ym(2026, 6);
  const only = (target: number): LadderGoal => ({
    id: "solo",
    opening,
    target,
    startMonth: start,
    targetMonth: null,
  });

  it("equals computeGoalProgress exactly when tracking-since = the goal's start month (under target)", () => {
    const pool = computeSavingsPool(start, current, monthly);
    const dist = distributeLadder(pool, [only(100_000)], current);
    const primary = computeGoalProgress(opening, start, current, monthly);

    expect(dist.rungs[0].current).toBe(primary.current);
    expect(dist.rungs[0].current).toBe(2500); // opening 500 + Net Savings Mar..Jun (2000)
  });

  it("diverges from Pure Primary by exactly the pre-start pool months when tracking-since ≠ start", () => {
    const trackingSince = ym(2026, 1); // two months earlier than the pace anchor
    const pool = computeSavingsPool(trackingSince, current, monthly);
    const dist = distributeLadder(pool, [only(100_000)], current);
    const primary = computeGoalProgress(opening, start, current, monthly);

    // The ladder's pool window (Jan..Jun) includes Jan+Feb (3000) that the
    // pace-anchored Pure Primary window (Mar..Jun) does not — the fill counts
    // pool months, while the start month is now only a pace anchor.
    expect(dist.rungs[0].current).toBe(5500);
    expect(dist.rungs[0].current - primary.current).toBe(3000);
  });
});

describe("distributeLadder — negative pool retreats bottom-first", () => {
  it("empties the bottom rung before the top as the pool shrinks", () => {
    const goals = [goal({ id: "a", target: 1000 }), goal({ id: "b", target: 1000 })];

    // Pool below the bottom rung's cumulative need: top full, bottom partial.
    expect(distributeLadder(1200, goals, now).rungs.map((r) => r.fill)).toEqual([1000, 200]);
    // Pool at the top rung's need: top full, bottom empty.
    expect(distributeLadder(1000, goals, now).rungs.map((r) => r.fill)).toEqual([1000, 0]);
    // Pool below the top rung's need: top partial, bottom empty.
    expect(distributeLadder(400, goals, now).rungs.map((r) => r.fill)).toEqual([400, 0]);
  });

  it("gives every rung zero fill when the pool is negative", () => {
    const goals = [goal({ id: "a", target: 1000 }), goal({ id: "b", target: 1000 })];
    const dist = distributeLadder(-500, goals, now);
    expect(dist.rungs.map((r) => r.fill)).toEqual([0, 0]);
    expect(dist.rungs.map((r) => r.current)).toEqual([0, 0]);
    expect(dist.surplus).toBe(0);
  });
});

describe("distributeLadder — reorder recomputes statelessly", () => {
  it("depends only on the given order, not on any stored attribution", () => {
    const a = goal({ id: "a", target: 600 });
    const b = goal({ id: "b", target: 600 });

    const abOrder = distributeLadder(1000, [a, b], now);
    expect(abOrder.rungs.find((r) => r.id === "a")!.fill).toBe(600);
    expect(abOrder.rungs.find((r) => r.id === "b")!.fill).toBe(400);

    const baOrder = distributeLadder(1000, [b, a], now);
    expect(baOrder.rungs.find((r) => r.id === "b")!.fill).toBe(600);
    expect(baOrder.rungs.find((r) => r.id === "a")!.fill).toBe(400);
  });
});

describe("distributeLadder — vacation scenario (fold arithmetic)", () => {
  it("leaves the rungs below unchanged when a completed goal is archived and its money spent", () => {
    const completed = goal({ id: "vac", target: 1000 });
    const below = goal({ id: "car", target: 5000 });

    // Before: completed goal fully funded, "car" gets the remainder.
    const before = distributeLadder(1500, [completed, below], now);
    expect(before.rungs.find((r) => r.id === "vac")!.fill).toBe(1000);
    expect(before.rungs.find((r) => r.id === "car")!.fill).toBe(500);

    // After archiving "vac" (out of the ladder) AND spending its ₪1000 (pool
    // drops by 1000): the only remaining rung sees exactly what it had.
    const after = distributeLadder(500, [below], now);
    expect(after.rungs.find((r) => r.id === "car")!.fill).toBe(500);
  });
});

describe("distributeLadder — pace verdict rides on ladder fill", () => {
  it("uses opening + fill as the current side of the pace comparison", () => {
    // A low rung starved by the pool reads behind-pace even while the top fills.
    const top = goal({ id: "top", target: 1000, targetMonth: ym(2026, 12) });
    const low = goal({ id: "low", target: 1000, targetMonth: ym(2026, 12) });
    const dist = distributeLadder(1000, [top, low], ym(2026, 6));

    expect(dist.rungs.find((r) => r.id === "top")!.paceVerdict).toBe("ahead-or-on-pace");
    expect(dist.rungs.find((r) => r.id === "low")!.paceVerdict).toBe("behind-pace");
  });

  it("is no-deadline for an open-ended rung regardless of fill", () => {
    const dist = distributeLadder(100, [goal({ id: "a", target: 1000, targetMonth: null })], now);
    expect(dist.rungs[0].paceVerdict).toBe("no-deadline");
  });
});
