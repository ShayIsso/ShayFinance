import {
  createCategoryWithStore,
  updateCategoryWithStore,
  deleteCategoryWithStore,
  getCategoryTreeWithStore,
  getAssignableCategoriesWithStore,
  drizzleCategoryStore,
  type CategoryChanges,
} from "./store";
import { filterAssignable, buildGroupLeafIndex } from "./hierarchy";
import type { CategoryTreeNode } from "./hierarchy";
import { db } from "@/db";
import { categories } from "@/db/schema";

export { DefaultCategoryDeletionError, NotAssignableCategoryError } from "./errors";
export { matchesRule, type MatchType } from "./rules";
export { filterAssignable };
export type { CategoryTreeNode } from "./hierarchy";
export type { StoredCategory } from "./store";

export type Category = {
  id: string;
  name: string;
  type: "income" | "expense" | "investment" | "transfer" | "ignore";
  icon: string;
  color: string;
  isDefault: boolean;
  parentId: string | null;
};

export async function getCategories(): Promise<Category[]> {
  return db.select().from(categories).orderBy(categories.name);
}

/**
 * Tree read surface (ADR-0011): groups with their leaves nested beneath, root
 * leaves alongside. Consumed by grouping-aware surfaces from BGR3 on.
 */
export async function getCategoryTree(): Promise<CategoryTreeNode<Category>[]> {
  return getCategoryTreeWithStore(drizzleCategoryStore);
}

/**
 * Assignable feed (ADR-0011 §3): childless categories only. The single source
 * every assignment surface (picker, rules, memory, AI answers) switches to in
 * BGR3 — a group is never assignable.
 */
export async function getAssignableCategories(): Promise<Category[]> {
  return getAssignableCategoriesWithStore(drizzleCategoryStore);
}

/**
 * Group → leaf-ids index for subtree filtering (#174, ADR-0011 aggregation
 * lens). Consumed by the transactions filter/CSV export to expand a selected
 * group into its assignable leaves.
 */
export async function getGroupLeafIndex(): Promise<Map<string, string[]>> {
  const all = await db
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories);
  return buildGroupLeafIndex(all);
}

export async function createCategory(data: {
  name: string;
  type: "income" | "expense" | "investment" | "transfer" | "ignore";
  icon: string;
  color: string;
  parentId?: string | null;
}): Promise<string> {
  return createCategoryWithStore(
    { ...data, parentId: data.parentId ?? null },
    drizzleCategoryStore,
  );
}

export async function updateCategory(id: string, changes: CategoryChanges): Promise<void> {
  await updateCategoryWithStore(id, changes, drizzleCategoryStore);
}

export async function deleteCategory(id: string): Promise<void> {
  await deleteCategoryWithStore(id, drizzleCategoryStore);
}
