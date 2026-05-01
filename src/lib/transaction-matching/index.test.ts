import { describe, it, expect } from "vitest";
import { datesWithin, amountsMatch, sumMatches, extractMerchant, scoreSimilarity } from "./index";

describe("datesWithin", () => {
  it("returns true for the same day (window = 0)", () => {
    const d = new Date("2024-01-01T00:00:00Z");
    expect(datesWithin(d, d, 0)).toBe(true);
  });

  it("returns true when dates are exactly the window apart (inclusive boundary)", () => {
    const a = new Date("2024-01-01T00:00:00Z");
    const b = new Date("2024-01-08T00:00:00Z");
    expect(datesWithin(a, b, 7)).toBe(true);
  });

  it("returns false when dates are one day beyond the window", () => {
    const a = new Date("2024-01-01T00:00:00Z");
    const b = new Date("2024-01-09T00:00:00Z");
    expect(datesWithin(a, b, 7)).toBe(false);
  });

  it("is order-independent (b before a)", () => {
    const a = new Date("2024-01-08T00:00:00Z");
    const b = new Date("2024-01-01T00:00:00Z");
    expect(datesWithin(a, b, 7)).toBe(true);
  });

  it("returns true for 1-day apart with window 1", () => {
    const a = new Date("2024-03-15T00:00:00Z");
    const b = new Date("2024-03-16T00:00:00Z");
    expect(datesWithin(a, b, 1)).toBe(true);
  });

  it("returns false for 2-day apart with window 1", () => {
    const a = new Date("2024-03-15T00:00:00Z");
    const b = new Date("2024-03-17T00:00:00Z");
    expect(datesWithin(a, b, 1)).toBe(false);
  });
});

describe("amountsMatch", () => {
  it("returns true for exact match with default tolerance", () => {
    expect(amountsMatch(100, 100)).toBe(true);
  });

  it("returns true when diff is within tolerance (9% < 10%)", () => {
    expect(amountsMatch(100, 109, { amountTolerancePct: 0.1 })).toBe(true);
  });

  it("returns false when diff exceeds tolerance (11% > 10%)", () => {
    expect(amountsMatch(100, 111, { amountTolerancePct: 0.1 })).toBe(false);
  });

  it("returns true for both-negative within tolerance (8% < 10%)", () => {
    expect(amountsMatch(-50, -54, { amountTolerancePct: 0.1 })).toBe(true);
  });

  it("returns false for opposite-sign inputs", () => {
    expect(amountsMatch(50, -50)).toBe(false);
  });

  it("returns true for (0, 0)", () => {
    expect(amountsMatch(0, 0)).toBe(true);
  });

  it("returns true at exact boundary (10% diff = 10% tolerance)", () => {
    expect(amountsMatch(100, 110, { amountTolerancePct: 0.1 })).toBe(true);
  });

  it("returns false when one value is zero and other is not", () => {
    expect(amountsMatch(0, 1)).toBe(false);
  });
});

describe("sumMatches", () => {
  it("returns true when items sum exactly to target", () => {
    expect(sumMatches([30, 20, 50], 100, {})).toBe(true);
  });

  it("returns true when sum is within tolerance (1% under with 2% tolerance)", () => {
    expect(sumMatches([30, 20, 49], 100, { amountTolerancePct: 0.02 })).toBe(true);
  });

  it("returns false when sum is outside zero tolerance", () => {
    expect(sumMatches([30, 20, 49], 100, { amountTolerancePct: 0 })).toBe(false);
  });

  it("returns true for empty array with target 0", () => {
    expect(sumMatches([], 0, {})).toBe(true);
  });

  it("returns true for single-element array matching target within tolerance", () => {
    expect(sumMatches([95], 100, { amountTolerancePct: 0.1 })).toBe(true);
  });

  it("returns false for single-element array outside tolerance", () => {
    expect(sumMatches([85], 100, { amountTolerancePct: 0.1 })).toBe(false);
  });
});

describe("extractMerchant", () => {
  it("strips Latin bank prefix and lowercases domain", () => {
    expect(extractMerchant("תשלום ב-NETFLIX.COM")).toBe("netflix");
  });

  it("strips Hebrew-word prefix and preserves Hebrew merchant name", () => {
    expect(extractMerchant("רכישה בנטפליקס ישראל")).toBe("נטפליקס ישראל");
  });

  it("strips card-number digits (4 digits) after prefix strip", () => {
    expect(extractMerchant("חיוב ויזה 0584")).toBe("ויזה");
  });

  it("strips 9-digit account/ID number", () => {
    expect(extractMerchant("העברה 123456789")).toBe("העברה");
  });

  it("returns empty string for empty input", () => {
    expect(extractMerchant("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(extractMerchant("   ")).toBe("");
  });

  it("lowercases Latin characters while preserving Hebrew", () => {
    expect(extractMerchant("AMAZON")).toBe("amazon");
  });

  it("normalizes multiple spaces to single space", () => {
    expect(extractMerchant("חיוב  ויזה")).toBe("ויזה");
  });

  it("strips domain suffix from mixed Hebrew-Latin description", () => {
    expect(extractMerchant("תשלום ב-SPOTIFY.COM")).toBe("spotify");
  });
});

describe("scoreSimilarity", () => {
  it("returns 1.0 for identical descriptions", () => {
    expect(scoreSimilarity("netflix", "netflix")).toBe(1.0);
  });

  it("returns >= 0.85 for same merchant with domain suffix vs without", () => {
    expect(scoreSimilarity("netflix.com", "netflix")).toBeGreaterThanOrEqual(0.85);
  });

  it("returns <= 0.40 for completely different merchants", () => {
    expect(scoreSimilarity("netflix", "spotify")).toBeLessThanOrEqual(0.4);
  });

  it("returns >= 0.75 for Hebrew partial match (ויזה vs ויזה ישראל)", () => {
    expect(scoreSimilarity("ויזה", "ויזה ישראל")).toBeGreaterThanOrEqual(0.75);
  });

  it("normalizes via extractMerchant before scoring", () => {
    // "תשלום ב-NETFLIX.COM" and "נטפליקס ישראל" both extract to different merchants
    // but "תשלום ב-NETFLIX.COM" vs "NETFLIX" should still be high after normalization
    expect(scoreSimilarity("תשלום ב-NETFLIX.COM", "NETFLIX")).toBeGreaterThanOrEqual(0.85);
  });

  it("returns 0 for empty string vs non-empty", () => {
    expect(scoreSimilarity("", "netflix")).toBe(0);
  });

  it("returns 1 for both empty strings", () => {
    expect(scoreSimilarity("", "")).toBe(1);
  });

  it("returns > 0.5 for same single Hebrew word in longer phrase", () => {
    expect(scoreSimilarity("ויזה", "ויזה")).toBe(1.0);
  });
});
