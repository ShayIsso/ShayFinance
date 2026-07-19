import { describe, it, expect } from "vitest";
import {
  createGoalWithStore,
  updateGoalWithStore,
  deleteGoalWithStore,
  reorderGoalWithStore,
  archiveGoalWithStore,
  type GoalStore,
  type StoredGoal,
} from "../store";
import { InvalidGoalTargetMonthError } from "../errors";
import { computeSavingsPool, distributeLadder, type LadderDistribution } from "../ladder";
import { parseYearMonth, type MonthlyTransactions, type YearMonth } from "../progress";

/** In-memory GoalStore fake — never mocks Drizzle. */
function makeStore(seed: StoredGoal[] = [], initialTrackingSince: string | null = null) {
  const goals = seed.map((g) => ({ ...g }));
  let nextId = 1000;
  let trackingSince: string | null = initialTrackingSince;

  const store: GoalStore = {
    async listGoals() {
      return goals.map((g) => ({ ...g }));
    },
    async getById(id) {
      const found = goals.find((g) => g.id === id);
      return found ? { ...found } : null;
    },
    async insert(data) {
      const id = `new-${nextId++}`;
      goals.push({ id, archivedAt: null, ...data });
      return id;
    },
    async update(id, changes) {
      const row = goals.find((g) => g.id === id);
      if (row) Object.assign(row, changes);
    },
    async swapPriorities(first, second) {
      const a = goals.find((g) => g.id === first.id);
      const b = goals.find((g) => g.id === second.id);
      if (a) a.priority = first.priority;
      if (b) b.priority = second.priority;
    },
    async setArchivedAt(id, archivedAt) {
      const row = goals.find((g) => g.id === id);
      if (row) row.archivedAt = archivedAt ? archivedAt.toISOString() : null;
    },
    async remove(id) {
      const i = goals.findIndex((g) => g.id === id);
      if (i >= 0) goals.splice(i, 1);
    },
    async getTrackingSinceMonth() {
      return trackingSince;
    },
    async setTrackingSinceMonth(month) {
      trackingSince = month;
    },
  };

  return { store, goals, getTrackingSince: () => trackingSince };
}

const goal = (override: Partial<StoredGoal> & Pick<StoredGoal, "id" | "name">): StoredGoal => ({
  targetAmount: 12000,
  startMonth: "2026-01",
  openingAmount: 0,
  targetMonth: null,
  priority: 1,
  archivedAt: null,
  ...override,
});

describe("createGoalWithStore", () => {
  it("inserts a valid goal and returns its id", async () => {
    const { store, goals } = makeStore();
    const id = await createGoalWithStore(
      {
        name: "קרן חירום",
        targetAmount: 30000,
        startMonth: "2026-01",
        openingAmount: 5000,
        targetMonth: "2026-12",
      },
      store,
    );
    expect(goals.find((g) => g.id === id)).toBeTruthy();
  });

  it("allows an open-ended goal (no target month)", async () => {
    const { store, goals } = makeStore();
    const id = await createGoalWithStore(
      {
        name: "חופשה",
        targetAmount: 8000,
        startMonth: "2026-03",
        openingAmount: 0,
        targetMonth: null,
      },
      store,
    );
    expect(goals.find((g) => g.id === id)!.targetMonth).toBeNull();
  });

  it("rejects a target month before the start month", async () => {
    const { store, goals } = makeStore();
    await expect(
      createGoalWithStore(
        {
          name: "לא תקין",
          targetAmount: 1000,
          startMonth: "2026-06",
          openingAmount: 0,
          targetMonth: "2026-03",
        },
        store,
      ),
    ).rejects.toBeInstanceOf(InvalidGoalTargetMonthError);
    expect(goals).toHaveLength(0);
  });

  it("accepts a target month equal to the start month", async () => {
    const { store } = makeStore();
    await expect(
      createGoalWithStore(
        {
          name: "חודש בודד",
          targetAmount: 1000,
          startMonth: "2026-06",
          openingAmount: 0,
          targetMonth: "2026-06",
        },
        store,
      ),
    ).resolves.toBeTruthy();
  });
});

describe("updateGoalWithStore", () => {
  it("applies field changes through the store", async () => {
    const { store, goals } = makeStore([goal({ id: "g1", name: "ישן" })]);
    await updateGoalWithStore("g1", { name: "חדש", targetAmount: 20000 }, store);
    const row = goals.find((g) => g.id === "g1")!;
    expect(row.name).toBe("חדש");
    expect(row.targetAmount).toBe(20000);
  });

  it("clears the target month back to open-ended", async () => {
    const { store, goals } = makeStore([goal({ id: "g1", name: "יעד", targetMonth: "2026-12" })]);
    await updateGoalWithStore("g1", { targetMonth: null }, store);
    expect(goals.find((g) => g.id === "g1")!.targetMonth).toBeNull();
  });

  it("validates the invariant against the effective (stored) start month", async () => {
    const { store } = makeStore([goal({ id: "g1", name: "יעד", startMonth: "2026-06" })]);
    await expect(
      updateGoalWithStore("g1", { targetMonth: "2026-03" }, store),
    ).rejects.toBeInstanceOf(InvalidGoalTargetMonthError);
  });

  it("catches an invariant break when only the start month moves", async () => {
    const { store } = makeStore([
      goal({ id: "g1", name: "יעד", startMonth: "2026-01", targetMonth: "2026-05" }),
    ]);
    await expect(
      updateGoalWithStore("g1", { startMonth: "2026-09" }, store),
    ).rejects.toBeInstanceOf(InvalidGoalTargetMonthError);
  });

  it("is a no-op for an unknown id", async () => {
    const { store, goals } = makeStore();
    await updateGoalWithStore("missing", { name: "x" }, store);
    expect(goals).toHaveLength(0);
  });
});

describe("deleteGoalWithStore", () => {
  it("removes an existing goal", async () => {
    const { store, goals } = makeStore([goal({ id: "g1", name: "למחיקה" })]);
    await deleteGoalWithStore("g1", store);
    expect(goals.find((g) => g.id === "g1")).toBeUndefined();
  });

  it("is a no-op for an unknown id", async () => {
    const { store } = makeStore();
    await expect(deleteGoalWithStore("missing", store)).resolves.toBeUndefined();
  });
});

describe("createGoalWithStore priority assignment", () => {
  it("gives the first goal priority 1", async () => {
    const { store, goals } = makeStore();
    const id = await createGoalWithStore(
      {
        name: "ראשון",
        targetAmount: 1000,
        startMonth: "2026-01",
        openingAmount: 0,
        targetMonth: null,
      },
      store,
    );
    expect(goals.find((g) => g.id === id)!.priority).toBe(1);
  });

  it("appends each new goal to the bottom of the ladder (max priority + 1)", async () => {
    const { store, goals } = makeStore([
      goal({ id: "g1", name: "א", priority: 1 }),
      goal({ id: "g2", name: "ב", priority: 2 }),
    ]);
    const id = await createGoalWithStore(
      {
        name: "ג",
        targetAmount: 1000,
        startMonth: "2026-01",
        openingAmount: 0,
        targetMonth: null,
      },
      store,
    );
    expect(goals.find((g) => g.id === id)!.priority).toBe(3);
  });
});

describe("createGoalWithStore tracking-since seeding", () => {
  it("seeds tracking-since to the first goal's start month when unset", async () => {
    const { store, getTrackingSince } = makeStore();
    await createGoalWithStore(
      {
        name: "ראשון",
        targetAmount: 1000,
        startMonth: "2026-03",
        openingAmount: 0,
        targetMonth: null,
      },
      store,
    );
    expect(getTrackingSince()).toBe("2026-03");
  });

  it("does not overwrite an existing tracking-since when a later goal is added", async () => {
    const { store, getTrackingSince } = makeStore(
      [goal({ id: "g1", name: "קיים", startMonth: "2026-01" })],
      "2026-01",
    );
    await createGoalWithStore(
      {
        name: "מאוחר יותר",
        targetAmount: 1000,
        startMonth: "2026-08",
        openingAmount: 0,
        targetMonth: null,
      },
      store,
    );
    expect(getTrackingSince()).toBe("2026-01");
  });
});

describe("reorderGoalWithStore", () => {
  it("swaps priorities with the neighbour above when moving up", async () => {
    const { store, goals } = makeStore([
      goal({ id: "g1", name: "א", priority: 1 }),
      goal({ id: "g2", name: "ב", priority: 2 }),
    ]);
    await reorderGoalWithStore("g2", "up", store);
    expect(goals.find((g) => g.id === "g2")!.priority).toBe(1);
    expect(goals.find((g) => g.id === "g1")!.priority).toBe(2);
  });

  it("swaps priorities with the neighbour below when moving down", async () => {
    const { store, goals } = makeStore([
      goal({ id: "g1", name: "א", priority: 1 }),
      goal({ id: "g2", name: "ב", priority: 2 }),
    ]);
    await reorderGoalWithStore("g1", "down", store);
    expect(goals.find((g) => g.id === "g1")!.priority).toBe(2);
    expect(goals.find((g) => g.id === "g2")!.priority).toBe(1);
  });

  it("is a no-op at the top edge", async () => {
    const { store, goals } = makeStore([
      goal({ id: "g1", name: "א", priority: 1 }),
      goal({ id: "g2", name: "ב", priority: 2 }),
    ]);
    await reorderGoalWithStore("g1", "up", store);
    expect(goals.find((g) => g.id === "g1")!.priority).toBe(1);
    expect(goals.find((g) => g.id === "g2")!.priority).toBe(2);
  });

  it("skips archived goals when finding the neighbour", async () => {
    const { store, goals } = makeStore([
      goal({ id: "g1", name: "א", priority: 1 }),
      goal({ id: "arch", name: "בארכיון", priority: 2, archivedAt: "2026-05-01T00:00:00.000Z" }),
      goal({ id: "g3", name: "ג", priority: 3 }),
    ]);
    await reorderGoalWithStore("g3", "up", store);
    // g3 swaps with g1 (the active neighbour above), not the archived row.
    expect(goals.find((g) => g.id === "g3")!.priority).toBe(1);
    expect(goals.find((g) => g.id === "g1")!.priority).toBe(3);
  });
});

describe("archiveGoalWithStore", () => {
  it("stamps archivedAt, dropping the goal from the active ladder", async () => {
    const { store, goals } = makeStore([goal({ id: "g1", name: "הושלם" })]);
    await archiveGoalWithStore("g1", store);
    expect(goals.find((g) => g.id === "g1")!.archivedAt).not.toBeNull();
  });

  it("is a no-op for an unknown id", async () => {
    const { store } = makeStore();
    await expect(archiveGoalWithStore("missing", store)).resolves.toBeUndefined();
  });
});

describe("vacation scenario (end-to-end via the store-backed ladder)", () => {
  const income = (n: number): MonthlyTransactions["transactions"][number] => ({
    chargedAmount: n,
    categoryType: "income",
  });
  const expense = (n: number): MonthlyTransactions["transactions"][number] => ({
    chargedAmount: -n,
    categoryType: "expense",
  });
  const monthOf = (
    y: number,
    m: number,
    txns: MonthlyTransactions["transactions"],
  ): MonthlyTransactions => ({ month: { year: y, month: m }, transactions: txns });

  const trackingSince: YearMonth = { year: 2026, month: 1 };

  // Assembles the live ladder the way the module's getGoalLadder does: active
  // goals from the store (sorted by priority), the pool from the given months,
  // then the pure fold. Drives the real store + pure core, not a hand-built
  // after-state.
  async function buildLadder(
    store: GoalStore,
    monthly: MonthlyTransactions[],
    currentMonth: YearMonth,
  ): Promise<LadderDistribution> {
    const active = (await store.listGoals())
      .filter((g) => g.archivedAt == null)
      .sort((a, b) => a.priority - b.priority);
    const pool = computeSavingsPool(trackingSince, currentMonth, monthly);
    return distributeLadder(
      pool,
      active.map((g) => ({
        id: g.id,
        opening: g.openingAmount,
        target: g.targetAmount,
        startMonth: parseYearMonth(g.startMonth),
        targetMonth: g.targetMonth ? parseYearMonth(g.targetMonth) : null,
      })),
      currentMonth,
    );
  }

  it("archiving a completed goal plus an equal spend nets to zero for the rung below", async () => {
    const { store } = makeStore(
      [
        goal({ id: "vac", name: "חופשה", targetAmount: 1000, priority: 1 }),
        goal({ id: "car", name: "רכב", targetAmount: 5000, priority: 2 }),
      ],
      "2026-01",
    );

    // Month 1: ₪1500 saved. Vacation (top rung) fills to 1000; car gets 500.
    const beforeMonths = [monthOf(2026, 1, [income(1500)])];
    const before = await buildLadder(store, beforeMonths, { year: 2026, month: 1 });
    expect(before.rungs.find((r) => r.id === "vac")!.fill).toBe(1000);
    const carBefore = before.rungs.find((r) => r.id === "car")!.fill;
    expect(carBefore).toBe(500);

    // The user takes the vacation: archive it (real op) AND spend its ₪1000.
    await archiveGoalWithStore("vac", store);
    const afterMonths = [...beforeMonths, monthOf(2026, 2, [expense(1000)])];
    const after = await buildLadder(store, afterMonths, { year: 2026, month: 2 });

    // Vacation is off the ladder; the pool dropped by exactly its claim, so the
    // rung below is untouched.
    expect(after.rungs.some((r) => r.id === "vac")).toBe(false);
    expect(after.rungs.find((r) => r.id === "car")!.fill).toBe(carBefore);
  });
});
