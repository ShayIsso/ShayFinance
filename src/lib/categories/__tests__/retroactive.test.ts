import { describe, it, expect, vi } from "vitest";
import {
  findMatchingUncategorizedTxns,
  previewRetroactiveApply,
  applyRetroactively,
  type UncategorizedTransaction,
  type RetroactiveStore,
} from "../retroactive";
import type { CategoryRule } from "../rules";

const rule = (
  override: Partial<CategoryRule> & Pick<CategoryRule, "matchType" | "pattern" | "categoryId">,
): CategoryRule => ({
  id: "rule-1",
  priority: 0,
  ...override,
});

const txn = (
  override: Partial<UncategorizedTransaction> &
    Pick<UncategorizedTransaction, "id" | "description">,
): UncategorizedTransaction => ({
  categoryId: null,
  ...override,
});

const makeStore = (
  foundRule: CategoryRule | null,
  txns: UncategorizedTransaction[],
): RetroactiveStore => ({
  getRuleById: vi.fn(async () => foundRule),
  getUncategorizedTransactions: vi.fn(async () => txns),
  categorizeTransactions: vi.fn(async (ids: string[]) => ids.length),
});

// ─── Pure function ────────────────────────────────────────────────────────────

describe("findMatchingUncategorizedTxns", () => {
  it('returns uncategorized tx matching "contains" rule', () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: "שופרסל דיל" })];
    expect(findMatchingUncategorizedTxns(r, txns)).toHaveLength(1);
  });

  it("excludes already-categorized tx even when pattern matches", () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: "שופרסל דיל", categoryId: "cat-other" })];
    expect(findMatchingUncategorizedTxns(r, txns)).toHaveLength(0);
  });

  it('returns uncategorized tx matching "starts_with" rule', () => {
    const r = rule({ matchType: "starts_with", pattern: "אמזון", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: 'אמזון ישראל בע"מ' })];
    expect(findMatchingUncategorizedTxns(r, txns)).toHaveLength(1);
  });

  it('returns uncategorized tx matching "exact" rule', () => {
    const r = rule({ matchType: "exact", pattern: "תחבורה ציבורית", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: "תחבורה ציבורית" })];
    expect(findMatchingUncategorizedTxns(r, txns)).toHaveLength(1);
  });

  it('returns uncategorized tx matching "regex" rule', () => {
    const r = rule({ matchType: "regex", pattern: "^שופרסל", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: "שופרסל דיל רחובות" })];
    expect(findMatchingUncategorizedTxns(r, txns)).toHaveLength(1);
  });

  it("returns empty array when no pattern matches", () => {
    const r = rule({ matchType: "contains", pattern: "נטפליקס", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: "שופרסל דיל" })];
    expect(findMatchingUncategorizedTxns(r, txns)).toHaveLength(0);
  });

  it("returns only uncategorized matching txns from a mixed list", () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-1" });
    const txns = [
      txn({ id: "t1", description: "שופרסל דיל" }), // uncategorized + match
      txn({ id: "t2", description: "שופרסל הנגב", categoryId: "cat-x" }), // categorized + match → excluded
      txn({ id: "t3", description: "רמי לוי" }), // uncategorized + no match → excluded
    ];
    const result = findMatchingUncategorizedTxns(r, txns);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
  });

  it("returns empty array for empty input", () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-1" });
    expect(findMatchingUncategorizedTxns(r, [])).toHaveLength(0);
  });

  it("matching is case-insensitive", () => {
    const r = rule({ matchType: "contains", pattern: "AMAZON", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: "amazon prime monthly" })];
    expect(findMatchingUncategorizedTxns(r, txns)).toHaveLength(1);
  });
});

// ─── Store-backed: previewRetroactiveApply ────────────────────────────────────

describe("previewRetroactiveApply", () => {
  it("returns { count: 0 } when rule is not found", async () => {
    const store = makeStore(null, []);
    const result = await previewRetroactiveApply("missing-id", store);
    expect(result).toEqual({ count: 0 });
  });

  it("returns correct count of uncategorized matching transactions", async () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-1" });
    const txns = [
      txn({ id: "t1", description: "שופרסל דיל" }),
      txn({ id: "t2", description: "שופרסל הנגב" }),
      txn({ id: "t3", description: "רמי לוי" }),
    ];
    const store = makeStore(r, txns);
    const result = await previewRetroactiveApply("rule-1", store);
    expect(result).toEqual({ count: 2 });
  });

  it("returns { count: 0 } when no transactions match", async () => {
    const r = rule({ matchType: "contains", pattern: "נטפליקס", categoryId: "cat-1" });
    const store = makeStore(r, [txn({ id: "t1", description: "שופרסל דיל" })]);
    const result = await previewRetroactiveApply("rule-1", store);
    expect(result).toEqual({ count: 0 });
  });
});

// ─── Store-backed: applyRetroactively ────────────────────────────────────────

describe("applyRetroactively", () => {
  it("returns { applied: 0 } and does not call store when rule not found", async () => {
    const store = makeStore(null, []);
    const result = await applyRetroactively("missing-id", store);
    expect(result).toEqual({ applied: 0 });
    expect(store.categorizeTransactions).not.toHaveBeenCalled();
  });

  it("calls categorizeTransactions with correct ids and categoryId", async () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-1" });
    const txns = [
      txn({ id: "t1", description: "שופרסל דיל" }),
      txn({ id: "t2", description: "שופרסל הנגב" }),
    ];
    const store = makeStore(r, txns);
    await applyRetroactively("rule-1", store);
    expect(store.categorizeTransactions).toHaveBeenCalledWith(["t1", "t2"], "cat-1");
  });

  it("returns { applied: 0 } and skips DB call when no matches", async () => {
    const r = rule({ matchType: "contains", pattern: "נטפליקס", categoryId: "cat-1" });
    const store = makeStore(r, [txn({ id: "t1", description: "שופרסל דיל" })]);
    const result = await applyRetroactively("rule-1", store);
    expect(result).toEqual({ applied: 0 });
    expect(store.categorizeTransactions).not.toHaveBeenCalled();
  });

  it("returns applied count from store", async () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-1" });
    const txns = [
      txn({ id: "t1", description: "שופרסל דיל" }),
      txn({ id: "t2", description: "שופרסל הנגב" }),
      txn({ id: "t3", description: "שופרסל נגב" }),
    ];
    const store = makeStore(r, txns);
    const result = await applyRetroactively("rule-1", store);
    expect(result).toEqual({ applied: 3 });
  });
});
