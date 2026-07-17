import { describe, it, expect } from "vitest";
import {
  createGoalWithStore,
  updateGoalWithStore,
  deleteGoalWithStore,
  type GoalStore,
  type StoredGoal,
} from "../store";
import { InvalidGoalTargetMonthError } from "../errors";

/** In-memory GoalStore fake — never mocks Drizzle. */
function makeStore(seed: StoredGoal[] = []) {
  const goals = seed.map((g) => ({ ...g }));
  let nextId = 1000;

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
      goals.push({ id, ...data });
      return id;
    },
    async update(id, changes) {
      const row = goals.find((g) => g.id === id);
      if (row) Object.assign(row, changes);
    },
    async remove(id) {
      const i = goals.findIndex((g) => g.id === id);
      if (i >= 0) goals.splice(i, 1);
    },
  };

  return { store, goals };
}

const goal = (override: Partial<StoredGoal> & Pick<StoredGoal, "id" | "name">): StoredGoal => ({
  targetAmount: 12000,
  startMonth: "2026-01",
  openingAmount: 0,
  targetMonth: null,
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
