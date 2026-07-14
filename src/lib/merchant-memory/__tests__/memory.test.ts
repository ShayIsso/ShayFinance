import { describe, it, expect } from "vitest";
import {
  deriveMerchantKey,
  canOverwrite,
  resolveEntryWrite,
  selectFanOutTargets,
  lookupMemory,
  recordAssignment,
  applyCorrection,
  type MerchantMemoryStore,
  type MemoryEntry,
  type CorrectionTxn,
  type OverwritableTxn,
  type NewCorrection,
  type CategorySource,
} from "..";
import { extractMerchant } from "@/lib/transaction-matching";

// ── In-memory store ───────────────────────────────────────────────────────────
// Mirrors the DB store's contract without Drizzle. Tests observe behavior
// through it (rows, entries, corrections), never through private state.

type StoredTxn = {
  id: string;
  description: string;
  categoryId: string | null;
  categorySource: CategorySource | null;
};

type StoredEntry = MemoryEntry & { hitCount: number; lastHitAt: Date | null };

function createStore(seed?: {
  txns?: StoredTxn[];
  entries?: StoredEntry[];
  categoryNames?: Record<string, string>;
}) {
  const txns: StoredTxn[] = seed?.txns ? seed.txns.map((t) => ({ ...t })) : [];
  const entries: StoredEntry[] = seed?.entries ? seed.entries.map((e) => ({ ...e })) : [];
  const corrections: NewCorrection[] = [];
  const categoryNames = seed?.categoryNames ?? {};

  const store: MerchantMemoryStore = {
    async findEntriesByKeys(keys) {
      return entries
        .filter((e) => keys.includes(e.merchantKey))
        .map((e) => ({ merchantKey: e.merchantKey, categoryId: e.categoryId, source: e.source }));
    },
    async recordHits(keys, now) {
      for (const e of entries) {
        if (keys.includes(e.merchantKey)) {
          e.hitCount += 1;
          e.lastHitAt = now;
        }
      }
    },
    async getEntry(merchantKey) {
      const e = entries.find((x) => x.merchantKey === merchantKey);
      return e ? { ...e } : null;
    },
    async upsertEntry(entry, now) {
      const existing = entries.find((x) => x.merchantKey === entry.merchantKey);
      if (existing) {
        existing.categoryId = entry.categoryId;
        existing.source = entry.source;
        existing.lastHitAt = existing.lastHitAt;
      } else {
        entries.push({ ...entry, hitCount: 0, lastHitAt: null });
      }
      void now;
    },
    async getTransaction(id) {
      const t = txns.find((x) => x.id === id);
      if (!t) return null;
      return {
        id: t.id,
        description: t.description,
        categoryId: t.categoryId,
        categorySource: t.categorySource,
      } satisfies CorrectionTxn;
    },
    async getCategoryName(categoryId) {
      return categoryNames[categoryId] ?? null;
    },
    async getOverwritableTransactions() {
      return txns
        .filter((t) => t.categorySource === null || t.categorySource === "ai")
        .map(
          (t) =>
            ({
              id: t.id,
              description: t.description,
              categorySource: t.categorySource,
            }) satisfies OverwritableTxn,
        );
    },
    async setTransactionCategory(ids, categoryId, source) {
      for (const t of txns) {
        if (ids.includes(t.id)) {
          t.categoryId = categoryId;
          t.categorySource = source;
        }
      }
    },
    async appendCorrection(row) {
      corrections.push(row);
    },
  };

  return { store, txns, entries, corrections };
}

// ── Pure functions ────────────────────────────────────────────────────────────

describe("deriveMerchantKey", () => {
  it("delegates to extractMerchant (raw description normalization)", () => {
    expect(deriveMerchantKey("תשלום ב-שופרסל דיל 1234")).toBe(
      extractMerchant("תשלום ב-שופרסל דיל 1234"),
    );
  });
});

describe("canOverwrite", () => {
  it("permits overwriting NULL (uncategorized) and ai-sourced assignments", () => {
    expect(canOverwrite(null)).toBe(true);
    expect(canOverwrite("ai")).toBe(true);
  });

  it("protects user, rule, and memory sourced assignments from automation", () => {
    expect(canOverwrite("user")).toBe(false);
    expect(canOverwrite("rule")).toBe(false);
    expect(canOverwrite("memory")).toBe(false);
  });
});

describe("resolveEntryWrite", () => {
  it("user tier always writes user (promotes / last-write-wins)", () => {
    expect(resolveEntryWrite(null, "user")).toBe("write-user");
    expect(resolveEntryWrite({ source: "ai" }, "user")).toBe("write-user");
    expect(resolveEntryWrite({ source: "user" }, "user")).toBe("write-user");
  });

  it("ai tier writes ai when no user entry blocks it", () => {
    expect(resolveEntryWrite(null, "ai")).toBe("write-ai");
    expect(resolveEntryWrite({ source: "ai" }, "ai")).toBe("write-ai");
  });

  it("ai tier does not downgrade an existing user entry", () => {
    expect(resolveEntryWrite({ source: "user" }, "ai")).toBe("skip");
  });
});

describe("selectFanOutTargets", () => {
  const c = (
    id: string,
    description: string,
    categorySource: CategorySource | null,
  ): OverwritableTxn => ({ id, description, categorySource });

  it("selects same-key overwritable siblings, excluding the touched txn", () => {
    const key = deriveMerchantKey("שופרסל דיל");
    const candidates = [
      c("t1", "שופרסל דיל", null),
      c("t2", "שופרסל דיל תל אביב", null),
      c("t3", "רמי לוי", null),
      c("self", "שופרסל דיל", null),
    ];
    expect(selectFanOutTargets(key, candidates, "self")).toEqual(["t1"]);
  });

  it("skips protected rows even when the key matches", () => {
    const key = deriveMerchantKey("שופרסל דיל");
    const candidates = [
      c("t1", "שופרסל דיל", "user"),
      c("t2", "שופרסל דיל", "rule"),
      c("t3", "שופרסל דיל", "memory"),
      c("t4", "שופרסל דיל", "ai"),
      c("t5", "שופרסל דיל", null),
    ];
    expect(selectFanOutTargets(key, candidates, "none")).toEqual(["t4", "t5"]);
  });
});

// ── lookupMemory ──────────────────────────────────────────────────────────────

describe("lookupMemory", () => {
  it("returns an empty map for no keys and does not touch the store", async () => {
    const { store } = createStore();
    expect(await lookupMemory([], store)).toEqual(new Map());
  });

  it("returns key→entry for hits and records a hit on each applied key", async () => {
    const now = new Date("2026-07-14T10:00:00Z");
    const { store, entries } = createStore({
      entries: [
        {
          merchantKey: "שופרסל דיל",
          categoryId: "cat-food",
          source: "user",
          hitCount: 2,
          lastHitAt: null,
        },
        {
          merchantKey: "נטפליקס",
          categoryId: "cat-fun",
          source: "ai",
          hitCount: 0,
          lastHitAt: null,
        },
      ],
    });

    const map = await lookupMemory(["שופרסל דיל", "לא קיים"], store, now);

    expect(map.get("שופרסל דיל")).toEqual({
      merchantKey: "שופרסל דיל",
      categoryId: "cat-food",
      source: "user",
    });
    expect(map.has("לא קיים")).toBe(false);
    expect(entries.find((e) => e.merchantKey === "שופרסל דיל")!.hitCount).toBe(3);
    expect(entries.find((e) => e.merchantKey === "שופרסל דיל")!.lastHitAt).toEqual(now);
    // Untouched entry keeps its hit count.
    expect(entries.find((e) => e.merchantKey === "נטפליקס")!.hitCount).toBe(0);
  });
});

// ── recordAssignment (first-time labeling) ────────────────────────────────────

describe("recordAssignment", () => {
  it("user-tier: labels the txn 'user', writes user memory, fans out siblings as 'memory'", async () => {
    const { store, txns, entries } = createStore({
      txns: [
        { id: "target", description: "שופרסל דיל", categoryId: null, categorySource: null },
        { id: "sib-null", description: "שופרסל דיל", categoryId: null, categorySource: null },
        { id: "sib-ai", description: "שופרסל דיל", categoryId: "old", categorySource: "ai" },
        { id: "sib-user", description: "שופרסל דיל", categoryId: "keep", categorySource: "user" },
        { id: "other", description: "רמי לוי", categoryId: null, categorySource: null },
      ],
    });

    const result = await recordAssignment(
      { transactionId: "target", toCategoryId: "cat-food", tier: "user" },
      store,
    );

    expect(result.fanOutCount).toBe(2); // sib-null + sib-ai; NOT sib-user, NOT other
    const byId = (id: string) => txns.find((t) => t.id === id)!;
    expect(byId("target")).toMatchObject({ categoryId: "cat-food", categorySource: "user" });
    expect(byId("sib-null")).toMatchObject({ categoryId: "cat-food", categorySource: "memory" });
    expect(byId("sib-ai")).toMatchObject({ categoryId: "cat-food", categorySource: "memory" });
    expect(byId("sib-user")).toMatchObject({ categoryId: "keep", categorySource: "user" });
    expect(byId("other")).toMatchObject({ categoryId: null, categorySource: null });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      merchantKey: deriveMerchantKey("שופרסל דיל"),
      categoryId: "cat-food",
      source: "user",
    });
  });

  it("user touch promotes an existing ai entry to user-tier", async () => {
    const { store, entries } = createStore({
      txns: [{ id: "t", description: "שופרסל דיל", categoryId: null, categorySource: null }],
      entries: [
        {
          merchantKey: deriveMerchantKey("שופרסל דיל"),
          categoryId: "old",
          source: "ai",
          hitCount: 5,
          lastHitAt: null,
        },
      ],
    });

    await recordAssignment({ transactionId: "t", toCategoryId: "cat-new", tier: "user" }, store);

    expect(entries[0]).toMatchObject({ categoryId: "cat-new", source: "user" });
  });

  it("ai-tier: marks the txn 'ai', writes ai memory, and does not fan out", async () => {
    const { store, txns, entries } = createStore({
      txns: [
        { id: "t", description: "נטפליקס", categoryId: null, categorySource: null },
        { id: "sib", description: "נטפליקס", categoryId: null, categorySource: null },
      ],
    });

    const result = await recordAssignment(
      { transactionId: "t", toCategoryId: "cat-fun", tier: "ai" },
      store,
    );

    expect(result.fanOutCount).toBe(0);
    expect(txns.find((t) => t.id === "t")).toMatchObject({
      categoryId: "cat-fun",
      categorySource: "ai",
    });
    expect(txns.find((t) => t.id === "sib")).toMatchObject({ categorySource: null });
    expect(entries[0]).toMatchObject({ source: "ai" });
  });

  it("returns count 0 for an unknown transaction", async () => {
    const { store } = createStore();
    expect(
      await recordAssignment({ transactionId: "ghost", toCategoryId: "c", tier: "user" }, store),
    ).toEqual({
      fanOutCount: 0,
    });
  });
});

// ── applyCorrection (recategorizing an already-categorized txn) ────────────────

describe("applyCorrection", () => {
  it("overwrites+promotes memory, logs a redacted correction, and fans out", async () => {
    const { store, txns, entries, corrections } = createStore({
      txns: [
        {
          id: "target",
          description: "שופרסל דיל כרטיס 123456",
          categoryId: "cat-shopping",
          categorySource: "rule",
        },
        {
          id: "sib",
          description: "שופרסל דיל כרטיס 999999",
          categoryId: null,
          categorySource: null,
        },
        { id: "sib-user", description: "שופרסל דיל", categoryId: "keep", categorySource: "user" },
      ],
      entries: [
        {
          merchantKey: deriveMerchantKey("שופרסל דיל כרטיס 123456"),
          categoryId: "cat-shopping",
          source: "ai",
          hitCount: 1,
          lastHitAt: null,
        },
      ],
      categoryNames: { "cat-shopping": "קניות", "cat-food": "מזון" },
    });

    const result = await applyCorrection(
      { transactionId: "target", toCategoryId: "cat-food" },
      store,
    );

    expect(result.fanOutCount).toBe(1); // sib only; sib-user protected
    expect(txns.find((t) => t.id === "target")).toMatchObject({
      categoryId: "cat-food",
      categorySource: "user",
    });
    expect(txns.find((t) => t.id === "sib")).toMatchObject({ categorySource: "memory" });
    // Memory promoted to user-tier, last-write-wins on categoryId.
    expect(entries[0]).toMatchObject({ categoryId: "cat-food", source: "user" });
    // Correction log: name snapshots, from_source, redacted description (no raw digits).
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      transactionId: "target",
      merchantKey: deriveMerchantKey("שופרסל דיל כרטיס 123456"),
      fromCategoryName: "קניות",
      toCategoryName: "מזון",
      fromCategoryId: "cat-shopping",
      toCategoryId: "cat-food",
      fromSource: "rule",
    });
    expect(corrections[0].descriptionRedacted).not.toContain("123456");
    expect(corrections[0].descriptionRedacted).toContain("[REDACTED_DIGITS]");
  });

  it("returns count 0 for an unknown transaction and writes nothing", async () => {
    const { store, corrections } = createStore();
    const result = await applyCorrection({ transactionId: "ghost", toCategoryId: "c" }, store);
    expect(result).toEqual({ fanOutCount: 0 });
    expect(corrections).toHaveLength(0);
  });
});
