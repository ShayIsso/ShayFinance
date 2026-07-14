import { describe, it, expect } from "vitest";
import { runAiCategorization, type AiCategorizationStore } from "../run";
import type { CategorizationProvider, GenerationOptions } from "../provider";
import { extractMerchant } from "@/lib/transaction-matching";
import type { RedactedString } from "@/lib/redaction";
import type { MerchantMemoryStore, MemoryEntry, CategorySource } from "@/lib/merchant-memory";

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
type StoredCategory = { id: string; name: string; description: string | null };

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
      return categories.map((c) => ({ id: c.id, name: c.name, description: c.description }));
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
