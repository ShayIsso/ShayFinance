import { describe, it, expect, vi } from "vitest";
import { applyP2Mirror } from "../apply-p2";
import type { P2MirrorCandidate } from "../types";
import type { ReconciliationStore } from "../store";

function makeStore(overrides: Partial<ReconciliationStore> = {}): ReconciliationStore {
  return {
    getRecentTransactions: vi.fn().mockResolvedValue([]),
    getCategoryIdByName: vi.fn().mockResolvedValue("cat-transfer"),
    applyAutoReconciliation: vi.fn().mockResolvedValue(undefined),
    queueReconciliation: vi.fn().mockResolvedValue(undefined),
    applyAutoMirror: vi.fn().mockResolvedValue(undefined),
    queueMirror: vi.fn().mockResolvedValue(undefined),
    applyAutoInterAccount: vi.fn().mockResolvedValue(undefined),
    queueInterAccount: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeCandidate(
  confidence: number,
  overrides: Partial<P2MirrorCandidate> = {},
): P2MirrorCandidate {
  return {
    kind: "p2_mirror",
    bankSide: {
      id: "bank-1",
      bankAccountId: "ba-1",
      bankType: "discount",
      date: "2026-01-15",
      chargedAmount: -50,
      description: "ביט",
      categoryId: null,
      reconciliationGroupId: null,
    },
    cardSide: {
      id: "card-1",
      bankAccountId: "ba-2",
      bankType: "max",
      date: "2026-01-15",
      chargedAmount: -50,
      description: "ביט",
      categoryId: "cat-expense",
      reconciliationGroupId: null,
    },
    confidence,
    ...overrides,
  };
}

describe("applyP2Mirror", () => {
  it("returns {autoApplied:0, queued:0} for empty candidates", async () => {
    const store = makeStore();
    const result = await applyP2Mirror([], store);
    expect(result).toEqual({ autoApplied: 0, queued: 0 });
    expect(store.applyAutoMirror).not.toHaveBeenCalled();
    expect(store.queueMirror).not.toHaveBeenCalled();
  });

  it("auto-applies when confidence >= 0.95", async () => {
    const store = makeStore();
    const candidate = makeCandidate(0.95);

    const result = await applyP2Mirror([candidate], store);

    expect(result.autoApplied).toBe(1);
    expect(result.queued).toBe(0);
    expect(store.applyAutoMirror).toHaveBeenCalledOnce();
    expect(store.queueMirror).not.toHaveBeenCalled();
  });

  it("queues when confidence is 0.70 (below auto-apply threshold)", async () => {
    const store = makeStore();
    const candidate = makeCandidate(0.7);

    const result = await applyP2Mirror([candidate], store);

    expect(result.autoApplied).toBe(0);
    expect(result.queued).toBe(1);
    expect(store.queueMirror).toHaveBeenCalledOnce();
    expect(store.applyAutoMirror).not.toHaveBeenCalled();
  });

  it("auto-apply passes transferCategoryId and correct IDs to store", async () => {
    const store = makeStore({
      getCategoryIdByName: vi.fn().mockResolvedValue("cat-transfer-id"),
    });
    const candidate = makeCandidate(1.0);

    await applyP2Mirror([candidate], store);

    expect(store.applyAutoMirror).toHaveBeenCalledWith(
      expect.objectContaining({
        transferCategoryId: "cat-transfer-id",
        bankSideId: "bank-1",
        cardSideId: "card-1",
      }),
    );
  });

  it("uses distinct groupIds for separate candidates", async () => {
    const store = makeStore();
    const candidate1 = makeCandidate(1.0);
    const candidate2 = makeCandidate(1.0, {
      bankSide: { ...candidate1.bankSide, id: "bank-2" },
    });

    await applyP2Mirror([candidate1, candidate2], store);

    const calls = vi.mocked(store.applyAutoMirror).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].groupId).not.toBe(calls[1][0].groupId);
  });

  it("queues instead of crashing when transfer category is not found", async () => {
    const store = makeStore({ getCategoryIdByName: vi.fn().mockResolvedValue(null) });
    const candidate = makeCandidate(1.0);

    const result = await applyP2Mirror([candidate], store);

    expect(result.autoApplied).toBe(0);
    expect(result.queued).toBe(1);
    expect(store.queueMirror).toHaveBeenCalledOnce();
  });

  it("handles mixed confidence: some auto-applied, some queued", async () => {
    const store = makeStore();
    const high = makeCandidate(0.95);
    const medium = makeCandidate(0.7, {
      bankSide: { ...high.bankSide, id: "bank-medium" },
    });

    const result = await applyP2Mirror([high, medium], store);

    expect(result.autoApplied).toBe(1);
    expect(result.queued).toBe(1);
  });

  it("queue path passes correct IDs to queueMirror", async () => {
    const store = makeStore();
    const candidate = makeCandidate(0.7);

    await applyP2Mirror([candidate], store);

    expect(store.queueMirror).toHaveBeenCalledWith(
      expect.objectContaining({
        bankSideId: "bank-1",
        cardSideId: "card-1",
        confidence: 0.7,
      }),
    );
  });
});
