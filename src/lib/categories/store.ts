/**
 * Store-backed hierarchy operations for the categories module. The pure
 * validators and read shapes live in `hierarchy.ts`; this file composes them
 * with a `CategoryStore` seam (Store pattern — prior art `retroactive.ts`) so
 * every write is guarded and every read shape is derived, testable against a
 * fake without a database.
 */
import { db } from "@/db";
import {
  transactions,
  categoryRules,
  merchantMemory,
  aiSuggestions,
  categories,
} from "@/db/schema";
import { and, eq, count } from "drizzle-orm";
import { DefaultCategoryDeletionError } from "./errors";
import {
  buildCategoryTree,
  emptyPopulation,
  filterAssignable,
  validateCategoryCreate,
  validateCategoryUpdate,
  type CategoryNode,
  type CategoryPopulation,
  type CategoryTreeNode,
  type CategoryType,
} from "./hierarchy";

export type StoredCategory = {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  isDefault: boolean;
  parentId: string | null;
};

export type CategoryWriteData = {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  parentId: string | null;
};

export type CategoryChanges = Partial<CategoryWriteData>;

export type CategoryStore = {
  listCategories(): Promise<StoredCategory[]>;
  getById(id: string): Promise<StoredCategory | null>;
  getPopulation(id: string): Promise<CategoryPopulation>;
  insert(data: CategoryWriteData): Promise<string>;
  update(id: string, changes: CategoryChanges): Promise<void>;
  detachChildren(parentId: string): Promise<void>;
  remove(id: string): Promise<void>;
};

function toNode(c: StoredCategory): CategoryNode {
  return { id: c.id, name: c.name, type: c.type, parentId: c.parentId };
}

function validatorSubset(changes: CategoryChanges): Partial<{
  name: string;
  type: CategoryType;
  parentId: string | null;
}> {
  const subset: Partial<{ name: string; type: CategoryType; parentId: string | null }> = {};
  if (changes.name !== undefined) subset.name = changes.name;
  if (changes.type !== undefined) subset.type = changes.type;
  if ("parentId" in changes) subset.parentId = changes.parentId ?? null;
  return subset;
}

export async function createCategoryWithStore(
  data: CategoryWriteData,
  store: CategoryStore,
): Promise<string> {
  const nodes = (await store.listCategories()).map(toNode);
  const parentPopulation = data.parentId ? await store.getPopulation(data.parentId) : null;
  validateCategoryCreate(
    { name: data.name, type: data.type, parentId: data.parentId },
    nodes,
    parentPopulation,
  );
  return store.insert(data);
}

export async function updateCategoryWithStore(
  id: string,
  changes: CategoryChanges,
  store: CategoryStore,
): Promise<void> {
  const current = await store.getById(id);
  if (!current) return;

  const nodes = (await store.listCategories()).map(toNode);
  const subset = validatorSubset(changes);
  const parentPopulation =
    subset.parentId != null ? await store.getPopulation(subset.parentId) : null;

  validateCategoryUpdate(toNode(current), subset, nodes, parentPopulation);
  await store.update(id, changes);
}

export async function deleteCategoryWithStore(id: string, store: CategoryStore): Promise<void> {
  const current = await store.getById(id);
  if (!current) return;
  if (current.isDefault) throw new DefaultCategoryDeletionError();

  await store.detachChildren(id);
  await store.remove(id);
}

export async function getCategoryTreeWithStore(
  store: CategoryStore,
): Promise<CategoryTreeNode<StoredCategory>[]> {
  return buildCategoryTree(await store.listCategories());
}

export async function getAssignableCategoriesWithStore(
  store: CategoryStore,
): Promise<StoredCategory[]> {
  return filterAssignable(await store.listCategories());
}

async function countWhere(
  table: typeof transactions | typeof categoryRules | typeof merchantMemory,
  column:
    | typeof transactions.categoryId
    | typeof categoryRules.categoryId
    | typeof merchantMemory.categoryId,
  categoryId: string,
): Promise<number> {
  const [row] = await db.select({ n: count() }).from(table).where(eq(column, categoryId));
  return row?.n ?? 0;
}

const categoryColumns = {
  id: categories.id,
  name: categories.name,
  type: categories.type,
  icon: categories.icon,
  color: categories.color,
  isDefault: categories.isDefault,
  parentId: categories.parentId,
};

export const drizzleCategoryStore: CategoryStore = {
  async listCategories() {
    return db.select(categoryColumns).from(categories).orderBy(categories.name);
  },

  async getById(id) {
    const [row] = await db.select(categoryColumns).from(categories).where(eq(categories.id, id));
    return row ?? null;
  },

  async getPopulation(id) {
    const [txnCount, ruleCount, memoryCount, pendingRow] = await Promise.all([
      countWhere(transactions, transactions.categoryId, id),
      countWhere(categoryRules, categoryRules.categoryId, id),
      countWhere(merchantMemory, merchantMemory.categoryId, id),
      db
        .select({ n: count() })
        .from(aiSuggestions)
        .where(and(eq(aiSuggestions.categoryId, id), eq(aiSuggestions.status, "pending_review"))),
    ]);
    return {
      ...emptyPopulation(),
      transactions: txnCount,
      rules: ruleCount,
      memoryEntries: memoryCount,
      pendingSuggestions: pendingRow[0]?.n ?? 0,
      // budgets: the budgets table lands in BGR2; 0 until it exists, then this
      // wiring extends to count budgets on the category.
    };
  },

  async insert(data) {
    const [row] = await db
      .insert(categories)
      .values({
        name: data.name,
        type: data.type,
        icon: data.icon,
        color: data.color,
        parentId: data.parentId,
        isDefault: false,
      })
      .returning({ id: categories.id });
    return row.id;
  },

  async update(id, changes) {
    await db.update(categories).set(changes).where(eq(categories.id, id));
  },

  async detachChildren(parentId) {
    await db.update(categories).set({ parentId: null }).where(eq(categories.parentId, parentId));
  },

  async remove(id) {
    await db.delete(categories).where(eq(categories.id, id));
  },
};
