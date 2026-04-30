import { db } from "@/db";
import { transactions, categoryRules } from "@/db/schema";
import { eq, isNull, inArray } from "drizzle-orm";
import { categorize, type CategoryRule } from "./rules";

export type UncategorizedTransaction = {
  id: string;
  description: string;
  categoryId: string | null;
};

export type RetroactiveStore = {
  getRuleById(ruleId: string): Promise<CategoryRule | null>;
  getUncategorizedTransactions(): Promise<UncategorizedTransaction[]>;
  categorizeTransactions(ids: string[], categoryId: string): Promise<number>;
};

export function findMatchingUncategorizedTxns(
  rule: CategoryRule,
  txns: UncategorizedTransaction[],
): UncategorizedTransaction[] {
  return txns.filter((t) => t.categoryId === null && categorize(t.description, [rule]) !== null);
}

export async function previewRetroactiveApply(
  ruleId: string,
  store: RetroactiveStore,
): Promise<{ count: number }> {
  const rule = await store.getRuleById(ruleId);
  if (!rule) return { count: 0 };
  const txns = await store.getUncategorizedTransactions();
  const matches = findMatchingUncategorizedTxns(rule, txns);
  return { count: matches.length };
}

export async function applyRetroactively(
  ruleId: string,
  store: RetroactiveStore,
): Promise<{ applied: number }> {
  const rule = await store.getRuleById(ruleId);
  if (!rule) return { applied: 0 };
  const txns = await store.getUncategorizedTransactions();
  const matches = findMatchingUncategorizedTxns(rule, txns);
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

  async getUncategorizedTransactions(): Promise<UncategorizedTransaction[]> {
    return db
      .select({
        id: transactions.id,
        description: transactions.description,
        categoryId: transactions.categoryId,
      })
      .from(transactions)
      .where(isNull(transactions.categoryId));
  },

  async categorizeTransactions(ids: string[], categoryId: string): Promise<number> {
    await db.update(transactions).set({ categoryId }).where(inArray(transactions.id, ids));
    return ids.length;
  },
};
