import { describe, it, expect } from "vitest";
import {
  acceptSuggestion,
  rejectSuggestion,
  undoAiAssignment,
  type ReviewStore,
  type PendingSuggestionRow,
  type ActiveAutoAppliedSuggestion,
} from "../review";
import { applyCorrection } from "@/lib/merchant-memory";
import type { MerchantMemoryStore, MemoryEntry, CategorySource } from "@/lib/merchant-memory";

// ── Combined in-memory store ────────────────────────────────────────────────
// Implements both MerchantMemoryStore and ReviewStore over shared arrays, so
// the full review lifecycle (memory + suggestion status) is observable
// through one fake. No Drizzle is mocked (project convention).

type StoredTxn = {
  id: string;
  description: string;
  categoryId: string | null;
  categorySource: CategorySource | null;
};
type StoredEntry = MemoryEntry & { hitCount: number };
type StoredSuggestion = {
  id: string;
  transactionId: string;
  categoryId: string;
  categoryName: string;
  confidence: number;
  status: "pending_review" | "auto_applied" | "accepted" | "rejected" | "undone";
};

function createFake(seed: {
  txns: StoredTxn[];
  entries?: StoredEntry[];
  suggestions?: StoredSuggestion[];
  categoryNames?: Record<string, string>;
}) {
  const txns = seed.txns.map((t) => ({ ...t }));
  const entries = (seed.entries ?? []).map((e) => ({ ...e }));
  const suggestions = (seed.suggestions ?? []).map((s) => ({ ...s }));
  const corrections: unknown[] = [];
  const categoryNames = seed.categoryNames ?? {};

  const memoryStore: MerchantMemoryStore = {
    async findEntriesByKeys(keys) {
      return entries
        .filter((e) => keys.includes(e.merchantKey))
        .map((e) => ({ merchantKey: e.merchantKey, categoryId: e.categoryId, source: e.source }));
    },
    async recordHits(keys) {
      for (const e of entries) if (keys.includes(e.merchantKey)) e.hitCount += 1;
    },
    async getEntry(key) {
      const e = entries.find((x) => x.merchantKey === key);
      return e ? { merchantKey: e.merchantKey, categoryId: e.categoryId, source: e.source } : null;
    },
    async upsertEntry(entry) {
      const existing = entries.find((x) => x.merchantKey === entry.merchantKey);
      if (existing) {
        existing.categoryId = entry.categoryId;
        existing.source = entry.source;
      } else {
        entries.push({ ...entry, hitCount: 0 });
      }
    },
    async deleteAiTierEntry(merchantKey) {
      const idx = entries.findIndex((x) => x.merchantKey === merchantKey && x.source === "ai");
      if (idx !== -1) entries.splice(idx, 1);
    },
    async getTransaction(id) {
      const t = txns.find((x) => x.id === id);
      return t
        ? {
            id: t.id,
            description: t.description,
            categoryId: t.categoryId,
            categorySource: t.categorySource,
          }
        : null;
    },
    async getCategoryName(id) {
      return categoryNames[id] ?? null;
    },
    async categoryHasChildren() {
      return false;
    },
    async getOverwritableTransactions() {
      return txns
        .filter((t) => t.categorySource === null || t.categorySource === "ai")
        .map((t) => ({
          id: t.id,
          description: t.description,
          categoryId: t.categoryId,
          categorySource: t.categorySource,
        }));
    },
    async setTransactionCategory(ids, categoryId, source) {
      for (const t of txns)
        if (ids.includes(t.id)) {
          t.categoryId = categoryId;
          t.categorySource = source;
        }
    },
    async restoreTransactionCategories(rows) {
      for (const row of rows) {
        const t = txns.find((x) => x.id === row.id);
        if (t) {
          t.categoryId = row.previousCategoryId;
          t.categorySource = row.previousCategorySource;
        }
      }
    },
    async appendCorrection(row) {
      corrections.push(row);
    },
  };

  const reviewStore: ReviewStore = {
    async getPendingSuggestions(transactionIds): Promise<PendingSuggestionRow[]> {
      return suggestions
        .filter((s) => transactionIds.includes(s.transactionId) && s.status === "pending_review")
        .map((s) => ({
          transactionId: s.transactionId,
          suggestionId: s.id,
          categoryId: s.categoryId,
          categoryName: s.categoryName,
          confidence: s.confidence,
        }));
    },
    async getPendingSuggestion(suggestionId): Promise<PendingSuggestionRow | null> {
      const s = suggestions.find((x) => x.id === suggestionId && x.status === "pending_review");
      return s
        ? {
            transactionId: s.transactionId,
            suggestionId: s.id,
            categoryId: s.categoryId,
            categoryName: s.categoryName,
            confidence: s.confidence,
          }
        : null;
    },
    async getActiveAutoApplied(transactionId): Promise<ActiveAutoAppliedSuggestion | null> {
      const s = suggestions
        .filter((x) => x.transactionId === transactionId && x.status === "auto_applied")
        .at(-1);
      return s ? { suggestionId: s.id, categoryId: s.categoryId } : null;
    },
    async markSuggestionStatus(suggestionId, status) {
      const s = suggestions.find((x) => x.id === suggestionId);
      if (s) s.status = status;
    },
  };

  // Mirrors store.ts's getSuppressedPairs predicate exactly (status in
  // rejected/undone) so reject/undo can be proven suppressed the same way
  // the AI run itself checks suppression.
  function getSuppressedPairs(transactionIds: string[]) {
    return suggestions
      .filter(
        (s) =>
          transactionIds.includes(s.transactionId) && ["rejected", "undone"].includes(s.status),
      )
      .map((s) => ({ transactionId: s.transactionId, categoryId: s.categoryId }));
  }

  return { memoryStore, reviewStore, txns, entries, suggestions, corrections, getSuppressedPairs };
}

// ── acceptSuggestion ─────────────────────────────────────────────────────────

describe("acceptSuggestion", () => {
  it("applies the category as user-tier, writes user-tier memory, fans out, and marks accepted", async () => {
    const { memoryStore, reviewStore, txns, entries, suggestions } = createFake({
      txns: [
        { id: "target", description: "שופרסל דיל", categoryId: null, categorySource: null },
        { id: "sib", description: "שופרסל דיל", categoryId: null, categorySource: null },
      ],
      suggestions: [
        {
          id: "sugg-1",
          transactionId: "target",
          categoryId: "cat-food",
          categoryName: "מזון",
          confidence: 4,
          status: "pending_review",
        },
      ],
    });

    const result = await acceptSuggestion(
      { transactionId: "target", suggestionId: "sugg-1" },
      reviewStore,
      memoryStore,
    );

    expect(result.accepted).toBe(true);
    expect(txns.find((t) => t.id === "target")).toMatchObject({
      categoryId: "cat-food",
      categorySource: "user",
    });
    expect(txns.find((t) => t.id === "sib")).toMatchObject({
      categoryId: "cat-food",
      categorySource: "memory",
    });
    expect(entries[0]).toMatchObject({ categoryId: "cat-food", source: "user" });
    expect(result.fanOutCount).toBe(1);
    expect(suggestions[0].status).toBe("accepted");
  });

  it("writes no corrections-log row (first-time labeling, not a correction)", async () => {
    const { memoryStore, reviewStore, corrections } = createFake({
      txns: [{ id: "target", description: "שופרסל דיל", categoryId: null, categorySource: null }],
      suggestions: [
        {
          id: "sugg-1",
          transactionId: "target",
          categoryId: "cat-food",
          categoryName: "מזון",
          confidence: 4,
          status: "pending_review",
        },
      ],
    });

    await acceptSuggestion(
      { transactionId: "target", suggestionId: "sugg-1" },
      reviewStore,
      memoryStore,
    );

    expect(corrections).toHaveLength(0);
  });

  it("no-ops on a resolved or mismatched suggestion — the stored row decides, not the client", async () => {
    const { memoryStore, reviewStore, txns, entries } = createFake({
      txns: [{ id: "target", description: "שופרסל דיל", categoryId: null, categorySource: null }],
      suggestions: [
        {
          id: "sugg-1",
          transactionId: "target",
          categoryId: "cat-food",
          categoryName: "מזון",
          confidence: 4,
          status: "rejected",
        },
      ],
    });

    const resolved = await acceptSuggestion(
      { transactionId: "target", suggestionId: "sugg-1" },
      reviewStore,
      memoryStore,
    );
    const mismatched = await acceptSuggestion(
      { transactionId: "other-txn", suggestionId: "sugg-1" },
      reviewStore,
      memoryStore,
    );

    expect(resolved.accepted).toBe(false);
    expect(mismatched.accepted).toBe(false);
    expect(txns[0]).toMatchObject({ categoryId: null, categorySource: null });
    expect(entries).toHaveLength(0);
  });
});

// ── rejectSuggestion ─────────────────────────────────────────────────────────

describe("rejectSuggestion", () => {
  it("leaves the transaction uncategorized and suppresses the pair on later runs", async () => {
    const { reviewStore, txns, suggestions, getSuppressedPairs } = createFake({
      txns: [{ id: "target", description: "שופרסל דיל", categoryId: null, categorySource: null }],
      suggestions: [
        {
          id: "sugg-1",
          transactionId: "target",
          categoryId: "cat-food",
          categoryName: "מזון",
          confidence: 4,
          status: "pending_review",
        },
      ],
    });

    await rejectSuggestion({ suggestionId: "sugg-1" }, reviewStore);

    expect(txns[0]).toMatchObject({ categoryId: null, categorySource: null });
    expect(suggestions[0].status).toBe("rejected");
    expect(getSuppressedPairs(["target"])).toEqual([
      { transactionId: "target", categoryId: "cat-food" },
    ]);
  });
});

// ── undoAiAssignment ─────────────────────────────────────────────────────────

describe("undoAiAssignment", () => {
  it("reverts to uncategorized, removes the ai-tier memory entry, marks undone, and logs no correction", async () => {
    const {
      memoryStore,
      reviewStore,
      txns,
      entries,
      suggestions,
      corrections,
      getSuppressedPairs,
    } = createFake({
      txns: [
        { id: "target", description: "שופרסל דיל", categoryId: "cat-food", categorySource: "ai" },
      ],
      entries: [{ merchantKey: "שופרסל דיל", categoryId: "cat-food", source: "ai", hitCount: 2 }],
      suggestions: [
        {
          id: "sugg-1",
          transactionId: "target",
          categoryId: "cat-food",
          categoryName: "מזון",
          confidence: 7,
          status: "auto_applied",
        },
      ],
    });

    const result = await undoAiAssignment({ transactionId: "target" }, reviewStore, memoryStore);

    expect(result.undone).toBe(true);
    expect(txns[0]).toMatchObject({ categoryId: null, categorySource: null });
    expect(entries).toHaveLength(0);
    expect(suggestions[0].status).toBe("undone");
    expect(corrections).toHaveLength(0);
    expect(getSuppressedPairs(["target"])).toEqual([
      { transactionId: "target", categoryId: "cat-food" },
    ]);
  });

  it("never removes a user-tier memory entry, even under the same merchant key", async () => {
    const { memoryStore, reviewStore, entries } = createFake({
      txns: [
        { id: "target", description: "שופרסל דיל", categoryId: "cat-food", categorySource: "ai" },
      ],
      entries: [{ merchantKey: "שופרסל דיל", categoryId: "cat-food", source: "user", hitCount: 2 }],
      suggestions: [
        {
          id: "sugg-1",
          transactionId: "target",
          categoryId: "cat-food",
          categoryName: "מזון",
          confidence: 7,
          status: "auto_applied",
        },
      ],
    });

    await undoAiAssignment({ transactionId: "target" }, reviewStore, memoryStore);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: "user" });
  });

  it("no-ops when the transaction is not currently ai-sourced (stale action)", async () => {
    const { memoryStore, reviewStore, txns, suggestions } = createFake({
      txns: [
        { id: "target", description: "שופרסל דיל", categoryId: "cat-food", categorySource: "user" },
      ],
      suggestions: [
        {
          id: "sugg-1",
          transactionId: "target",
          categoryId: "cat-food",
          categoryName: "מזון",
          confidence: 7,
          status: "auto_applied",
        },
      ],
    });

    const result = await undoAiAssignment({ transactionId: "target" }, reviewStore, memoryStore);

    expect(result.undone).toBe(false);
    expect(txns[0]).toMatchObject({ categoryId: "cat-food", categorySource: "user" });
    expect(suggestions[0].status).toBe("auto_applied");
  });

  it("no-ops for an unknown transaction", async () => {
    const { memoryStore, reviewStore, suggestions } = createFake({ txns: [] });
    const result = await undoAiAssignment({ transactionId: "missing" }, reviewStore, memoryStore);
    expect(result.undone).toBe(false);
    expect(suggestions).toHaveLength(0);
  });

  it("still undoes an ai-sourced row with no backing suggestion (pre-row cache applies)", async () => {
    // The revert and memory retraction never depend on a row existing — an
    // ai-sourced row written before cache applies carried suggestion rows must
    // not become a dead undo button; there is just nothing to mark undone.
    const { memoryStore, reviewStore, txns, entries } = createFake({
      txns: [
        { id: "target", description: "שופרסל דיל", categoryId: "cat-food", categorySource: "ai" },
      ],
      entries: [{ merchantKey: "שופרסל דיל", categoryId: "cat-food", source: "ai", hitCount: 1 }],
      suggestions: [],
    });

    const result = await undoAiAssignment({ transactionId: "target" }, reviewStore, memoryStore);

    expect(result.undone).toBe(true);
    expect(txns[0]).toMatchObject({ categoryId: null, categorySource: null });
    expect(entries).toHaveLength(0);
  });
});

// ── Regression: recategorizing an AI-assigned row still flows through the
// existing correction operation (applyCorrection), unchanged. ──────────────

describe("recategorizing an ai-assigned row (regression, not reimplemented)", () => {
  it("logs a correction and promotes the merchant entry to user-tier — the same path as any other correction", async () => {
    const { memoryStore, txns, entries, corrections } = createFake({
      txns: [
        { id: "target", description: "שופרסל דיל", categoryId: "cat-food", categorySource: "ai" },
      ],
      entries: [{ merchantKey: "שופרסל דיל", categoryId: "cat-food", source: "ai", hitCount: 3 }],
      categoryNames: { "cat-food": "מזון", "cat-shopping": "קניות" },
    });

    const result = await applyCorrection(
      { transactionId: "target", toCategoryId: "cat-shopping" },
      memoryStore,
    );

    expect(txns[0]).toMatchObject({ categoryId: "cat-shopping", categorySource: "user" });
    expect(entries[0]).toMatchObject({ categoryId: "cat-shopping", source: "user" });
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      transactionId: "target",
      fromCategoryName: "מזון",
      toCategoryName: "קניות",
      fromSource: "ai",
    });
    expect(result.fanOutCount).toBe(0);
  });
});
