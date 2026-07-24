import { describe, it, expect } from "vitest";
import {
  getVisibleAttentionCounters,
  type AttentionCounts,
} from "@/components/dashboard/attention-counters";

const ALL_ZERO: AttentionCounts = {
  uncategorized: 0,
  needsReview: 0,
  anomalies: 0,
  reviewQueue: 0,
};

describe("getVisibleAttentionCounters", () => {
  it("omits every counter when all four are zero (the calm state)", () => {
    expect(getVisibleAttentionCounters(ALL_ZERO)).toEqual([]);
  });

  it("keeps fixed reading order and omits only the zero entries", () => {
    const counts: AttentionCounts = {
      uncategorized: 3,
      needsReview: 0,
      anomalies: 1,
      reviewQueue: 2,
    };
    const visible = getVisibleAttentionCounters(counts);
    expect(visible.map((c) => c.key)).toEqual(["uncategorized", "anomalies", "reviewQueue"]);
  });

  it("includes all four when every count is non-zero, uncapped", () => {
    const counts: AttentionCounts = {
      uncategorized: 1234,
      needsReview: 42,
      anomalies: 9999,
      reviewQueue: 7,
    };
    const visible = getVisibleAttentionCounters(counts);
    expect(visible.map((c) => c.key)).toEqual([
      "uncategorized",
      "needsReview",
      "anomalies",
      "reviewQueue",
    ]);
    expect(visible.map((c) => c.count)).toEqual([1234, 42, 9999, 7]);
  });

  it("resolves a schema-verified href per counter, not a guess", () => {
    const visible = getVisibleAttentionCounters({
      uncategorized: 1,
      needsReview: 1,
      anomalies: 1,
      reviewQueue: 1,
    });
    const hrefByKey = Object.fromEntries(visible.map((c) => [c.key, c.href]));
    expect(hrefByKey).toEqual({
      uncategorized: "/transactions?uncategorized=true",
      needsReview: "/transactions?needsReview=true",
      anomalies: "/subscriptions",
      reviewQueue: "/reconciliation",
    });
  });

  it("keeps a single counter alone when only one queue is non-empty", () => {
    const visible = getVisibleAttentionCounters({
      uncategorized: 0,
      needsReview: 0,
      anomalies: 5,
      reviewQueue: 0,
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].key).toBe("anomalies");
    expect(visible[0].count).toBe(5);
  });
});
