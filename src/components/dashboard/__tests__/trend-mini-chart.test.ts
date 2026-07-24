import { describe, it, expect } from "vitest";
import { computeTrendMiniLayout } from "@/components/dashboard/trend-mini-chart";

describe("computeTrendMiniLayout", () => {
  it("returns no bars and a centered zero line for an empty month list", () => {
    const layout = computeTrendMiniLayout([], 240, 64);
    expect(layout.bars).toEqual([]);
    expect(layout.zeroY).toBeCloseTo(32, 5);
  });

  it("returns no bars when the measured width is not yet known (0)", () => {
    const layout = computeTrendMiniLayout([{ netSavings: 500 }], 0, 64);
    expect(layout.bars).toEqual([]);
  });

  it("index-aligns one bar per month, evenly spanning the width", () => {
    const months = [{ netSavings: 100 }, { netSavings: 200 }, { netSavings: 300 }];
    const layout = computeTrendMiniLayout(months, 300, 64);
    expect(layout.bars).toHaveLength(3);
    // Centers land at slot*(i+0.5) for slot = width/n = 100.
    const centers = layout.bars.map((b) => b.x + b.width / 2);
    expect(centers[0]).toBeCloseTo(50, 5);
    expect(centers[1]).toBeCloseTo(150, 5);
    expect(centers[2]).toBeCloseTo(250, 5);
  });

  it("marks every month positive when all net-savings values are >= 0", () => {
    const months = [{ netSavings: 0 }, { netSavings: 50 }, { netSavings: 500 }];
    const layout = computeTrendMiniLayout(months, 300, 64);
    expect(layout.bars.every((b) => b.positive)).toBe(true);
  });

  it("marks negative months as not-positive and grows their bar down from the zero line", () => {
    const months = [{ netSavings: 1000 }, { netSavings: -1000 }];
    const layout = computeTrendMiniLayout(months, 200, 64);
    const [posBar, negBar] = layout.bars;
    expect(posBar.positive).toBe(true);
    expect(negBar.positive).toBe(false);
    // A symmetric +1000/-1000 pair around a zero baseline draws equal-height bars.
    expect(posBar.height).toBeCloseTo(negBar.height, 5);
    // The positive bar's top sits above the zero line; the negative bar's top sits at it.
    expect(posBar.y).toBeLessThan(layout.zeroY);
    expect(negBar.y).toBeCloseTo(layout.zeroY, 5);
  });

  it("keeps a visible minimum height for an exactly-zero month", () => {
    const layout = computeTrendMiniLayout([{ netSavings: 1000 }, { netSavings: 0 }], 200, 64);
    expect(layout.bars[1].height).toBeGreaterThanOrEqual(1);
  });

  it("clamps bar width between 2 and 14 px regardless of slot size", () => {
    const wide = computeTrendMiniLayout(
      Array.from({ length: 2 }, () => ({ netSavings: 1 })),
      400,
      64,
    );
    const narrow = computeTrendMiniLayout(
      Array.from({ length: 24 }, () => ({ netSavings: 1 })),
      100,
      64,
    );
    for (const b of [...wide.bars, ...narrow.bars]) {
      expect(b.width).toBeGreaterThanOrEqual(2);
      expect(b.width).toBeLessThanOrEqual(14);
    }
  });

  it("uses a flat zero-centered scale when every month is exactly zero", () => {
    const layout = computeTrendMiniLayout([{ netSavings: 0 }, { netSavings: 0 }], 200, 64);
    expect(layout.bars.every((b) => b.positive)).toBe(true);
    expect(layout.bars[0].y).toBeCloseTo(layout.zeroY, 5);
  });
});
