import { describe, it, expect } from "vitest";
import { runAiCategorization, type AiCategorizationStore } from "../run";
import type { CategorizationProvider, GenerationOptions } from "../provider";
import { extractMerchant } from "@/lib/transaction-matching";
import type { RedactedString } from "@/lib/redaction";
import type { MerchantMemoryStore, MemoryEntry, CategorySource } from "@/lib/merchant-memory";
import { filterAssignable } from "@/lib/categories";

// ── Combined in-memory store ────────────────────────────────────────────────
// Implements BOTH the AiCategorizationStore and the MerchantMemoryStore over
// shared arrays, so the whole pipeline (memory apply → provider apply →
// suggestion rows) is observable through one fake. No Drizzle is mocked.

type StoredTxn = {
  id: string;
  description: string;
  bankType: "discount" | "max" | "visaCal";
  categoryId: string | null;
  categorySource: CategorySource | null;
};
type StoredEntry = MemoryEntry & { hitCount: number };
type StoredSuggestion = {
  transactionId: string;
  categoryId: string;
  confidence: number;
  model: string;
  status: "pending_review" | "auto_applied" | "accepted" | "rejected" | "undone";
};
// parentId is optional so existing seeds (flat category sets) need no change;
// ADR-0011 hierarchy tests set it to exercise the assignable-only answer space.
type StoredCategory = {
  id: string;
  name: string;
  description: string | null;
  parentId?: string | null;
};

function createFake(seed: {
  txns: StoredTxn[];
  entries?: StoredEntry[];
  categories: StoredCategory[];
  fewShot?: { categoryName: string; description: string }[];
  aiCorrections?: { description: string; correctedToCategoryName: string }[];
  suggestions?: StoredSuggestion[];
  servedIds?: string[];
}) {
  const txns = seed.txns.map((t) => ({ ...t }));
  const entries = (seed.entries ?? []).map((e) => ({ ...e }));
  const categories = seed.categories.map((c) => ({ ...c }));
  const suggestions: StoredSuggestion[] = (seed.suggestions ?? []).map((s) => ({ ...s }));
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

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
      return nameById.get(id) ?? null;
    },
    async categoryHasChildren(categoryId) {
      return categories.some((c) => c.parentId === categoryId);
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
    async appendCorrection() {
      // AI runs write first-time labels (no corrections); a call here is a bug.
      throw new Error("appendCorrection must not be called during an AI run");
    },
  };

  const aiStore: AiCategorizationStore = {
    async getUncategorizedTransactions() {
      const served = seed.servedIds
        ? txns.filter((t) => seed.servedIds!.includes(t.id))
        : txns.filter((t) => t.categoryId === null);
      return served.map((t) => ({ id: t.id, description: t.description, bankType: t.bankType }));
    },
    async getPromptCategories() {
      // Mirrors the real store's ADR-0011 §6 filtering: the prompt's answer
      // space is assignable (childless) categories only.
      const assignable = filterAssignable(
        categories.map((c) => ({
          id: c.id,
          name: c.name,
          type: "expense" as const,
          parentId: c.parentId ?? null,
        })),
      );
      const assignableIds = new Set(assignable.map((c) => c.id));
      return categories
        .filter((c) => assignableIds.has(c.id))
        .map((c) => ({ id: c.id, name: c.name, description: c.description }));
    },
    async getFewShotExamples() {
      return (seed.fewShot ?? []).map((e) => ({ ...e }));
    },
    async getRecentAiCorrections() {
      return (seed.aiCorrections ?? []).map((a) => ({ ...a }));
    },
    async getSuppressedPairs(ids) {
      return suggestions
        .filter(
          (s) =>
            ids.includes(s.transactionId) && (s.status === "rejected" || s.status === "undone"),
        )
        .map((s) => ({ transactionId: s.transactionId, categoryId: s.categoryId }));
    },
    async insertSuggestion(row) {
      suggestions.push({ ...row });
    },
  };

  return { memoryStore, aiStore, txns, entries, suggestions };
}

/**
 * Provider that maps each numbered batch line to a category+confidence by
 * substring match, so answers track descriptions rather than positions. Captures
 * every prompt it is handed for boundary assertions.
 */
function scriptedProvider(
  script: { match: string; category: string; confidence: number }[],
): CategorizationProvider & { prompts: RedactedString[] } {
  const prompts: RedactedString[] = [];
  return {
    modelId: "test-model",
    prompts,
    async generate(prompt: RedactedString, _options: GenerationOptions) {
      prompts.push(prompt);
      const answers: { index: number; category: string; confidence: number }[] = [];
      for (const line of String(prompt).split("\n")) {
        const m = /^(\d+)\.\s+(.*)$/.exec(line);
        if (!m) continue;
        const index = Number(m[1]);
        const desc = m[2];
        const hit = script.find((s) => desc.includes(s.match));
        if (hit) answers.push({ index, category: hit.category, confidence: hit.confidence });
      }
      return JSON.stringify({ answers });
    },
  };
}

const CATS: StoredCategory[] = [
  { id: "c-food", name: "מזון וסופר", description: "כולל סופרמרקטים" },
  { id: "c-rest", name: "מסעדות וקפה", description: "כולל מסעדות" },
  { id: "c-transport", name: "תחבורה", description: null },
];

function keyOf(desc: string): string {
  return extractMerchant(desc);
}

describe("runAiCategorization — full pipeline", () => {
  it("routes through memory → transfer guard → tiered apply, recording provenance and rows", async () => {
    const fake = createFake({
      categories: CATS,
      entries: [
        { merchantKey: keyOf("שופרסל דיל"), categoryId: "c-food", source: "user", hitCount: 0 },
        { merchantKey: keyOf("רמי לוי"), categoryId: "c-food", source: "ai", hitCount: 0 },
      ],
      suggestions: [
        {
          transactionId: "t-suppressed",
          categoryId: "c-food",
          confidence: 6,
          model: "x",
          status: "rejected",
        },
      ],
      txns: [
        {
          id: "t-mem",
          description: "שופרסל דיל",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
        {
          id: "t-mem-ai",
          description: "רמי לוי",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
        {
          id: "t-xfer-card",
          description: "העברה בנקאית",
          bankType: "visaCal",
          categoryId: null,
          categorySource: null,
        },
        {
          id: "t-xfer-bank",
          description: "חיוב ויזה",
          bankType: "discount",
          categoryId: null,
          categorySource: null,
        },
        {
          id: "t-card4",
          description: "פיצה 2000",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
        {
          id: "t-review",
          description: "ביגוד אופנה",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
        {
          id: "t-discard",
          description: "עסקה כללית",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
        {
          id: "t-suppressed",
          description: "חנות ספרים",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
      ],
    });

    const provider = scriptedProvider([
      { match: "פיצה", category: "מסעדות וקפה", confidence: 7 },
      { match: "ביגוד", category: "מזון וסופר", confidence: 4 },
      { match: "עסקה", category: "תחבורה", confidence: 1 },
      { match: "חנות", category: "מזון וסופר", confidence: 6 },
    ]);

    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
    });

    expect(summary).toMatchObject({
      totalUncategorized: 8,
      memoryApplied: 2,
      transferSkipped: 2,
      autoApplied: 1,
      queuedForReview: 1,
      discarded: 1,
      suppressed: 1,
      overwriteBlocked: 0,
      batches: 1,
      failures: [],
    });

    const byId = (id: string) => fake.txns.find((t) => t.id === id)!;
    // Memory hits: user-tier writes `memory`, ai-tier writes `ai`.
    expect(byId("t-mem")).toMatchObject({ categoryId: "c-food", categorySource: "memory" });
    expect(byId("t-mem-ai")).toMatchObject({ categoryId: "c-food", categorySource: "ai" });
    // Transfer-guarded rows are untouched.
    expect(byId("t-xfer-card").categoryId).toBeNull();
    expect(byId("t-xfer-bank").categoryId).toBeNull();
    // Auto-apply (6–7): category on the row marked `ai`, ai-tier memory written.
    expect(byId("t-card4")).toMatchObject({ categoryId: "c-rest", categorySource: "ai" });
    expect(fake.entries.find((e) => e.merchantKey === keyOf("פיצה 2000"))).toMatchObject({
      categoryId: "c-rest",
      source: "ai",
    });
    // Review (3–5): nothing applied, a pending_review row queued.
    expect(byId("t-review").categoryId).toBeNull();
    // Discard (1–2): stays uncategorized, no row.
    expect(byId("t-discard").categoryId).toBeNull();
    // Suppressed pair: not re-applied.
    expect(byId("t-suppressed").categoryId).toBeNull();

    const written = fake.suggestions.filter((s) => s.model === "test-model");
    expect(written).toHaveLength(2);
    expect(written.find((s) => s.transactionId === "t-card4")).toMatchObject({
      status: "auto_applied",
      categoryId: "c-rest",
      confidence: 7,
    });
    expect(written.find((s) => s.transactionId === "t-review")).toMatchObject({
      status: "pending_review",
      categoryId: "c-food",
      confidence: 4,
    });
    expect(written.some((s) => s.transactionId === "t-discard")).toBe(false);
    expect(written.some((s) => s.transactionId === "t-suppressed")).toBe(false);
  });

  it("never overwrites a row that became user/rule/memory-sourced (overwrite law at apply time)", async () => {
    const fake = createFake({
      categories: CATS,
      servedIds: ["t-locked"],
      txns: [
        // Served as uncategorized (stale list) but actually user-sourced now.
        {
          id: "t-locked",
          description: "פיצה חמה",
          bankType: "max",
          categoryId: "c-food",
          categorySource: "user",
        },
      ],
    });
    const provider = scriptedProvider([{ match: "פיצה", category: "מסעדות וקפה", confidence: 7 }]);

    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
    });

    expect(summary.autoApplied).toBe(0);
    expect(summary.overwriteBlocked).toBe(1);
    // Untouched: category and provenance stand, no ai-tier memory, no suggestion.
    expect(fake.txns[0]).toMatchObject({ categoryId: "c-food", categorySource: "user" });
    expect(fake.entries).toHaveLength(0);
    expect(fake.suggestions).toHaveLength(0);
  });

  it("never lets a memory hit overwrite a row that became user-sourced mid-run", async () => {
    const fake = createFake({
      categories: CATS,
      servedIds: ["t-locked"],
      entries: [
        { merchantKey: keyOf("שופרסל דיל"), categoryId: "c-food", source: "user", hitCount: 0 },
      ],
      txns: [
        {
          id: "t-locked",
          description: "שופרסל דיל",
          bankType: "max",
          categoryId: "c-rest",
          categorySource: "user",
        },
      ],
    });
    const provider = scriptedProvider([]);

    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
    });

    expect(summary.memoryApplied).toBe(0);
    expect(summary.overwriteBlocked).toBe(1);
    expect(fake.txns[0]).toMatchObject({ categoryId: "c-rest", categorySource: "user" });
    expect(provider.prompts).toHaveLength(0);
  });

  it("suppresses an undone pair at review tier — no new pending_review row", async () => {
    const fake = createFake({
      categories: CATS,
      suggestions: [
        {
          transactionId: "t-undone",
          categoryId: "c-food",
          confidence: 6,
          model: "x",
          status: "undone",
        },
      ],
      txns: [
        {
          id: "t-undone",
          description: "מאפיית לחם",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
      ],
    });
    const provider = scriptedProvider([{ match: "מאפיית", category: "מזון וסופר", confidence: 4 }]);

    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
    });

    expect(summary.queuedForReview).toBe(0);
    expect(summary.suppressed).toBe(1);
    expect(fake.suggestions.filter((s) => s.model === "test-model")).toHaveLength(0);
    expect(fake.txns[0].categoryId).toBeNull();
  });

  it("backs an ai-tier cache apply with an auto_applied suggestion row (undo/suppression parity)", async () => {
    const fake = createFake({
      categories: CATS,
      entries: [{ merchantKey: keyOf("רמי לוי"), categoryId: "c-food", source: "ai", hitCount: 0 }],
      txns: [
        {
          id: "t-cache",
          description: "רמי לוי",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
      ],
    });
    const provider = scriptedProvider([]);

    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
    });

    expect(summary.memoryApplied).toBe(1);
    expect(fake.txns[0]).toMatchObject({ categoryId: "c-food", categorySource: "ai" });
    expect(fake.suggestions).toHaveLength(1);
    expect(fake.suggestions[0]).toMatchObject({
      transactionId: "t-cache",
      categoryId: "c-food",
      model: "memory",
      status: "auto_applied",
    });
  });

  it("never re-applies an undone pair from the memory cache; the txn still reaches the provider", async () => {
    const fake = createFake({
      categories: CATS,
      entries: [{ merchantKey: keyOf("רמי לוי"), categoryId: "c-food", source: "ai", hitCount: 0 }],
      suggestions: [
        {
          transactionId: "t-undone",
          categoryId: "c-food",
          confidence: 6,
          model: "memory",
          status: "undone",
        },
      ],
      txns: [
        {
          id: "t-undone",
          description: "רמי לוי",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
      ],
    });
    const provider = scriptedProvider([{ match: "רמי", category: "תחבורה", confidence: 7 }]);

    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
    });

    expect(summary.memoryApplied).toBe(0);
    expect(summary.suppressed).toBe(1);
    // A different category from the provider still applies — suppression is per pair.
    expect(summary.autoApplied).toBe(1);
    expect(fake.txns[0]).toMatchObject({ categoryId: "c-transport", categorySource: "ai" });
  });

  it("records provider errors as failures without throwing", async () => {
    const fake = createFake({
      categories: CATS,
      txns: [
        { id: "t1", description: "משהו", bankType: "max", categoryId: null, categorySource: null },
      ],
    });
    const provider: CategorizationProvider = {
      modelId: "boom",
      async generate() {
        throw new Error("network down");
      },
    };

    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
    });
    expect(summary.autoApplied).toBe(0);
    expect(summary.failures).toEqual([{ batch: 1, index: null, reason: "provider_error" }]);
  });

  it("propagates parse failures into the summary without applying", async () => {
    const fake = createFake({
      categories: CATS,
      txns: [
        { id: "t1", description: "משהו", bankType: "max", categoryId: null, categorySource: null },
      ],
    });
    const provider: CategorizationProvider = {
      modelId: "m",
      async generate() {
        return "totally not json";
      },
    };
    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
    });
    expect(summary.failures).toEqual([{ batch: 1, index: null, reason: "malformed_json" }]);
    expect(fake.txns[0].categoryId).toBeNull();
  });

  it("chunks into multiple batches of the configured size", async () => {
    const txns: StoredTxn[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      description: `מסעדה ${String.fromCharCode(0x5d0 + i)}`,
      bankType: "max" as const,
      categoryId: null,
      categorySource: null,
    }));
    const fake = createFake({ categories: CATS, txns });
    const provider = scriptedProvider([{ match: "מסעדה", category: "מסעדות וקפה", confidence: 7 }]);

    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
      options: { batchSize: 2 },
    });
    expect(summary.batches).toBe(3);
    expect(summary.autoApplied).toBe(5);
    expect(provider.prompts).toHaveLength(3);
  });

  it("reports the transfer-guarded transaction ids for downstream inbox routing", async () => {
    const fake = createFake({
      categories: CATS,
      txns: [
        {
          id: "t-xfer",
          description: "העברה בנקאית",
          bankType: "discount",
          categoryId: null,
          categorySource: null,
        },
        {
          id: "t-normal",
          description: "מסעדה כלשהי",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
      ],
    });
    const provider = scriptedProvider([{ match: "מסעדה", category: "מסעדות וקפה", confidence: 7 }]);

    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
    });

    expect(summary.transferSkipped).toBe(1);
    expect(summary.transferSkippedIds).toEqual(["t-xfer"]);
  });

  it("spaces batches by the pacing policy's inter-batch delay (injected sleep, no real timers)", async () => {
    const txns: StoredTxn[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      description: `מסעדה ${String.fromCharCode(0x5d0 + i)}`,
      bankType: "max" as const,
      categoryId: null,
      categorySource: null,
    }));
    const fake = createFake({ categories: CATS, txns });
    const provider = scriptedProvider([{ match: "מסעדה", category: "מסעדות וקפה", confidence: 7 }]);

    const sleeps: number[] = [];
    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
      options: { batchSize: 2 },
      pacing: {
        policy: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 20000, interBatchDelayMs: 500 },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
    });

    // 5 txns / batch 2 = 3 batches → paced between them = 2 pauses, none leading.
    expect(summary.batches).toBe(3);
    expect(sleeps).toEqual([500, 500]);
  });

  it("does not pace when no policy is injected (batches fire back-to-back)", async () => {
    const txns: StoredTxn[] = Array.from({ length: 4 }, (_, i) => ({
      id: `t${i}`,
      description: `מסעדה ${String.fromCharCode(0x5d0 + i)}`,
      bankType: "max" as const,
      categoryId: null,
      categorySource: null,
    }));
    const fake = createFake({ categories: CATS, txns });
    const provider = scriptedProvider([{ match: "מסעדה", category: "מסעדות וקפה", confidence: 7 }]);

    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
      options: { batchSize: 2 },
    });
    expect(summary.batches).toBe(2);
  });

  it("sends only redacted payloads to the provider (5+ digit runs are stripped)", async () => {
    const fake = createFake({
      categories: CATS,
      txns: [
        {
          id: "t1",
          description: "מסעדה חשבון 123456789",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
      ],
    });
    const provider = scriptedProvider([{ match: "מסעדה", category: "מסעדות וקפה", confidence: 3 }]);
    await runAiCategorization({ aiStore: fake.aiStore, memoryStore: fake.memoryStore, provider });

    expect(provider.prompts).toHaveLength(1);
    const seen = String(provider.prompts[0]);
    expect(seen).not.toContain("123456789");
    expect(seen).toContain("[REDACTED_DIGITS]");
  });
});

// ── Assignable-only answer space (ADR-0011 §6) ───────────────────────────────
// A group is never assignable, so its name must never reach the prompt's
// category list; a model answer naming it anyway is rejected as unknown.

describe("runAiCategorization — assignable-only answer space", () => {
  it("excludes a group's name from the prompt category list and discards an answer naming it", async () => {
    const fake = createFake({
      categories: [
        { id: "g-food", name: "אוכל", description: null, parentId: null },
        { id: "c-food", name: "מזון וסופר", description: null, parentId: "g-food" },
        { id: "c-rest", name: "מסעדות וקפה", description: null, parentId: "g-food" },
      ],
      txns: [
        {
          id: "t1",
          description: "שופרסל דיל",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
      ],
    });

    // Answers with the GROUP's name, never one of its leaves.
    const provider = scriptedProvider([{ match: "שופרסל", category: "אוכל", confidence: 7 }]);

    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
    });

    expect(String(provider.prompts[0])).not.toContain("אוכל");
    expect(summary.failures).toContainEqual(
      expect.objectContaining({ reason: "unknown_category" }),
    );
    expect(summary.autoApplied).toBe(0);
    expect(summary.queuedForReview).toBe(0);
    expect(fake.txns.find((t) => t.id === "t1")?.categoryId).toBeNull();
  });

  it("still offers the group's own leaves as valid answers", async () => {
    const fake = createFake({
      categories: [
        { id: "g-food", name: "אוכל", description: null, parentId: null },
        { id: "c-food", name: "מזון וסופר", description: null, parentId: "g-food" },
        { id: "c-rest", name: "מסעדות וקפה", description: null, parentId: "g-food" },
      ],
      txns: [
        {
          id: "t1",
          description: "שופרסל דיל",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
      ],
    });

    const provider = scriptedProvider([{ match: "שופרסל", category: "מזון וסופר", confidence: 7 }]);

    const summary = await runAiCategorization({
      aiStore: fake.aiStore,
      memoryStore: fake.memoryStore,
      provider,
    });

    expect(String(provider.prompts[0])).toContain("מזון וסופר");
    expect(summary.autoApplied).toBe(1);
    expect(fake.txns.find((t) => t.id === "t1")).toMatchObject({
      categoryId: "c-food",
      categorySource: "ai",
    });
  });
});
