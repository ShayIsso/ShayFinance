import { db } from "@/db";
import { categoryRules } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export type CategoryRule = {
  id: string;
  categoryId: string;
  matchType: "contains" | "starts_with" | "exact" | "regex";
  pattern: string;
  priority: number;
};

// Pure function — testable without DB
export function categorize(description: string, rules: CategoryRule[]): string | null {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  const lower = description.toLowerCase();

  for (const rule of sorted) {
    const pattern = rule.pattern.toLowerCase();
    let matched = false;

    switch (rule.matchType) {
      case "contains":
        matched = lower.includes(pattern);
        break;
      case "starts_with":
        matched = lower.startsWith(pattern);
        break;
      case "exact":
        matched = lower === pattern;
        break;
      case "regex":
        matched = new RegExp(rule.pattern, "i").test(description);
        break;
    }

    if (matched) return rule.categoryId;
  }

  return null;
}

// DB-backed wrapper
export async function categorizeTransaction(description: string): Promise<string | null> {
  const rules = await getRules();
  return categorize(description, rules);
}

export function suggestRule(description: string, categoryId: string): Omit<CategoryRule, "id"> {
  return {
    categoryId,
    matchType: "contains",
    pattern: description,
    priority: 0,
  };
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

export async function createRule(data: {
  categoryId: string;
  matchType: "contains" | "starts_with" | "exact" | "regex";
  pattern: string;
  priority: number;
}): Promise<string> {
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
): Promise<void> {
  await db.update(categoryRules).set(changes).where(eq(categoryRules.id, id));
}

export async function deleteRule(id: string): Promise<void> {
  await db.delete(categoryRules).where(eq(categoryRules.id, id));
}
