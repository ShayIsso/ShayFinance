import { describe, it, expect } from "vitest";
import { categorize, matchesRule, type CategoryRule } from "../rules";

describe("matchesRule", () => {
  it("matches contains case-insensitively", () => {
    expect(matchesRule("contains", "DEMO", "buy at demomarket")).toBe(true);
    expect(matchesRule("contains", "xyz", "buy at demomarket")).toBe(false);
  });

  it("matches starts_with case-insensitively", () => {
    expect(matchesRule("starts_with", "DEMO", "demomarket order")).toBe(true);
    expect(matchesRule("starts_with", "demo", "buy demomarket")).toBe(false);
  });

  it("matches exact case-insensitively", () => {
    expect(matchesRule("exact", "DEMO", "demo")).toBe(true);
    expect(matchesRule("exact", "DEMO", "demo tel aviv")).toBe(false);
  });

  it("matches regex case-insensitively", () => {
    expect(matchesRule("regex", "מזומן|משיכה", "משיכה מהחשבון")).toBe(true);
    expect(matchesRule("regex", "מזומן|משיכה", "קניה")).toBe(false);
  });
});

const rule = (
  override: Partial<CategoryRule> & Pick<CategoryRule, "matchType" | "pattern" | "categoryId">,
): CategoryRule => ({
  id: "00000000-0000-0000-0000-000000000001",
  priority: 0,
  ...override,
});

describe("categorize", () => {
  it('returns categoryId when "contains" pattern is found in description', () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "contains", pattern: "סופר", categoryId: "cat-1" }),
    ];
    expect(categorize("סופרפארם סניף ראשי", rules)).toBe("cat-1");
  });

  it('returns null when "contains" pattern is NOT in description', () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "contains", pattern: "סופר", categoryId: "cat-1" }),
    ];
    expect(categorize("מסעדת הדגים", rules)).toBeNull();
  });

  it('returns categoryId when "starts_with" pattern matches', () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "starts_with", pattern: "אמזון", categoryId: "cat-2" }),
    ];
    expect(categorize('אמזון ישראל בע"מ', rules)).toBe("cat-2");
  });

  it('returns null when "starts_with" pattern does not match start', () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "starts_with", pattern: "אמזון", categoryId: "cat-2" }),
    ];
    expect(categorize("רכישה אמזון", rules)).toBeNull();
  });

  it('returns categoryId when "exact" pattern matches description exactly', () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "exact", pattern: "תחבורה ציבורית", categoryId: "cat-3" }),
    ];
    expect(categorize("תחבורה ציבורית", rules)).toBe("cat-3");
  });

  it('returns null when "exact" pattern is only a substring', () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "exact", pattern: "תחבורה ציבורית", categoryId: "cat-3" }),
    ];
    expect(categorize('תחבורה ציבורית ת"א', rules)).toBeNull();
  });

  it('returns categoryId when "regex" pattern matches description', () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "regex", pattern: "^שופרסל", categoryId: "cat-4" }),
    ];
    expect(categorize("שופרסל דיל רחובות", rules)).toBe("cat-4");
  });

  it('returns null when "regex" pattern does not match', () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "regex", pattern: "^שופרסל", categoryId: "cat-4" }),
    ];
    expect(categorize("רמי לוי שופרסל", rules)).toBeNull();
  });

  it("higher priority rule wins over lower priority rule", () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-low", priority: 0 }),
      rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-high", priority: 10 }),
    ];
    expect(categorize("שופרסל דיל", rules)).toBe("cat-high");
  });

  it("first match wins — stops after the first matching rule", () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-A", priority: 5 }),
      rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-B", priority: 5 }),
    ];
    // Both have equal priority; first in sorted order (stable) wins
    expect(categorize("שופרסל דיל", rules)).toBe("cat-A");
  });

  it("returns null when no rule matches", () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "contains", pattern: "סופר", categoryId: "cat-1" }),
    ];
    expect(categorize("העברה בנקאית", rules)).toBeNull();
  });

  it("matching is case-insensitive — Hebrew and Latin both work", () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "contains", pattern: "AMAZON", categoryId: "cat-5" }),
    ];
    expect(categorize("amazon prime monthly", rules)).toBe("cat-5");
  });

  it('case-insensitive "שופרסל" matches "שופרסל דיל"', () => {
    const rules: CategoryRule[] = [
      rule({ matchType: "contains", pattern: "שופרסל", categoryId: "cat-6" }),
    ];
    expect(categorize("שופרסל דיל", rules)).toBe("cat-6");
  });
});
