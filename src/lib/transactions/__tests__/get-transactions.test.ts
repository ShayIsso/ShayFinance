import { describe, it, expect } from "vitest";
import {
  resolveCategoryFilter,
  buildPaginatedResult,
  expandCategoryFilter,
  type PaginatedResult,
} from "../index";
import { transactionFiltersSchema } from "../schemas";

describe("resolveCategoryFilter", () => {
  it("returns uncategorized mode when uncategorized is true", () => {
    expect(resolveCategoryFilter({ uncategorized: true })).toEqual({ mode: "uncategorized" });
  });

  it("ignores categoryId when uncategorized is true (uncategorized wins)", () => {
    expect(resolveCategoryFilter({ uncategorized: true, categoryId: "cat-1" })).toEqual({
      mode: "uncategorized",
    });
  });

  it("returns category mode when only categoryId is set", () => {
    expect(resolveCategoryFilter({ categoryId: "cat-1" })).toEqual({
      mode: "category",
      categoryId: "cat-1",
    });
  });

  it("returns all mode when neither is set", () => {
    expect(resolveCategoryFilter({})).toEqual({ mode: "all" });
  });

  it("returns all mode when uncategorized is false and no categoryId", () => {
    expect(resolveCategoryFilter({ uncategorized: false })).toEqual({ mode: "all" });
  });

  it("returns needsReview mode when needsReview is true", () => {
    expect(resolveCategoryFilter({ needsReview: true })).toEqual({ mode: "needsReview" });
  });

  it("needsReview wins over uncategorized and categoryId", () => {
    expect(
      resolveCategoryFilter({ needsReview: true, uncategorized: true, categoryId: "cat-1" }),
    ).toEqual({ mode: "needsReview" });
  });
});

describe("buildPaginatedResult", () => {
  it("assembles the response shape and passes data through", () => {
    const data = [{ id: "a" }, { id: "b" }];
    const result: PaginatedResult<{ id: string }> = buildPaginatedResult(data, 42, 2, 50);
    expect(result).toEqual({ data, total: 42, page: 2, pageSize: 50 });
    expect(result.data).toBe(data);
  });

  it("handles an empty page", () => {
    expect(buildPaginatedResult([], 0, 1, 25)).toEqual({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
  });
});

describe("transactionFiltersSchema uncategorized parsing", () => {
  it('parses "true" to boolean true', () => {
    const parsed = transactionFiltersSchema.parse({ uncategorized: "true" });
    expect(parsed.uncategorized).toBe(true);
  });

  it('parses "false" to boolean false (not coerced to true)', () => {
    const parsed = transactionFiltersSchema.parse({ uncategorized: "false" });
    expect(parsed.uncategorized).toBe(false);
  });

  it("defaults to false (undefined transformed) when omitted", () => {
    const parsed = transactionFiltersSchema.parse({});
    expect(parsed.uncategorized).toBe(false);
  });

  it("rejects an invalid uncategorized value with a Hebrew message", () => {
    const result = transactionFiltersSchema.safeParse({ uncategorized: "yes" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("uncategorized חייב להיות true או false");
    }
  });
});

describe("transactionFiltersSchema needsReview parsing", () => {
  it('parses "true" to boolean true', () => {
    const parsed = transactionFiltersSchema.parse({ needsReview: "true" });
    expect(parsed.needsReview).toBe(true);
  });

  it("defaults to false when omitted", () => {
    const parsed = transactionFiltersSchema.parse({});
    expect(parsed.needsReview).toBe(false);
  });

  it("rejects an invalid needsReview value with a Hebrew message", () => {
    const result = transactionFiltersSchema.safeParse({ needsReview: "yes" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("needsReview חייב להיות true או false");
    }
  });
});

describe("expandCategoryFilter", () => {
  // Group g1 owns leaves l1, l2; l3 is a root leaf (absent from the index).
  const groupLeafIds = new Map<string, string[]>([["g1", ["l1", "l2"]]]);

  it("expands a group to its leaf ids (subtree filtering, #174)", () => {
    expect(expandCategoryFilter("g1", groupLeafIds)).toEqual(["l1", "l2"]);
  });

  it("matches a leaf against itself when it is not a group", () => {
    expect(expandCategoryFilter("l3", groupLeafIds)).toEqual(["l3"]);
  });

  it("matches an unknown id against itself", () => {
    expect(expandCategoryFilter("missing", groupLeafIds)).toEqual(["missing"]);
  });

  it("falls back to self for a group with an empty leaf list", () => {
    expect(expandCategoryFilter("g-empty", new Map([["g-empty", []]]))).toEqual(["g-empty"]);
  });
});
