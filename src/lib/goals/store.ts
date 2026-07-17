/**
 * Store-backed CRUD for the goals module (Store pattern — prior art
 * `categories/store.ts`). The temporal invariant (target month ≥ start month)
 * is enforced here, over the *effective* start/target — an update supplies only
 * changed fields, so the current row fills the gaps. This keeps every write
 * guarded and testable against an in-memory fake without a database.
 */
import { db } from "@/db";
import { savingsGoals } from "@/db/schema";
import { eq } from "drizzle-orm";
import { InvalidGoalTargetMonthError } from "./errors";
import { monthsBetween, parseYearMonth } from "./progress";

export type StoredGoal = {
  id: string;
  name: string;
  targetAmount: number;
  startMonth: string;
  openingAmount: number;
  targetMonth: string | null;
};

export type GoalWriteData = {
  name: string;
  targetAmount: number;
  startMonth: string;
  openingAmount: number;
  targetMonth: string | null;
};

export type GoalChanges = Partial<GoalWriteData>;

export type GoalStore = {
  listGoals(): Promise<StoredGoal[]>;
  getById(id: string): Promise<StoredGoal | null>;
  insert(data: GoalWriteData): Promise<string>;
  update(id: string, changes: GoalChanges): Promise<void>;
  remove(id: string): Promise<void>;
};

function assertTargetNotBeforeStart(startMonth: string, targetMonth: string | null): void {
  if (targetMonth == null) return;
  if (monthsBetween(parseYearMonth(startMonth), parseYearMonth(targetMonth)) < 0) {
    throw new InvalidGoalTargetMonthError();
  }
}

export async function createGoalWithStore(data: GoalWriteData, store: GoalStore): Promise<string> {
  assertTargetNotBeforeStart(data.startMonth, data.targetMonth);
  return store.insert(data);
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

const goalColumns = {
  id: savingsGoals.id,
  name: savingsGoals.name,
  targetAmount: savingsGoals.targetAmount,
  startMonth: savingsGoals.startMonth,
  openingAmount: savingsGoals.openingAmount,
  targetMonth: savingsGoals.targetMonth,
};

function toStoredGoal(row: {
  id: string;
  name: string;
  targetAmount: string;
  startMonth: string;
  openingAmount: string;
  targetMonth: string | null;
}): StoredGoal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: Number(row.targetAmount),
    startMonth: row.startMonth,
    openingAmount: Number(row.openingAmount),
    targetMonth: row.targetMonth,
  };
}

export const drizzleGoalStore: GoalStore = {
  async listGoals() {
    const rows = await db.select(goalColumns).from(savingsGoals).orderBy(savingsGoals.createdAt);
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
      })
      .returning({ id: savingsGoals.id });
    return row.id;
  },

  async update(id, changes) {
    const values: Record<string, unknown> = {};
    if (changes.name !== undefined) values.name = changes.name;
    if (changes.targetAmount !== undefined) values.targetAmount = String(changes.targetAmount);
    if (changes.startMonth !== undefined) values.startMonth = changes.startMonth;
    if (changes.openingAmount !== undefined) values.openingAmount = String(changes.openingAmount);
    if ("targetMonth" in changes) values.targetMonth = changes.targetMonth ?? null;
    values.updatedAt = new Date();
    await db.update(savingsGoals).set(values).where(eq(savingsGoals.id, id));
  },

  async remove(id) {
    await db.delete(savingsGoals).where(eq(savingsGoals.id, id));
  },
};
