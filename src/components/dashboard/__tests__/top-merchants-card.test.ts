import { describe, it, expect } from "vitest";
import { computeMerchantBarPercents } from "@/components/dashboard/top-merchants-card";
import type { TopMerchant } from "@/lib/analytics";

describe("computeMerchantBarPercents", () => {
  it("returns an empty array for an empty merchant list", () => {
    expect(computeMerchantBarPercents([])).toEqual([]);
  });

  it("gives the top (max) row a full 100% bar", () => {
    const merchants: TopMerchant[] = [
      { merchant: "a", amount: 1000 },
      { merchant: "b", amount: 500 },
    ];
    const percents = computeMerchantBarPercents(merchants);
    expect(percents[0]).toBe(100);
    expect(percents[1]).toBe(50);
  });

  it("scales every row relative to the list's own max, not a fixed constant", () => {
    const merchants: TopMerchant[] = [
      { merchant: "a", amount: 40 },
      { merchant: "b", amount: 10 },
    ];
    expect(computeMerchantBarPercents(merchants)).toEqual([100, 25]);
  });

  it("returns all zeros when every amount is zero (no divide-by-zero NaN)", () => {
    const merchants: TopMerchant[] = [
      { merchant: "a", amount: 0 },
      { merchant: "b", amount: 0 },
    ];
    expect(computeMerchantBarPercents(merchants)).toEqual([0, 0]);
  });

  it("clamps a stray negative amount to a 0% bar instead of a negative width", () => {
    const merchants: TopMerchant[] = [
      { merchant: "a", amount: 100 },
      { merchant: "b", amount: -5 },
    ];
    const percents = computeMerchantBarPercents(merchants);
    expect(percents[1]).toBe(0);
  });

  it("is order-preserving (does not re-sort the already-ranked input)", () => {
    const merchants: TopMerchant[] = [
      { merchant: "z", amount: 10 },
      { merchant: "a", amount: 90 },
    ];
    const percents = computeMerchantBarPercents(merchants);
    // Index 0 stays "z" (10/90) even though it is not the max.
    expect(percents[0]).toBeCloseTo((10 / 90) * 100, 5);
    expect(percents[1]).toBe(100);
  });
});
