/**
 * Store-backed CRUD for the budgets module (Store pattern — prior art
 * `categories/store.ts`, `goals/store.ts`). Two write invariants are enforced
 * here, over a `BudgetStore` seam, so every write is guarded and testable
 * against an in-memory fake without a database:
 *
 *  - a budget attaches only to an `expense`-type category (decision record
 *    #105 §10) — the type is not encoded in the `budgets` table, so the store
 *    reads it from the category;
 *  - one budget per category (decision record #105 §1) — the DB
 *    `uq_budget_category` unique index is the backstop; this pre-check turns a
 *    race-free duplicate into a typed error instead of a constraint violation.
 *
 * A budget's category is fixed at creation; only `monthly_limit` is mutable
 * (re-pointing a budget is a delete + create, not an update).
 */
import { db } from "@/db";
import { budgets, categories } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DuplicateBudgetCategoryError, NonExpenseBudgetCategoryError } from "./errors";

type CategoryType = "income" | "expense" | "investment" | "transfer" | "ignore";

export type StoredBudget = {
  id: string;
  categoryId: string;
  monthlyLimit: number;
};

export type BudgetWriteData = {
  categoryId: string;
  monthlyLimit: number;
};

export type BudgetChanges = { monthlyLimit: number };

export type BudgetStore = {
  listBudgets(): Promise<StoredBudget[]>;
  getById(id: string): Promise<StoredBudget | null>;
  getByCategoryId(categoryId: string): Promise<StoredBudget | null>;
  /** The category's type, or null when no such category exists. */
  getCategoryType(categoryId: string): Promise<CategoryType | null>;
  insert(data: BudgetWriteData): Promise<string>;
  update(id: string, changes: BudgetChanges): Promise<void>;
  remove(id: string): Promise<void>;
};

async function assertExpenseCategory(categoryId: string, store: BudgetStore): Promise<void> {
  // A missing category cannot be confirmed as expense-type, so it fails the
  // same gate — the FK would reject the insert regardless.
  const type = await store.getCategoryType(categoryId);
  if (type !== "expense") throw new NonExpenseBudgetCategoryError();
}

export async function createBudgetWithStore(
  data: BudgetWriteData,
  store: BudgetStore,
): Promise<string> {
  await assertExpenseCategory(data.categoryId, store);
  if (await store.getByCategoryId(data.categoryId)) {
    throw new DuplicateBudgetCategoryError();
  }
  return store.insert(data);
}

export async function updateBudgetWithStore(
  id: string,
  changes: BudgetChanges,
  store: BudgetStore,
): Promise<void> {
  const current = await store.getById(id);
  if (!current) return;
  await store.update(id, changes);
}

export async function deleteBudgetWithStore(id: string, store: BudgetStore): Promise<void> {
  const current = await store.getById(id);
  if (!current) return;
  await store.remove(id);
}

const budgetColumns = {
  id: budgets.id,
  categoryId: budgets.categoryId,
  monthlyLimit: budgets.monthlyLimit,
};

function toStoredBudget(row: {
  id: string;
  categoryId: string;
  monthlyLimit: string;
}): StoredBudget {
  return {
    id: row.id,
    categoryId: row.categoryId,
    monthlyLimit: Number(row.monthlyLimit),
  };
}

export const drizzleBudgetStore: BudgetStore = {
  async listBudgets() {
    const rows = await db.select(budgetColumns).from(budgets).orderBy(budgets.createdAt);
    return rows.map(toStoredBudget);
  },

  async getById(id) {
    const [row] = await db.select(budgetColumns).from(budgets).where(eq(budgets.id, id));
    return row ? toStoredBudget(row) : null;
  },

  async getByCategoryId(categoryId) {
    const [row] = await db
      .select(budgetColumns)
      .from(budgets)
      .where(eq(budgets.categoryId, categoryId));
    return row ? toStoredBudget(row) : null;
  },

  async getCategoryType(categoryId) {
    const [row] = await db
      .select({ type: categories.type })
      .from(categories)
      .where(eq(categories.id, categoryId));
    return row?.type ?? null;
  },

  async insert(data) {
    const [row] = await db
      .insert(budgets)
      .values({
        categoryId: data.categoryId,
        monthlyLimit: String(data.monthlyLimit),
      })
      .returning({ id: budgets.id });
    return row.id;
  },

  async update(id, changes) {
    await db
      .update(budgets)
      .set({ monthlyLimit: String(changes.monthlyLimit), updatedAt: new Date() })
      .where(eq(budgets.id, id));
  },

  async remove(id) {
    await db.delete(budgets).where(eq(budgets.id, id));
  },
};
