/**
 * Store-backed CRUD for the goals module (Store pattern — prior art
 * `categories/store.ts`). The temporal invariant (target month ≥ start month)
 * is enforced here, over the *effective* start/target — an update supplies only
 * changed fields, so the current row fills the gaps. Ladder ordering
 * (`priority`) and archival (`archivedAt`) also live here: a new goal appends to
 * the bottom of the ladder, reorder swaps adjacent priorities, and archiving
 * releases a goal's ladder claim (CONTEXT.md "goal ladder"). Every write is
 * guarded and testable against an in-memory fake without a database.
 */
import { db } from "@/db";
import { savingsGoals, goalsSettings } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { InvalidGoalTargetMonthError } from "./errors";
import { monthsBetween, parseYearMonth } from "./progress";

export type StoredGoal = {
  id: string;
  name: string;
  targetAmount: number;
  startMonth: string;
  openingAmount: number;
  targetMonth: string | null;
  priority: number;
  /** ISO timestamp; null = active (on the ladder). */
  archivedAt: string | null;
};

export type GoalWriteData = {
  name: string;
  targetAmount: number;
  startMonth: string;
  openingAmount: number;
  targetMonth: string | null;
};

export type GoalChanges = Partial<GoalWriteData>;

/** A goal id paired with the priority to assign it. */
export type PriorityAssignment = { id: string; priority: number };

export type GoalStore = {
  listGoals(): Promise<StoredGoal[]>;
  getById(id: string): Promise<StoredGoal | null>;
  insert(data: GoalWriteData & { priority: number }): Promise<string>;
  update(id: string, changes: GoalChanges): Promise<void>;
  /**
   * Reassigns two goals' priorities atomically. Both writes must land together —
   * a partial swap would leave both rungs on one priority, making `listGoals`
   * tie-order nondeterministic (there is no unique constraint on `priority`).
   */
  swapPriorities(first: PriorityAssignment, second: PriorityAssignment): Promise<void>;
  setArchivedAt(id: string, archivedAt: Date | null): Promise<void>;
  remove(id: string): Promise<void>;
  getTrackingSinceMonth(): Promise<string | null>;
  setTrackingSinceMonth(month: string | null): Promise<void>;
};

function assertTargetNotBeforeStart(startMonth: string, targetMonth: string | null): void {
  if (targetMonth == null) return;
  if (monthsBetween(parseYearMonth(startMonth), parseYearMonth(targetMonth)) < 0) {
    throw new InvalidGoalTargetMonthError();
  }
}

export async function createGoalWithStore(data: GoalWriteData, store: GoalStore): Promise<string> {
  assertTargetNotBeforeStart(data.startMonth, data.targetMonth);
  const goals = await store.listGoals();
  const maxPriority = goals.reduce((max, g) => Math.max(max, g.priority), 0);
  const id = await store.insert({ ...data, priority: maxPriority + 1 });

  // First-goal convenience: seed the pool baseline to this goal's start month
  // when the user has not set one yet (CONTEXT.md "savings pool"). A deliberate
  // default-on-first-write routed through the store seam — never a render-time
  // inference; the user can edit it afterwards. Existing baselines are left be.
  const trackingSince = await store.getTrackingSinceMonth();
  if (trackingSince == null) {
    await store.setTrackingSinceMonth(data.startMonth);
  }

  return id;
}

export async function updateGoalWithStore(
  id: string,
  changes: GoalChanges,
  store: GoalStore,
): Promise<void> {
  const current = await store.getById(id);
  if (!current) return;

  const startMonth = changes.startMonth ?? current.startMonth;
  const targetMonth =
    "targetMonth" in changes ? (changes.targetMonth ?? null) : current.targetMonth;
  assertTargetNotBeforeStart(startMonth, targetMonth);

  await store.update(id, changes);
}

export async function deleteGoalWithStore(id: string, store: GoalStore): Promise<void> {
  const current = await store.getById(id);
  if (!current) return;
  await store.remove(id);
}

/**
 * Swaps a goal's ladder rank with its active neighbour in `direction`. Reorder
 * acts only within the active ladder — archived goals are not rungs — and is a
 * no-op at the ends or for an unknown/archived id.
 */
export async function reorderGoalWithStore(
  id: string,
  direction: "up" | "down",
  store: GoalStore,
): Promise<void> {
  const active = (await store.listGoals())
    .filter((g) => g.archivedAt == null)
    .sort((a, b) => a.priority - b.priority);

  const index = active.findIndex((g) => g.id === id);
  if (index < 0) return;

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= active.length) return;

  const current = active[index];
  const neighbour = active[swapIndex];
  await store.swapPriorities(
    { id: current.id, priority: neighbour.priority },
    { id: neighbour.id, priority: current.priority },
  );
}

/** Archives a goal, releasing its ladder claim (CONTEXT.md "goal ladder"). */
export async function archiveGoalWithStore(id: string, store: GoalStore): Promise<void> {
  const current = await store.getById(id);
  if (!current) return;
  await store.setArchivedAt(id, new Date());
}

const goalColumns = {
  id: savingsGoals.id,
  name: savingsGoals.name,
  targetAmount: savingsGoals.targetAmount,
  startMonth: savingsGoals.startMonth,
  openingAmount: savingsGoals.openingAmount,
  targetMonth: savingsGoals.targetMonth,
  priority: savingsGoals.priority,
  archivedAt: savingsGoals.archivedAt,
};

function toStoredGoal(row: {
  id: string;
  name: string;
  targetAmount: string;
  startMonth: string;
  openingAmount: string;
  targetMonth: string | null;
  priority: number;
  archivedAt: Date | null;
}): StoredGoal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: Number(row.targetAmount),
    startMonth: row.startMonth,
    openingAmount: Number(row.openingAmount),
    targetMonth: row.targetMonth,
    priority: row.priority,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

export const drizzleGoalStore: GoalStore = {
  async listGoals() {
    const rows = await db
      .select(goalColumns)
      .from(savingsGoals)
      .orderBy(asc(savingsGoals.priority));
    return rows.map(toStoredGoal);
  },

  async getById(id) {
    const [row] = await db.select(goalColumns).from(savingsGoals).where(eq(savingsGoals.id, id));
    return row ? toStoredGoal(row) : null;
  },

  async insert(data) {
    const [row] = await db
      .insert(savingsGoals)
      .values({
        name: data.name,
        targetAmount: String(data.targetAmount),
        startMonth: data.startMonth,
        openingAmount: String(data.openingAmount),
        targetMonth: data.targetMonth,
        priority: data.priority,
      })
      .returning({ id: savingsGoals.id });
    return row.id;
  },

  async update(id, changes) {
    const values: Partial<typeof savingsGoals.$inferInsert> = {};
    if (changes.name !== undefined) values.name = changes.name;
    if (changes.targetAmount !== undefined) values.targetAmount = String(changes.targetAmount);
    if (changes.startMonth !== undefined) values.startMonth = changes.startMonth;
    if (changes.openingAmount !== undefined) values.openingAmount = String(changes.openingAmount);
    if ("targetMonth" in changes) values.targetMonth = changes.targetMonth ?? null;
    values.updatedAt = new Date();
    await db.update(savingsGoals).set(values).where(eq(savingsGoals.id, id));
  },

  async swapPriorities(first, second) {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(savingsGoals)
        .set({ priority: first.priority, updatedAt: now })
        .where(eq(savingsGoals.id, first.id));
      await tx
        .update(savingsGoals)
        .set({ priority: second.priority, updatedAt: now })
        .where(eq(savingsGoals.id, second.id));
    });
  },

  async setArchivedAt(id, archivedAt) {
    await db
      .update(savingsGoals)
      .set({ archivedAt, updatedAt: new Date() })
      .where(eq(savingsGoals.id, id));
  },

  async remove(id) {
    await db.delete(savingsGoals).where(eq(savingsGoals.id, id));
  },

  async getTrackingSinceMonth() {
    const [row] = await db
      .select({ trackingSinceMonth: goalsSettings.trackingSinceMonth })
      .from(goalsSettings)
      .where(eq(goalsSettings.id, 1));
    return row?.trackingSinceMonth ?? null;
  },

  async setTrackingSinceMonth(month) {
    await db
      .insert(goalsSettings)
      .values({ id: 1, trackingSinceMonth: month })
      .onConflictDoUpdate({
        target: goalsSettings.id,
        set: { trackingSinceMonth: month, updatedAt: new Date() },
      });
  },
};
