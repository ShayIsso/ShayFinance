import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  approveGroup,
  rejectGroup,
  undoTransaction,
  approveGroups,
  type InboxStore,
  type InboxTransaction,
} from "@/lib/reconciliation/inbox-ops";
import type { CategoryRule } from "@/lib/categories/rules";

// ── Fake store factory ────────────────────────────────────────────────────────

function makeStore(overrides: Partial<InboxStore> = {}): InboxStore {
  return {
    getGroupMembers: vi.fn().mockResolvedValue([]),
    getGroupMembersByIds: vi.fn().mockResolvedValue(new Map()),
    confirmGroup: vi.fn().mockResolvedValue(undefined),
    clearGroup: vi.fn().mockResolvedValue(undefined),
    clearRows: vi.fn().mockResolvedValue(undefined),
    setCategory: vi.fn().mockResolvedValue(undefined),
    getCategoryIdByName: vi.fn().mockResolvedValue("cat-transfer"),
    getRulesOrderedByPriority: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeTxn(overrides: Partial<InboxTransaction> = {}): InboxTransaction {
  return {
    id: "txn-1",
    bankAccountId: "ba-1",
    bankType: "discount",
    date: "2026-01-15",
    description: "חיוב ויזה",
    chargedAmount: -300,
    categoryId: null,
    reconciliationGroupId: "group-1",
    reconciliationRole: "settlement_lump",
    reconciliationConfidence: 0.95,
    reconciliationConfirmedAt: new Date("2026-01-15T10:00:00Z"),
    createdAt: new Date("2026-01-15T10:00:00Z"),
    ...overrides,
  };
}

function makeDetail(id: string, overrides: Partial<InboxTransaction> = {}): InboxTransaction {
  return makeTxn({
    id,
    bankType: "max",
    reconciliationRole: "settlement_detail",
    reconciliationConfirmedAt: new Date("2026-01-15T10:00:00Z"),
    ...overrides,
  });
}

function makeTransferPair(bankId: string, cardId: string): [InboxTransaction, InboxTransaction] {
  const bank: InboxTransaction = makeTxn({
    id: bankId,
    bankType: "discount",
    reconciliationRole: "transfer_pair",
    description: "העברה",
  });
  const card: InboxTransaction = makeTxn({
    id: cardId,
    bankType: "max",
    reconciliationRole: "transfer_pair",
    description: "ביט - חבר",
  });
  return [bank, card];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("approveGroup — P1 settlement", () => {
  it("confirms all members; lump retains settlement category from store", async () => {
    const lump = makeTxn({ id: "lump-1", reconciliationRole: "settlement_lump" });
    const detail1 = makeDetail("detail-1");
    const detail2 = makeDetail("detail-2");

    const store = makeStore({
      getGroupMembers: vi.fn().mockResolvedValue([lump, detail1, detail2]),
    });

    const result = await approveGroup("group-1", store);

    expect(result.error).toBeUndefined();
    expect(store.confirmGroup).toHaveBeenCalledOnce();
    const [calledGroupId, , transferCatId] = vi.mocked(store.confirmGroup).mock.calls[0];
    expect(calledGroupId).toBe("group-1");
    // P1: no transfer category flip needed
    expect(transferCatId).toBeNull();
  });
});

describe("approveGroup — P2 transfer_pair", () => {
  it("confirms both members; bankSide identified and transfer category passed", async () => {
    const [bank, card] = makeTransferPair("bank-1", "card-1");
    // card has "ביט" in description => cardSide; bank is bankSide

    const store = makeStore({
      getGroupMembers: vi.fn().mockResolvedValue([bank, card]),
      getCategoryIdByName: vi.fn().mockResolvedValue("cat-transfer-id"),
    });

    const result = await approveGroup("group-1", store);

    expect(result.error).toBeUndefined();
    expect(store.confirmGroup).toHaveBeenCalledOnce();
    const [, , transferCatId] = vi.mocked(store.confirmGroup).mock.calls[0];
    expect(transferCatId).toBe("cat-transfer-id");
  });
});

describe("rejectGroup", () => {
  it("clears all reconciliation columns on all group members", async () => {
    const lump = makeTxn({ id: "lump-1", reconciliationRole: "settlement_lump" });
    const detail = makeDetail("detail-1");

    const store = makeStore({
      getGroupMembers: vi.fn().mockResolvedValue([lump, detail]),
    });

    const result = await rejectGroup("group-1", store);

    expect(result.error).toBeUndefined();
    expect(store.clearGroup).toHaveBeenCalledWith(["group-1"]);
  });

  it("re-runs rule engine and sets new categories on all members", async () => {
    const rules: CategoryRule[] = [
      {
        id: "rule-1",
        categoryId: "cat-expense",
        matchType: "contains",
        pattern: "חיוב",
        priority: 0,
      },
    ];
    const lump = makeTxn({ id: "lump-1", description: "חיוב ויזה" });
    const detail = makeDetail("detail-1", { description: "קפה" });

    const store = makeStore({
      getGroupMembers: vi.fn().mockResolvedValue([lump, detail]),
      getRulesOrderedByPriority: vi.fn().mockResolvedValue(rules),
    });

    await rejectGroup("group-1", store);

    const setCategoryCalls = vi.mocked(store.setCategory).mock.calls;
    // lump matches "חיוב" rule
    expect(setCategoryCalls.some(([id, catId]) => id === "lump-1" && catId === "cat-expense")).toBe(
      true,
    );
    // detail "קפה" doesn't match; gets null
    expect(setCategoryCalls.some(([id, catId]) => id === "detail-1" && catId === null)).toBe(true);
  });
});

describe("undoTransaction", () => {
  it("clears row, re-runs rule engine, updates category", async () => {
    const lump = makeTxn({ id: "lump-1", description: "חיוב ויזה" });
    const detail1 = makeDetail("detail-1");
    const detail2 = makeDetail("detail-2");
    const allMembers = [lump, detail1, detail2];

    const rules: CategoryRule[] = [
      {
        id: "rule-1",
        categoryId: "cat-settle",
        matchType: "contains",
        pattern: "חיוב",
        priority: 0,
      },
    ];

    const store = makeStore({
      getRulesOrderedByPriority: vi.fn().mockResolvedValue(rules),
    });

    const result = await undoTransaction("lump-1", allMembers, store);

    expect(result.error).toBeUndefined();
    expect(store.clearRows).toHaveBeenCalledWith(["lump-1"]);
    // lump matches rule
    expect(store.setCategory).toHaveBeenCalledWith("lump-1", "cat-settle");
  });

  it("group becomes singleton after undo — clears remaining member too", async () => {
    const lump = makeTxn({ id: "lump-1" });
    const detail = makeDetail("detail-1");
    const allMembers = [lump, detail];

    const store = makeStore({
      getRulesOrderedByPriority: vi.fn().mockResolvedValue([]),
    });

    await undoTransaction("lump-1", allMembers, store);

    // Both rows cleared (each call is clearRows([id]))
    const clearedIds = vi.mocked(store.clearRows).mock.calls.flatMap(([ids]) => ids);
    expect(clearedIds).toContain("lump-1");
    expect(clearedIds).toContain("detail-1");
  });

  it("group with 3+ members survives after single undo — other members not cleared", async () => {
    const lump = makeTxn({ id: "lump-1", reconciliationRole: "settlement_lump" });
    const detail1 = makeDetail("detail-1");
    const detail2 = makeDetail("detail-2");
    const detail3 = makeDetail("detail-3");
    const allMembers = [lump, detail1, detail2, detail3];

    const store = makeStore({
      getRulesOrderedByPriority: vi.fn().mockResolvedValue([]),
    });

    await undoTransaction("lump-1", allMembers, store);

    // Only lump-1 cleared; remaining 3 details survive
    const clearedIds = vi.mocked(store.clearRows).mock.calls.flatMap(([ids]) => ids);
    expect(clearedIds).toEqual(["lump-1"]);
    expect(clearedIds).not.toContain("detail-1");
    expect(clearedIds).not.toContain("detail-2");
    expect(clearedIds).not.toContain("detail-3");
  });

  it("returns error when txn not found in group members", async () => {
    const store = makeStore();
    const result = await undoTransaction("nonexistent", [], store);
    expect(result.error).toBeTruthy();
  });
});

describe("approveGroups — bulk", () => {
  it("processes all 3 groups", async () => {
    const groups = ["group-1", "group-2", "group-3"];

    const makeMembers = (groupId: string) => [
      makeTxn({ reconciliationGroupId: groupId, reconciliationRole: "settlement_lump" }),
      makeDetail("detail-" + groupId, { reconciliationGroupId: groupId }),
    ];

    const store = makeStore({
      getGroupMembers: vi
        .fn()
        .mockImplementation((groupId: string) => Promise.resolve(makeMembers(groupId))),
    });

    const result = await approveGroups(groups, store);

    expect(result.error).toBeUndefined();
    expect(store.confirmGroup).toHaveBeenCalledTimes(3);
    const confirmedGroupIds = vi.mocked(store.confirmGroup).mock.calls.map(([g]) => g);
    expect(confirmedGroupIds).toEqual(expect.arrayContaining(groups));
  });
});
