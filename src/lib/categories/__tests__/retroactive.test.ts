import { describe, it, expect, vi } from "vitest";
import {
  findOverwritableMatches,
  previewRetroactiveApply,
  applyRetroactively,
  type OverwritableTransaction,
  type RetroactiveStore,
} from "../retroactive";
import { NotAssignableCategoryError } from "../errors";
import type { CategoryRule } from "../rules";

const rule = (
  override: Partial<CategoryRule> & Pick<CategoryRule, "matchType" | "pattern" | "categoryId">,
): CategoryRule => ({
  id: "rule-1",
  priority: 0,
  ...override,
});

const txn = (
  override: Partial<OverwritableTransaction> & Pick<OverwritableTransaction, "id" | "description">,
): OverwritableTransaction => ({
  categorySource: null,
  ...override,
});

const makeStore = (
  foundRule: CategoryRule | null,
  txns: OverwritableTransaction[],
  hasChildren: boolean = false,
): RetroactiveStore => ({
  getRuleById: vi.fn(async () => foundRule),
  getOverwritableTransactions: vi.fn(async () => txns),
  categorizeTransactions: vi.fn(async (ids: string[]) => ids.length),
  categoryHasChildren: vi.fn(async () => hasChildren),
});

// ─── Pure function ────────────────────────────────────────────────────────────

describe("findOverwritableMatches", () => {
  it('returns uncategorized tx matching "contains" rule', () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: "שופרסל דיל" })];
    expect(findOverwritableMatches(r, txns)).toHaveLength(1);
  });

  it("overwrites ai-sourced rows that match (the overwrite law extends to 'ai')", () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: "שופרסל דיל", categorySource: "ai" })];
    expect(findOverwritableMatches(r, txns)).toHaveLength(1);
  });

  it("never touches user, rule, or memory sourced rows even when the pattern matches", () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-1" });
    const txns = [
      txn({ id: "t-user", description: "שופרסל דיל", categorySource: "user" }),
      txn({ id: "t-rule", description: "שופרסל דיל", categorySource: "rule" }),
      txn({ id: "t-memory", description: "שופרסל דיל", categorySource: "memory" }),
    ];
    expect(findOverwritableMatches(r, txns)).toHaveLength(0);
  });

  it('returns uncategorized tx matching "starts_with" rule', () => {
    const r = rule({ matchType: "starts_with", pattern: "אמזון", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: 'אמזון ישראל בע"מ' })];
    expect(findOverwritableMatches(r, txns)).toHaveLength(1);
  });

  it('returns uncategorized tx matching "exact" rule', () => {
    const r = rule({ matchType: "exact", pattern: "תחבורה ציבורית", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: "תחבורה ציבורית" })];
    expect(findOverwritableMatches(r, txns)).toHaveLength(1);
  });

  it('returns uncategorized tx matching "regex" rule', () => {
    const r = rule({ matchType: "regex", pattern: "^שופרסל", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: "שופרסל דיל רחובות" })];
    expect(findOverwritableMatches(r, txns)).toHaveLength(1);
  });

  it("returns empty array when no pattern matches", () => {
    const r = rule({ matchType: "contains", pattern: "נטפליקס", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: "שופרסל דיל" })];
    expect(findOverwritableMatches(r, txns)).toHaveLength(0);
  });

  it("returns only overwritable matching txns from a mixed list", () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-1" });
    const txns = [
      txn({ id: "t1", description: "שופרסל דיל" }), // NULL + match
      txn({ id: "t2", description: "שופרסל הנגב", categorySource: "user" }), // protected + match → excluded
      txn({ id: "t3", description: "רמי לוי" }), // NULL + no match → excluded
      txn({ id: "t4", description: "שופרסל אונליין", categorySource: "ai" }), // ai + match → included
    ];
    const result = findOverwritableMatches(r, txns);
    expect(result.map((t) => t.id)).toEqual(["t1", "t4"]);
  });

  it("returns empty array for empty input", () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-1" });
    expect(findOverwritableMatches(r, [])).toHaveLength(0);
  });

  it("matching is case-insensitive", () => {
    const r = rule({ matchType: "contains", pattern: "AMAZON", categoryId: "cat-1" });
    const txns = [txn({ id: "t1", description: "amazon prime monthly" })];
    expect(findOverwritableMatches(r, txns)).toHaveLength(1);
  });
});

// ─── Store-backed: previewRetroactiveApply ────────────────────────────────────

describe("previewRetroactiveApply", () => {
  it("returns { count: 0 } when rule is not found", async () => {
    const store = makeStore(null, []);
    const result = await previewRetroactiveApply("missing-id", store);
    expect(result).toEqual({ count: 0 });
  });

  it("returns correct count of overwritable matching transactions", async () => {
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

  it("rejects and writes nothing when the rule targets a category with children (group, not leaf)", async () => {
    const r = rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-group" });
    const txns = [txn({ id: "t1", description: "שופרסל דיל" })];
    const store = makeStore(r, txns, true);

    await expect(applyRetroactively("rule-1", store)).rejects.toThrow(NotAssignableCategoryError);

    expect(store.categorizeTransactions).not.toHaveBeenCalled();
  });
});
