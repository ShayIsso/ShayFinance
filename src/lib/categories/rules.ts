import { db } from "@/db";
import { categoryRules, categories } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { NotAssignableCategoryError } from "./errors";

export type MatchType = "contains" | "starts_with" | "exact" | "regex";

/**
 * The one extra read a rule write needs (ADR-0011 §3): whether a category has
 * children. Kept minimal rather than pulling in the full CategoryStore — rules
 * only ever need this one fact about the target category.
 */
export type RuleCategoryStore = {
  categoryHasChildren(categoryId: string): Promise<boolean>;
};

export const drizzleRuleCategoryStore: RuleCategoryStore = {
  async categoryHasChildren(categoryId) {
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, categoryId))
      .limit(1);
    return row !== undefined;
  },
};

/**
 * A group is never assignable (ADR-0011 §3) — guards every rule write so a
 * request cannot smuggle a group's id past the picker UI.
 */
export async function assertAssignableCategory(
  categoryId: string,
  store: RuleCategoryStore,
): Promise<void> {
  if (await store.categoryHasChildren(categoryId)) {
    throw new NotAssignableCategoryError();
  }
}

export type CategoryRule = {
  id: string;
  categoryId: string;
  matchType: MatchType;
  pattern: string;
  priority: number;
};

// Pure function — testable without DB. The single source of rule-match
// semantics: any replay of rules (e.g. the taxonomy migration planner) must
// import this rather than reimplement it.
export function matchesRule(matchType: MatchType, pattern: string, description: string): boolean {
  const lower = description.toLowerCase();
  const pat = pattern.toLowerCase();

  switch (matchType) {
    case "contains":
      return lower.includes(pat);
    case "starts_with":
      return lower.startsWith(pat);
    case "exact":
      return lower === pat;
    case "regex":
      return new RegExp(pattern, "i").test(description);
  }
}

// Pure function — testable without DB
export function categorize(description: string, rules: CategoryRule[]): string | null {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);

  for (const rule of sorted) {
    if (matchesRule(rule.matchType, rule.pattern, description)) return rule.categoryId;
  }

  return null;
}

// DB-backed wrapper
export async function categorizeTransaction(description: string): Promise<string | null> {
  const rules = await getRules();
  return categorize(description, rules);
}

// CRUD
export async function getRules(): Promise<CategoryRule[]> {
  const rows = await db.select().from(categoryRules).orderBy(desc(categoryRules.priority));
  return rows.map((r) => ({
    id: r.id,
    categoryId: r.categoryId,
    matchType: r.matchType,
    pattern: r.pattern,
    priority: r.priority,
  }));
}

export async function createRule(
  data: {
    categoryId: string;
    matchType: "contains" | "starts_with" | "exact" | "regex";
    pattern: string;
    priority: number;
  },
  store: RuleCategoryStore = drizzleRuleCategoryStore,
): Promise<string> {
  await assertAssignableCategory(data.categoryId, store);
  const [row] = await db.insert(categoryRules).values(data).returning({ id: categoryRules.id });
  return row.id;
}

export async function updateRule(
  id: string,
  changes: Partial<{
    categoryId: string;
    matchType: "contains" | "starts_with" | "exact" | "regex";
    pattern: string;
    priority: number;
  }>,
  store: RuleCategoryStore = drizzleRuleCategoryStore,
): Promise<void> {
  if (changes.categoryId !== undefined) {
    await assertAssignableCategory(changes.categoryId, store);
  }
  await db.update(categoryRules).set(changes).where(eq(categoryRules.id, id));
}

export async function deleteRule(id: string): Promise<void> {
  await db.delete(categoryRules).where(eq(categoryRules.id, id));
}
