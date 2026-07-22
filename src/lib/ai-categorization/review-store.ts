import { db } from "@/db";
import { aiSuggestions, categories, transactions } from "@/db/schema";
import { eq, and, inArray, desc, sql, count, type SQL } from "drizzle-orm";
import type { ReviewStore, ReviewSuggestionStatus } from "./review";

type DbClient = Pick<typeof db, "select" | "insert" | "update">;

/**
 * Drizzle-backed suggestion-lifecycle store (ADR-0007 Store pattern). Owns
 * only ai_suggestions rows — memory reads/writes stay in
 * createMerchantMemoryStore, composed at the call site (review.ts).
 */
export function createReviewStore(client: DbClient = db): ReviewStore {
  return {
    async getPendingSuggestions(transactionIds) {
      if (transactionIds.length === 0) return [];
      const rows = await client
        .select({
          transactionId: aiSuggestions.transactionId,
          suggestionId: aiSuggestions.id,
          categoryId: aiSuggestions.categoryId,
          categoryName: categories.name,
          confidence: aiSuggestions.confidence,
        })
        .from(aiSuggestions)
        .innerJoin(categories, eq(aiSuggestions.categoryId, categories.id))
        .where(
          and(
            inArray(aiSuggestions.transactionId, transactionIds),
            eq(aiSuggestions.status, "pending_review"),
          ),
        );
      return rows;
    },

    async getPendingSuggestion(suggestionId) {
      const rows = await client
        .select({
          transactionId: aiSuggestions.transactionId,
          suggestionId: aiSuggestions.id,
          categoryId: aiSuggestions.categoryId,
          categoryName: categories.name,
          confidence: aiSuggestions.confidence,
        })
        .from(aiSuggestions)
        .innerJoin(categories, eq(aiSuggestions.categoryId, categories.id))
        .where(and(eq(aiSuggestions.id, suggestionId), eq(aiSuggestions.status, "pending_review")))
        .limit(1);
      return rows[0] ?? null;
    },

    async getActiveAutoApplied(transactionId) {
      const rows = await client
        .select({ suggestionId: aiSuggestions.id, categoryId: aiSuggestions.categoryId })
        .from(aiSuggestions)
        .where(
          and(
            eq(aiSuggestions.transactionId, transactionId),
            eq(aiSuggestions.status, "auto_applied"),
          ),
        )
        .orderBy(desc(aiSuggestions.createdAt))
        .limit(1);
      return rows[0] ?? null;
    },

    async markSuggestionStatus(suggestionId: string, status: ReviewSuggestionStatus) {
      await client
        .update(aiSuggestions)
        .set({ status, updatedAt: new Date() })
        .where(eq(aiSuggestions.id, suggestionId));
    },

    async getPendingSuggestionCount() {
      const rows = await client
        .select({ count: count() })
        .from(aiSuggestions)
        .where(eq(aiSuggestions.status, "pending_review"));
      return rows[0]?.count ?? 0;
    },
  };
}

/**
 * "Needs review" filter predicate: exactly the transactions with a
 * pending-review suggestion. Mirrors merchant-memory's `overwriteLawSql` —
 * the single Drizzle expression of the filter, owned where the underlying
 * table (ai_suggestions) is owned, reused at the transactions list seam.
 */
export function needsReviewSql(): SQL {
  return sql`exists (
    select 1 from ${aiSuggestions}
    where ${aiSuggestions.transactionId} = ${transactions.id}
      and ${aiSuggestions.status} = 'pending_review'
  )`;
}
