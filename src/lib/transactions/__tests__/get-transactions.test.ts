import { describe, it, expect } from "vitest";
import { resolveCategoryFilter, buildPaginatedResult, type PaginatedResult } from "../index";
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
