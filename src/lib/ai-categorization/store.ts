import { db } from "@/db";
import {
  transactions,
  categories,
  categoryRules,
  categoryCorrections,
  aiSuggestions,
  bankAccounts,
  bankCredentials,
} from "@/db/schema";
import { eq, and, isNull, inArray, desc } from "drizzle-orm";
import { matchesRule, filterAssignable } from "@/lib/categories";
import type {
  AiCategorizationStore,
  UncategorizedTxn,
  PromptCategoryRow,
  FewShotRow,
  AiCorrectionRow,
  SuppressedPair,
  SuggestionInsert,
  BankType,
} from "./run";

type DbClient = Pick<typeof db, "select" | "insert">;

/** Recent AI corrections fed as anti-examples. Bounded so the prompt stays small. */
const AI_CORRECTION_LIMIT = 50;

/**
 * Drizzle-backed AI categorization persistence (ADR-0007 Store pattern). Owns
 * only the AI-specific reads/writes — memory reads/writes stay in the injected
 * MerchantMemoryStore, so this store never duplicates memory semantics.
 */
export function createAiCategorizationStore(client: DbClient = db): AiCategorizationStore {
  return {
    async getUncategorizedTransactions(): Promise<UncategorizedTxn[]> {
      // bankType lives on bank_credentials via bank_accounts; join to carry it so
      // the transfer guard can scope kinds by account class (card vs bank).
      const rows = await client
        .select({
          id: transactions.id,
          description: transactions.description,
          bankType: bankCredentials.bankType,
        })
        .from(transactions)
        .innerJoin(bankAccounts, eq(transactions.bankAccountId, bankAccounts.id))
        .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id))
        .where(isNull(transactions.categoryId));
      return rows.map((r) => ({
        id: r.id,
        description: r.description,
        bankType: r.bankType as BankType,
      }));
    },

    async getPromptCategories(): Promise<PromptCategoryRow[]> {
      const rows = await client
        .select({
          id: categories.id,
          name: categories.name,
          description: categories.description,
          type: categories.type,
          parentId: categories.parentId,
        })
        .from(categories)
        .orderBy(categories.name);
      // ADR-0011 §6: the AI stays blind to hierarchy — the prompt's answer
      // space is assignable (childless) categories only, so creating a group
      // can never silently widen it.
      const assignableIds = new Set(filterAssignable(rows).map((c) => c.id));
      return rows
        .filter((r) => assignableIds.has(r.id))
        .map((r) => ({ id: r.id, name: r.name, description: r.description ?? null }));
    },

    async getFewShotExamples(): Promise<FewShotRow[]> {
      // Few-shot examples are rule-matched descriptions (disjoint from the served
      // pool by construction). Replay active rules against categorized rows and
      // keep the first hit per category name.
      const rules = await client
        .select({
          categoryId: categoryRules.categoryId,
          matchType: categoryRules.matchType,
          pattern: categoryRules.pattern,
          priority: categoryRules.priority,
        })
        .from(categoryRules)
        .orderBy(desc(categoryRules.priority));
      const rows = await client
        .select({
          description: transactions.description,
          categoryId: transactions.categoryId,
          categoryName: categories.name,
        })
        .from(transactions)
        .innerJoin(categories, eq(transactions.categoryId, categories.id));

      const perCategory = new Map<string, FewShotRow>();
      for (const row of rows) {
        if (!row.categoryId) continue;
        const matched = rules.some(
          (rule) =>
            rule.categoryId === row.categoryId &&
            matchesRule(rule.matchType, rule.pattern, row.description),
        );
        if (matched && !perCategory.has(row.categoryName)) {
          perCategory.set(row.categoryName, {
            categoryName: row.categoryName,
            description: row.description,
          });
        }
      }
      return [...perCategory.values()];
    },

    async getRecentAiCorrections(): Promise<AiCorrectionRow[]> {
      const rows = await client
        .select({
          description: categoryCorrections.descriptionRedacted,
          correctedToCategoryName: categoryCorrections.toCategoryName,
        })
        .from(categoryCorrections)
        .where(eq(categoryCorrections.fromSource, "ai"))
        .orderBy(desc(categoryCorrections.createdAt))
        .limit(AI_CORRECTION_LIMIT);
      return rows.map((r) => ({
        description: r.description,
        correctedToCategoryName: r.correctedToCategoryName,
      }));
    },

    async getSuppressedPairs(transactionIds: string[]): Promise<SuppressedPair[]> {
      if (transactionIds.length === 0) return [];
      const rows = await client
        .select({
          transactionId: aiSuggestions.transactionId,
          categoryId: aiSuggestions.categoryId,
          status: aiSuggestions.status,
        })
        .from(aiSuggestions)
        .where(
          and(
            inArray(aiSuggestions.transactionId, transactionIds),
            inArray(aiSuggestions.status, ["rejected", "undone"]),
          ),
        );
      return rows.map((r) => ({ transactionId: r.transactionId, categoryId: r.categoryId }));
    },

    async insertSuggestion(row: SuggestionInsert): Promise<void> {
      await client.insert(aiSuggestions).values({
        transactionId: row.transactionId,
        categoryId: row.categoryId,
        confidence: row.confidence,
        model: row.model,
        status: row.status,
      });
    },
  };
}
