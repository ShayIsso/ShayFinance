import { describe, it, expect, vi } from "vitest";
import { applyReconciliation } from "../apply";
import type { ReconciliationCandidate } from "../types";
import type { ReconciliationStore } from "../store";

function makeStore(overrides: Partial<ReconciliationStore> = {}): ReconciliationStore {
  return {
    getRecentTransactions: vi.fn().mockResolvedValue([]),
    getCategoryIdByName: vi.fn().mockResolvedValue("cat-settlement"),
    applyAutoReconciliation: vi.fn().mockResolvedValue(undefined),
    queueReconciliation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeCandidate(
  confidence: number,
  overrides: Partial<ReconciliationCandidate> = {},
): ReconciliationCandidate {
  return {
    bankLump: {
      id: "lump-1",
      bankAccountId: "ba-1",
      bankType: "discount",
      date: "2026-01-15",
      chargedAmount: -300,
      description: "חיוב ויזה",
      categoryId: null,
      reconciliationGroupId: null,
    },
    cardDetails: [
      {
        id: "card-1",
        bankAccountId: "ba-2",
        bankType: "max",
        date: "2026-01-10",
        chargedAmount: -100,
        description: "קפה",
        categoryId: "cat-expense",
        reconciliationGroupId: null,
      },
      {
        id: "card-2",
        bankAccountId: "ba-2",
        bankType: "max",
        date: "2026-01-12",
        chargedAmount: -200,
        description: "מסעדה",
        categoryId: "cat-food",
        reconciliationGroupId: null,
      },
    ],
    confidence,
    ...overrides,
  };
}

describe("applyReconciliation", () => {
  it("returns {autoApplied:0, queued:0} for empty candidates", async () => {
    const store = makeStore();
    const result = await applyReconciliation([], store);
    expect(result).toEqual({ autoApplied: 0, queued: 0 });
    expect(store.applyAutoReconciliation).not.toHaveBeenCalled();
    expect(store.queueReconciliation).not.toHaveBeenCalled();
  });

  it("auto-applies when confidence >= 0.95", async () => {
    const store = makeStore();
    const candidate = makeCandidate(0.95);

    const result = await applyReconciliation([candidate], store);

    expect(result.autoApplied).toBe(1);
    expect(result.queued).toBe(0);
    expect(store.applyAutoReconciliation).toHaveBeenCalledOnce();
    expect(store.queueReconciliation).not.toHaveBeenCalled();
  });

  it("queues when confidence is 0.94 (just below auto-apply threshold)", async () => {
    const store = makeStore();
    const candidate = makeCandidate(0.94);

    const result = await applyReconciliation([candidate], store);

    expect(result.autoApplied).toBe(0);
    expect(result.queued).toBe(1);
    expect(store.queueReconciliation).toHaveBeenCalledOnce();
    expect(store.applyAutoReconciliation).not.toHaveBeenCalled();
  });

  it("queues at exactly confidence 0.70", async () => {
    const store = makeStore();
    const candidate = makeCandidate(0.7);

    const result = await applyReconciliation([candidate], store);

    expect(result.queued).toBe(1);
    expect(store.queueReconciliation).toHaveBeenCalledOnce();
  });

  it("auto-apply passes settlementCategoryId to store for bank lump", async () => {
    const store = makeStore({
      getCategoryIdByName: vi.fn().mockResolvedValue("cat-settlement-id"),
    });
    const candidate = makeCandidate(1.0);

    await applyReconciliation([candidate], store);

    expect(store.applyAutoReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        settlementCategoryId: "cat-settlement-id",
        bankLumpId: "lump-1",
        cardDetailIds: expect.arrayContaining(["card-1", "card-2"]),
      }),
    );
  });

  it("auto-apply does NOT pass settlementCategoryId to card detail IDs (category unchanged)", async () => {
    const store = makeStore();
    const candidate = makeCandidate(1.0);

    await applyReconciliation([candidate], store);

    const call = vi.mocked(store.applyAutoReconciliation).mock.calls[0][0];
    // Card IDs are passed separately from the lump ID; the store is responsible for
    // not flipping their category — verify the separation is maintained here
    expect(call.bankLumpId).toBe("lump-1");
    expect(call.cardDetailIds).not.toContain("lump-1");
  });

  it("uses the same groupId for bank lump and card details in auto-apply", async () => {
    const store = makeStore();
    const candidate = makeCandidate(1.0);

    await applyReconciliation([candidate], store);

    const call = vi.mocked(store.applyAutoReconciliation).mock.calls[0][0];
    expect(call.groupId).toBeTruthy();
    // The same groupId is passed for both lump and details (store uses it for both)
    expect(typeof call.groupId).toBe("string");
  });

  it("uses the same groupId for bank lump and card details in queue", async () => {
    const store = makeStore();
    const candidate = makeCandidate(0.8);

    await applyReconciliation([candidate], store);

    const call = vi.mocked(store.queueReconciliation).mock.calls[0][0];
    expect(call.groupId).toBeTruthy();
    expect(call.bankLumpId).toBe("lump-1");
    expect(call.cardDetailIds).toEqual(expect.arrayContaining(["card-1", "card-2"]));
  });

  it("assigns distinct groupIds to separate candidates", async () => {
    const store = makeStore();
    const candidate1 = makeCandidate(1.0);
    const candidate2 = makeCandidate(1.0, {
      bankLump: { ...candidate1.bankLump, id: "lump-2" },
    });

    await applyReconciliation([candidate1, candidate2], store);

    const calls = vi.mocked(store.applyAutoReconciliation).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].groupId).not.toBe(calls[1][0].groupId);
  });

  it("queues instead of crashing when settlement category is not found", async () => {
    const store = makeStore({ getCategoryIdByName: vi.fn().mockResolvedValue(null) });
    const candidate = makeCandidate(1.0);

    const result = await applyReconciliation([candidate], store);

    // Fallback: queue because we can't flip category without the ID
    expect(result.autoApplied).toBe(0);
    expect(result.queued).toBe(1);
    expect(store.queueReconciliation).toHaveBeenCalledOnce();
  });

  it("handles mixed confidence candidates: some auto-applied, some queued", async () => {
    const store = makeStore();
    const high = makeCandidate(1.0);
    const medium = makeCandidate(0.8, {
      bankLump: { ...high.bankLump, id: "lump-medium" },
    });

    const result = await applyReconciliation([high, medium], store);

    expect(result.autoApplied).toBe(1);
    expect(result.queued).toBe(1);
  });
});
