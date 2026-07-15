import { describe, it, expect } from "vitest";
import { runAiSyncStep, type AiStepDeps, type AiStepEvent } from "../ai-step";
import type { AiCategorizationStore } from "@/lib/ai-categorization";
import type { CategorizationProvider, GenerationOptions } from "@/lib/ai-categorization";
import type { RedactedString } from "@/lib/redaction";
import type { MerchantMemoryStore, CategorySource } from "@/lib/merchant-memory";
import type { SuspectedTransferRouter } from "@/lib/reconciliation";

// ── Fakes ─────────────────────────────────────────────────────────────────────

type StoredTxn = {
  id: string;
  description: string;
  bankType: "discount" | "max" | "visaCal";
  categoryId: string | null;
  categorySource: CategorySource | null;
};
type StoredCategory = { id: string; name: string; description: string | null };

function makeStores(seed: { txns: StoredTxn[]; categories: StoredCategory[] }) {
  const txns = seed.txns.map((t) => ({ ...t }));

  const memoryStore: MerchantMemoryStore = {
    async findEntriesByKeys() {
      return [];
    },
    async recordHits() {},
    async getEntry() {
      return null;
    },
    async upsertEntry() {},
    async deleteAiTierEntry() {},
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
    async getCategoryName() {
      return null;
    },
    async getOverwritableTransactions() {
      return [];
    },
    async setTransactionCategory(ids, categoryId, source) {
      for (const t of txns)
        if (ids.includes(t.id)) ((t.categoryId = categoryId), (t.categorySource = source));
    },
    async restoreTransactionCategories() {},
    async appendCorrection() {
      throw new Error("appendCorrection must not be called during an AI run");
    },
  };

  const suggestions: unknown[] = [];
  const aiStore: AiCategorizationStore = {
    async getUncategorizedTransactions() {
      return txns
        .filter((t) => t.categoryId === null)
        .map((t) => ({ id: t.id, description: t.description, bankType: t.bankType }));
    },
    async getPromptCategories() {
      return seed.categories.map((c) => ({ id: c.id, name: c.name, description: c.description }));
    },
    async getFewShotExamples() {
      return [];
    },
    async getRecentAiCorrections() {
      return [];
    },
    async getSuppressedPairs() {
      return [];
    },
    async insertSuggestion(row) {
      suggestions.push(row);
    },
  };

  return { aiStore, memoryStore, txns, suggestions };
}

function scriptedProvider(
  script: { match: string; category: string; confidence: number }[],
): CategorizationProvider & { prompts: RedactedString[] } {
  const prompts: RedactedString[] = [];
  return {
    modelId: "test-model",
    prompts,
    async generate(prompt: RedactedString, _o: GenerationOptions) {
      prompts.push(prompt);
      const answers: { index: number; category: string; confidence: number }[] = [];
      for (const line of String(prompt).split("\n")) {
        const m = /^(\d+)\.\s+(.*)$/.exec(line);
        if (!m) continue;
        const hit = script.find((s) => m[2].includes(s.match));
        if (hit)
          answers.push({ index: Number(m[1]), category: hit.category, confidence: hit.confidence });
      }
      return JSON.stringify({ answers });
    },
  };
}

function fakeRouter(unpaired: string[] = []): SuspectedTransferRouter & {
  filtered: string[][];
  queued: string[];
} {
  const filtered: string[][] = [];
  const queued: string[] = [];
  return {
    filtered,
    queued,
    async filterUnpaired(ids) {
      filtered.push(ids);
      return ids.filter((id) => unpaired.includes(id));
    },
    async queueSuspectedTransfer(id) {
      queued.push(id);
    },
  };
}

const CATS: StoredCategory[] = [{ id: "c-rest", name: "מסעדות וקפה", description: null }];

async function collect(gen: AsyncGenerator<AiStepEvent>): Promise<AiStepEvent[]> {
  const out: AiStepEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runAiSyncStep", () => {
  it("short-circuits when the provider is off — no run, no summary, no store reads", async () => {
    let uncategorizedRead = false;
    const { memoryStore } = makeStores({ txns: [], categories: CATS });
    const aiStore: AiCategorizationStore = {
      async getUncategorizedTransactions() {
        uncategorizedRead = true;
        return [];
      },
      async getPromptCategories() {
        return [];
      },
      async getFewShotExamples() {
        return [];
      },
      async getRecentAiCorrections() {
        return [];
      },
      async getSuppressedPairs() {
        return [];
      },
      async insertSuggestion() {},
    };

    const events = await collect(
      runAiSyncStep({
        createProvider: () => null,
        aiStore,
        memoryStore,
        transferRouter: fakeRouter(),
      }),
    );

    expect(events).toEqual([]);
    expect(uncategorizedRead).toBe(false);
  });

  it("swallows a thrown run (failure isolation) — yields nothing, never throws", async () => {
    const { memoryStore } = makeStores({ txns: [], categories: CATS });
    const aiStore: AiCategorizationStore = {
      async getUncategorizedTransactions() {
        throw new Error("db down");
      },
      async getPromptCategories() {
        return [];
      },
      async getFewShotExamples() {
        return [];
      },
      async getRecentAiCorrections() {
        return [];
      },
      async getSuppressedPairs() {
        return [];
      },
      async insertSuggestion() {},
    };

    const events = await collect(
      runAiSyncStep({
        createProvider: () => scriptedProvider([]),
        aiStore,
        memoryStore,
        transferRouter: fakeRouter(),
      }),
    );
    expect(events).toEqual([]);
  });

  it("swallows a thrown provider construction", async () => {
    const { aiStore, memoryStore } = makeStores({ txns: [], categories: CATS });
    const events = await collect(
      runAiSyncStep({
        createProvider: () => {
          throw new Error("bad config");
        },
        aiStore,
        memoryStore,
        transferRouter: fakeRouter(),
      }),
    );
    expect(events).toEqual([]);
  });

  it("routes a transfer-guarded, unpaired row to the inbox and never sends it to the provider", async () => {
    const { aiStore, memoryStore } = makeStores({
      categories: CATS,
      txns: [
        {
          id: "t-xfer",
          description: "העברה בנקאית",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
        {
          id: "t-food",
          description: "פיצה 2000",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
      ],
    });
    const provider = scriptedProvider([{ match: "פיצה", category: "מסעדות וקפה", confidence: 7 }]);
    const router = fakeRouter(["t-xfer"]);

    const events = await collect(
      runAiSyncStep({
        createProvider: () => provider,
        aiStore,
        memoryStore,
        transferRouter: router,
      }),
    );

    // The transfer row never appears in any prompt handed to the provider.
    expect(provider.prompts.some((p) => String(p).includes("העברה בנקאית"))).toBe(false);
    // Its id was offered to the router and, being unpaired, queued as a suspected transfer.
    expect(router.filtered).toEqual([["t-xfer"]]);
    expect(router.queued).toEqual(["t-xfer"]);

    const summary = events[0];
    expect(summary.type).toBe("ai_summary");
    // applied = auto-applied פיצה; queued = 1 suspected transfer; skipped = rest.
    expect(summary).toMatchObject({ applied: 1, queued: 1, skipped: 0 });
  });

  it("does not queue a transfer row that P3 already paired (filterUnpaired returns none)", async () => {
    const { aiStore, memoryStore } = makeStores({
      categories: CATS,
      txns: [
        {
          id: "t-xfer",
          description: "העברה בנקאית",
          bankType: "max",
          categoryId: null,
          categorySource: null,
        },
      ],
    });
    const router = fakeRouter([]); // nothing unpaired

    const events = await collect(
      runAiSyncStep({
        createProvider: () => scriptedProvider([]),
        aiStore,
        memoryStore,
        transferRouter: router,
      }),
    );

    expect(router.filtered).toEqual([["t-xfer"]]);
    expect(router.queued).toEqual([]);
    expect(events[0]).toMatchObject({ type: "ai_summary", applied: 0, queued: 0 });
  });
});
