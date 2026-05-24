import { describe, it, expect, vi } from "vitest";
import { applyP3InterAccount } from "../apply-p3";
import type { P3InterAccountCandidate } from "../types";
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
  overrides: Partial<P3InterAccountCandidate> = {},
): P3InterAccountCandidate {
  return {
    kind: "p3_inter_account",
    outgoingSide: {
      id: "out-1",
      bankAccountId: "ba-1",
      bankType: "discount",
      date: "2026-01-15",
      chargedAmount: -250,
      description: "ביט",
      categoryId: null,
      reconciliationGroupId: null,
    },
    incomingSide: {
      id: "in-1",
      bankAccountId: "ba-2",
      bankType: "max",
      date: "2026-01-15",
      chargedAmount: 250,
      description: "ביט",
      categoryId: null,
      reconciliationGroupId: null,
    },
    confidence,
    ...overrides,
  };
}

describe("applyP3InterAccount", () => {
  it("returns {autoApplied:0, queued:0} for empty candidates and makes no store calls", async () => {
    const store = makeStore();
    const result = await applyP3InterAccount([], store);

    expect(result).toEqual({ autoApplied: 0, queued: 0 });
    expect(store.applyAutoInterAccount).not.toHaveBeenCalled();
    expect(store.queueInterAccount).not.toHaveBeenCalled();
  });

  it("auto-applies when confidence >= 0.95 (future-proofing), calls applyAutoInterAccount with correct args", async () => {
    const store = makeStore({
      getCategoryIdByName: vi.fn().mockResolvedValue("cat-transfer-id"),
    });
    const candidate = makeCandidate(0.95);

    const result = await applyP3InterAccount([candidate], store);

    expect(result.autoApplied).toBe(1);
    expect(result.queued).toBe(0);
    expect(store.applyAutoInterAccount).toHaveBeenCalledOnce();
    expect(store.applyAutoInterAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        outgoingSideId: "out-1",
        incomingSideId: "in-1",
        transferCategoryId: "cat-transfer-id",
      }),
    );
    expect(store.queueInterAccount).not.toHaveBeenCalled();
  });

  it("queues when confidence is 0.9 (typical P3 max, below auto-apply threshold)", async () => {
    const store = makeStore();
    const candidate = makeCandidate(0.9);

    const result = await applyP3InterAccount([candidate], store);

    expect(result.autoApplied).toBe(0);
    expect(result.queued).toBe(1);
    expect(store.queueInterAccount).toHaveBeenCalledOnce();
    expect(store.applyAutoInterAccount).not.toHaveBeenCalled();
  });

  it("queues when confidence is 0.7 (single-sided marker), passes correct IDs to queueInterAccount", async () => {
    const store = makeStore();
    const candidate = makeCandidate(0.7);

    await applyP3InterAccount([candidate], store);

    expect(store.queueInterAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        outgoingSideId: "out-1",
        incomingSideId: "in-1",
        confidence: 0.7,
      }),
    );
  });

  it("uses distinct groupIds for separate candidates", async () => {
    const store = makeStore();
    const candidate1 = makeCandidate(0.9);
    const candidate2 = makeCandidate(0.9, {
      outgoingSide: { ...candidate1.outgoingSide, id: "out-2" },
    });

    await applyP3InterAccount([candidate1, candidate2], store);

    const calls = vi.mocked(store.queueInterAccount).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].groupId).not.toBe(calls[1][0].groupId);
  });

  it("falls back to queue when transfer category is not found, even if confidence >= 0.95", async () => {
    const store = makeStore({ getCategoryIdByName: vi.fn().mockResolvedValue(null) });
    const candidate = makeCandidate(0.95);

    const result = await applyP3InterAccount([candidate], store);

    expect(result.autoApplied).toBe(0);
    expect(result.queued).toBe(1);
    expect(store.queueInterAccount).toHaveBeenCalledOnce();
  });
});
