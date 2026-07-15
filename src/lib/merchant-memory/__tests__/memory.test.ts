import { describe, it, expect } from "vitest";
import {
  deriveMerchantKey,
  canOverwrite,
  resolveEntryWrite,
  selectFanOutTargets,
  lookupMemory,
  recordAssignment,
  applyCorrection,
  applyBulkCategorization,
  undoFanOut,
  removeAiTierEntry,
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
    async deleteEntry(merchantKey) {
      const idx = entries.findIndex((x) => x.merchantKey === merchantKey);
      if (idx !== -1) entries.splice(idx, 1);
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
      // The contract allows over-returning (the DB store prefilters by key);
      // exact key matching happens in selectFanOutTargets.
      return txns
        .filter((t) => t.categorySource === null || t.categorySource === "ai")
        .map(
          (t) =>
            ({
              id: t.id,
              description: t.description,
              categoryId: t.categoryId,
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
  ): OverwritableTxn => ({ id, description, categoryId: null, categorySource });

  const ids = (targets: OverwritableTxn[]) => targets.map((t) => t.id);

  it("selects same-key overwritable siblings, excluding the touched txns", () => {
    const key = deriveMerchantKey("שופרסל דיל");
    const candidates = [
      c("t1", "שופרסל דיל", null),
      c("t2", "שופרסל דיל תל אביב", null),
      c("t3", "רמי לוי", null),
      c("self", "שופרסל דיל", null),
    ];
    expect(ids(selectFanOutTargets(key, candidates, ["self"]))).toEqual(["t1"]);
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
    expect(ids(selectFanOutTargets(key, candidates, []))).toEqual(["t4", "t5"]);
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
    ).toEqual({ fanOutCount: 0, fannedOut: [] });
  });

  it("reports each fanned-out sibling's prior state for undo", async () => {
    const { store } = createStore({
      txns: [
        { id: "target", description: "שופרסל דיל", categoryId: null, categorySource: null },
        { id: "sib-ai", description: "שופרסל דיל", categoryId: "old", categorySource: "ai" },
      ],
    });

    const result = await recordAssignment(
      { transactionId: "target", toCategoryId: "cat-food", tier: "user" },
      store,
    );

    expect(result.fannedOut).toEqual([
      { id: "sib-ai", previousCategoryId: "old", previousCategorySource: "ai" },
    ]);
  });
});

// ── undoFanOut ────────────────────────────────────────────────────────────────

describe("undoFanOut", () => {
  it("restores fanned-out siblings' prior category+source without logging corrections", async () => {
    const { store, txns, entries, corrections } = createStore({
      txns: [
        { id: "target", description: "שופרסל דיל", categoryId: null, categorySource: null },
        { id: "sib-null", description: "שופרסל דיל", categoryId: null, categorySource: null },
        { id: "sib-ai", description: "שופרסל דיל", categoryId: "old", categorySource: "ai" },
      ],
    });

    const { fannedOut } = await recordAssignment(
      { transactionId: "target", toCategoryId: "cat-food", tier: "user" },
      store,
    );
    await undoFanOut(fannedOut, store);

    const byId = (id: string) => txns.find((t) => t.id === id)!;
    expect(byId("sib-null")).toMatchObject({ categoryId: null, categorySource: null });
    expect(byId("sib-ai")).toMatchObject({ categoryId: "old", categorySource: "ai" });
    // The user's own assignment and the memory entry both survive the undo.
    expect(byId("target")).toMatchObject({ categoryId: "cat-food", categorySource: "user" });
    expect(entries[0]).toMatchObject({ categoryId: "cat-food", source: "user" });
    expect(corrections).toHaveLength(0);
  });
});

describe("removeAiTierEntry", () => {
  it("deletes an ai-tier entry", async () => {
    const { store, entries } = createStore({
      entries: [
        {
          merchantKey: "שופרסל",
          categoryId: "cat-food",
          source: "ai",
          hitCount: 3,
          lastHitAt: null,
        },
      ],
    });
    await removeAiTierEntry("שופרסל", store);
    expect(entries).toHaveLength(0);
  });

  it("never removes a user-tier entry — a confirmed mapping outranks automated undo", async () => {
    const { store, entries } = createStore({
      entries: [
        {
          merchantKey: "שופרסל",
          categoryId: "cat-food",
          source: "user",
          hitCount: 3,
          lastHitAt: null,
        },
      ],
    });
    await removeAiTierEntry("שופרסל", store);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ source: "user" });
  });

  it("is a no-op when no entry exists for the key", async () => {
    const { store, entries } = createStore({});
    await removeAiTierEntry("אין כזה", store);
    expect(entries).toHaveLength(0);
  });

  it("is a no-op for an empty merchant key", async () => {
    const { store, entries } = createStore({
      entries: [
        {
          merchantKey: "שופרסל",
          categoryId: "cat-food",
          source: "ai",
          hitCount: 0,
          lastHitAt: null,
        },
      ],
    });
    await removeAiTierEntry("", store);
    expect(entries).toHaveLength(1);
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
    expect(result).toEqual({ fanOutCount: 0, fannedOut: [] });
    expect(corrections).toHaveLength(0);
  });

  it("no-ops when the target category equals the current one: no log row, no memory write, no fan-out", async () => {
    const { store, txns, entries, corrections } = createStore({
      txns: [
        { id: "target", description: "שופרסל דיל", categoryId: "cat-food", categorySource: "rule" },
        { id: "sib", description: "שופרסל דיל", categoryId: null, categorySource: null },
      ],
      categoryNames: { "cat-food": "מזון" },
    });

    const result = await applyCorrection(
      { transactionId: "target", toCategoryId: "cat-food" },
      store,
    );

    expect(result).toEqual({ fanOutCount: 0, fannedOut: [] });
    expect(corrections).toHaveLength(0);
    expect(entries).toHaveLength(0);
    expect(txns.find((t) => t.id === "target")).toMatchObject({ categorySource: "rule" });
    expect(txns.find((t) => t.id === "sib")).toMatchObject({ categoryId: null });
  });
});

// ── applyBulkCategorization ───────────────────────────────────────────────────

describe("applyBulkCategorization", () => {
  it("logs a correction per recategorized row, marks all selected 'user', learns per merchant, fans out to non-selected siblings", async () => {
    const { store, txns, entries, corrections } = createStore({
      txns: [
        // Two selected rows of the same merchant, both previously categorized.
        { id: "s1", description: "שופרסל דיל", categoryId: "cat-a", categorySource: "rule" },
        { id: "s2", description: "שופרסל דיל", categoryId: "cat-b", categorySource: "ai" },
        // Selected, uncategorized (first-time) — no log row.
        { id: "s3", description: "רמי לוי", categoryId: null, categorySource: null },
        // Non-selected same-key siblings.
        { id: "sib-1", description: "שופרסל דיל", categoryId: null, categorySource: null },
        { id: "sib-2", description: "רמי לוי", categoryId: "old", categorySource: "ai" },
        { id: "sib-user", description: "שופרסל דיל", categoryId: "keep", categorySource: "user" },
      ],
      categoryNames: { "cat-a": "א", "cat-b": "ב", "cat-food": "מזון" },
    });

    const result = await applyBulkCategorization(
      { transactionIds: ["s1", "s2", "s3"], toCategoryId: "cat-food" },
      store,
    );

    // One log row per recategorized transaction (s1, s2), none for first-time s3.
    expect(corrections).toHaveLength(2);
    expect(corrections.map((c) => c.transactionId).sort()).toEqual(["s1", "s2"]);
    expect(corrections.find((c) => c.transactionId === "s1")).toMatchObject({
      fromCategoryName: "א",
      toCategoryName: "מזון",
      fromSource: "rule",
    });

    const byId = (id: string) => txns.find((t) => t.id === id)!;
    for (const id of ["s1", "s2", "s3"]) {
      expect(byId(id)).toMatchObject({ categoryId: "cat-food", categorySource: "user" });
    }

    // One user-tier entry per distinct merchant.
    expect(entries.map((e) => e.merchantKey).sort()).toEqual(
      [deriveMerchantKey("שופרסל דיל"), deriveMerchantKey("רמי לוי")].sort(),
    );
    expect(entries.every((e) => e.source === "user" && e.categoryId === "cat-food")).toBe(true);

    // Fan-out reaches non-selected overwritable siblings only.
    expect(result.fanOutCount).toBe(2);
    expect(byId("sib-1")).toMatchObject({ categoryId: "cat-food", categorySource: "memory" });
    expect(byId("sib-2")).toMatchObject({ categoryId: "cat-food", categorySource: "memory" });
    expect(byId("sib-user")).toMatchObject({ categoryId: "keep", categorySource: "user" });
    expect(result.fannedOut).toContainEqual({
      id: "sib-2",
      previousCategoryId: "old",
      previousCategorySource: "ai",
    });
  });

  it("skips log rows for selected rows already at the target category", async () => {
    const { store, corrections } = createStore({
      txns: [
        { id: "s1", description: "שופרסל דיל", categoryId: "cat-food", categorySource: "rule" },
      ],
      categoryNames: { "cat-food": "מזון" },
    });

    await applyBulkCategorization({ transactionIds: ["s1"], toCategoryId: "cat-food" }, store);

    expect(corrections).toHaveLength(0);
  });

  it("returns count 0 when no selected transactions exist", async () => {
    const { store } = createStore();
    const result = await applyBulkCategorization(
      { transactionIds: ["ghost"], toCategoryId: "c" },
      store,
    );
    expect(result).toEqual({ fanOutCount: 0, fannedOut: [] });
  });
});
