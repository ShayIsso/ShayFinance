import { db } from "@/db";
import { transactions, categoryRules, categories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { categorize, type CategoryRule } from "./rules";
import { canOverwrite, overwriteLawSql, type CategorySource } from "@/lib/merchant-memory";
import { NotAssignableCategoryError } from "./errors";

export type OverwritableTransaction = {
  id: string;
  description: string;
  categorySource: CategorySource | null;
};

/**
 * The one extra read a retroactive apply needs (ADR-0011 §3): whether the
 * rule's target category has children. A legacy or out-of-band rule could
 * still name a group — this is the same guard createRule/updateRule apply at
 * write time, re-checked here because a rule row can outlive the category's
 * shape.
 */
export type RetroactiveStore = {
  getRuleById(ruleId: string): Promise<CategoryRule | null>;
  getOverwritableTransactions(): Promise<OverwritableTransaction[]>;
  categorizeTransactions(ids: string[], categoryId: string): Promise<number>;
  categoryHasChildren(categoryId: string): Promise<boolean>;
};

/**
 * A group is never assignable (ADR-0011 §3) — guards a retroactive apply so a
 * rule row targeting a group (e.g. authored before the category gained
 * children) can never stamp that group onto transactions.
 */
async function assertAssignableCategory(
  categoryId: string,
  store: Pick<RetroactiveStore, "categoryHasChildren">,
): Promise<void> {
  if (await store.categoryHasChildren(categoryId)) {
    throw new NotAssignableCategoryError();
  }
}

/**
 * Transactions a new rule may claim: it matches the rule AND the row is
 * overwritable under the single overwrite law (NULL or 'ai' — ADR-0010 §3).
 * user/rule/memory rows are never touched by automation.
 */
export function findOverwritableMatches(
  rule: CategoryRule,
  txns: OverwritableTransaction[],
): OverwritableTransaction[] {
  return txns.filter(
    (t) => canOverwrite(t.categorySource) && categorize(t.description, [rule]) !== null,
  );
}

export async function previewRetroactiveApply(
  ruleId: string,
  store: RetroactiveStore,
): Promise<{ count: number }> {
  const rule = await store.getRuleById(ruleId);
  if (!rule) return { count: 0 };
  const txns = await store.getOverwritableTransactions();
  const matches = findOverwritableMatches(rule, txns);
  return { count: matches.length };
}

export async function applyRetroactively(
  ruleId: string,
  store: RetroactiveStore,
): Promise<{ applied: number }> {
  const rule = await store.getRuleById(ruleId);
  if (!rule) return { applied: 0 };
  await assertAssignableCategory(rule.categoryId, store);
  const txns = await store.getOverwritableTransactions();
  const matches = findOverwritableMatches(rule, txns);
  if (matches.length === 0) return { applied: 0 };
  const applied = await store.categorizeTransactions(
    matches.map((t) => t.id),
    rule.categoryId,
  );
  return { applied };
}

export const drizzleRetroactiveStore: RetroactiveStore = {
  async getRuleById(ruleId: string): Promise<CategoryRule | null> {
    const rows = await db.select().from(categoryRules).where(eq(categoryRules.id, ruleId));
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      categoryId: rows[0].categoryId,
      matchType: rows[0].matchType,
      pattern: rows[0].pattern,
      priority: rows[0].priority,
    };
  },

  async getOverwritableTransactions(): Promise<OverwritableTransaction[]> {
    return db
      .select({
        id: transactions.id,
        description: transactions.description,
        categorySource: transactions.categorySource,
      })
      .from(transactions)
      .where(overwriteLawSql());
  },

  async categoryHasChildren(categoryId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, categoryId))
      .limit(1);
    return row !== undefined;
  },

  async categorizeTransactions(ids: string[], categoryId: string): Promise<number> {
    // A rule claiming a row sets provenance to 'rule'.
    await db
      .update(transactions)
      .set({ categoryId, categorySource: "rule" })
      .where(inArray(transactions.id, ids));
    return ids.length;
  },
};
