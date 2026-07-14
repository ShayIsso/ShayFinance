import { db } from "@/db";
import { transactions, categoryRules } from "@/db/schema";
import { eq, or, isNull, inArray } from "drizzle-orm";
import { categorize, type CategoryRule } from "./rules";
import { canOverwrite, type CategorySource } from "@/lib/merchant-memory";

export type OverwritableTransaction = {
  id: string;
  description: string;
  categorySource: CategorySource | null;
};

export type RetroactiveStore = {
  getRuleById(ruleId: string): Promise<CategoryRule | null>;
  getOverwritableTransactions(): Promise<OverwritableTransaction[]>;
  categorizeTransactions(ids: string[], categoryId: string): Promise<number>;
};

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
      .where(or(isNull(transactions.categorySource), eq(transactions.categorySource, "ai")));
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
