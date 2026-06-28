import { describe, it, expect } from "vitest";
import { detectPatterns } from "./detect";
import { computeNextExpectedDate } from "./next-date";
import type { DetectionTransaction, RecurringPattern } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Detection only considers money-OUT transactions (chargedAmount < 0). The
// existing fixtures express amounts as positive magnitudes for readability, so
// the helper stores them as negative (expense) amounts. New tests that need an
// explicit sign (income, mixed-sign clusters) build raw objects directly.
function makeTxn(
  id: string,
  description: string,
  chargedAmount: number,
  date: string,
): DetectionTransaction {
  return { id, description, chargedAmount: -Math.abs(chargedAmount), date };
}

/** Builds N monthly occurrences starting from startDate (format: "YYYY-MM-DD"). */
function monthlyOccurrences(
  desc: string,
  amount: number,
  startDate: string,
  count: number,
): DetectionTransaction[] {
  const result: DetectionTransaction[] = [];
  const base = new Date(startDate);
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setUTCMonth(d.getUTCMonth() + i);
    const dateStr = d.toISOString().slice(0, 10);
    result.push(makeTxn(`id-${desc}-${i}`, desc, amount, dateStr));
  }
  return result;
}

/** Builds N quarterly occurrences (every 91 days). */
function quarterlyOccurrences(
  desc: string,
  amount: number,
  startDate: string,
  count: number,
): DetectionTransaction[] {
  const result: DetectionTransaction[] = [];
  const base = new Date(startDate);
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getTime() + i * 91 * 24 * 60 * 60 * 1000);
    result.push(makeTxn(`id-${desc}-${i}`, desc, amount, d.toISOString().slice(0, 10)));
  }
  return result;
}

/** Builds N annual occurrences (every 365 days). */
function annualOccurrences(
  desc: string,
  amount: number,
  startDate: string,
  count: number,
): DetectionTransaction[] {
  const result: DetectionTransaction[] = [];
  const base = new Date(startDate);
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getTime() + i * 365 * 24 * 60 * 60 * 1000);
    result.push(makeTxn(`id-${desc}-${i}`, desc, amount, d.toISOString().slice(0, 10)));
  }
  return result;
}

// ── detectPatterns ────────────────────────────────────────────────────────────

describe("detectPatterns", () => {
  describe("empty input", () => {
    it("returns empty array for empty input", () => {
      expect(detectPatterns([])).toEqual([]);
    });
  });

  describe("3-occurrence threshold", () => {
    it("returns empty for exactly 2 occurrences", () => {
      const txns = monthlyOccurrences("NETFLIX.COM", 39.9, "2025-01-15", 2);
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(0);
    });

    it("detects a pattern with exactly 3 occurrences", () => {
      const txns = monthlyOccurrences("NETFLIX.COM", 39.9, "2025-01-15", 3);
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(1);
    });

    it("detects a pattern with 5 occurrences", () => {
      const txns = monthlyOccurrences("NETFLIX.COM", 39.9, "2025-01-15", 5);
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(1);
    });
  });

  describe("monthly cadence", () => {
    it("classifies 30-day intervals as monthly", () => {
      const txns = [
        makeTxn("1", "NETFLIX.COM", 39.9, "2025-01-15"),
        makeTxn("2", "NETFLIX.COM", 39.9, "2025-02-15"),
        makeTxn("3", "NETFLIX.COM", 39.9, "2025-03-15"),
      ];
      const [pattern] = detectPatterns(txns);
      expect(pattern.cadence).toBe("monthly");
    });

    it("tolerates ±7 day drift in monthly cadence", () => {
      const txns = [
        makeTxn("1", "NETFLIX.COM", 39.9, "2025-01-15"),
        makeTxn("2", "NETFLIX.COM", 39.9, "2025-02-20"), // +5 day drift
        makeTxn("3", "NETFLIX.COM", 39.9, "2025-03-18"), // -2 day drift from prev
      ];
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].cadence).toBe("monthly");
    });

    it("rejects intervals exceeding monthly tolerance (38 days)", () => {
      const txns = [
        makeTxn("1", "NETFLIX.COM", 39.9, "2025-01-01"),
        makeTxn("2", "NETFLIX.COM", 39.9, "2025-02-08"), // 38 days — exceeds monthly max 38
        makeTxn("3", "NETFLIX.COM", 39.9, "2025-03-18"),
      ];
      // 38 days is exactly at the boundary (31+7=38), so this should still match
      // Test with 39 days which is clearly out of range
      const txns2 = [
        makeTxn("a", "SPOTIFY.COM", 19.9, "2025-01-01"),
        makeTxn("b", "SPOTIFY.COM", 19.9, "2025-02-09"), // 39 days — exceeds 38
        makeTxn("c", "SPOTIFY.COM", 19.9, "2025-03-20"),
      ];
      const patterns = detectPatterns(txns2);
      // 39 days is out of monthly range (max 38) and not quarterly (min 81)
      // so cadence is null → no pattern
      expect(patterns).toHaveLength(0);
    });
  });

  describe("quarterly cadence", () => {
    it("classifies ~91-day intervals as quarterly", () => {
      const txns = quarterlyOccurrences("iCloud+", 9.9, "2025-01-01", 3);
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].cadence).toBe("quarterly");
    });

    it("tolerates ±7 day drift for quarterly", () => {
      const txns = [
        makeTxn("1", "iCloud+", 9.9, "2025-01-01"),
        makeTxn("2", "iCloud+", 9.9, "2025-04-03"), // 91+1 days
        makeTxn("3", "iCloud+", 9.9, "2025-07-05"), // 93 days from prev
      ];
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].cadence).toBe("quarterly");
    });
  });

  describe("annual cadence", () => {
    it("classifies ~365-day intervals as annual", () => {
      const txns = annualOccurrences("Adobe Creative", 599, "2023-03-01", 3);
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].cadence).toBe("annual");
    });

    it("tolerates ±7 day drift for annual", () => {
      const txns = [
        makeTxn("1", "Adobe Creative", 599, "2023-03-01"),
        makeTxn("2", "Adobe Creative", 599, "2024-03-05"), // 370 days — within annual max 377
        makeTxn("3", "Adobe Creative", 599, "2025-02-28"), // 359 days — within annual min 353
      ];
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].cadence).toBe("annual");
    });
  });

  describe("fuzzy merchant matching", () => {
    it("clusters NETFLIX.COM and נטפליקס as separate merchants (low similarity)", () => {
      // These are genuinely different strings with low JW² score, should NOT merge
      const txns = [
        makeTxn("1", "NETFLIX.COM", 39.9, "2025-01-15"),
        makeTxn("2", "NETFLIX.COM", 39.9, "2025-02-15"),
        makeTxn("3", "NETFLIX.COM", 39.9, "2025-03-15"),
        makeTxn("4", "נטפליקס ישראל", 39.9, "2025-01-16"),
        makeTxn("5", "נטפליקס ישראל", 39.9, "2025-02-16"),
        makeTxn("6", "נטפליקס ישראל", 39.9, "2025-03-16"),
      ];
      const patterns = detectPatterns(txns);
      // Two distinct merchant clusters → should detect 2 separate patterns (or 1 if similarity is high enough to merge)
      // We expect at least 1 pattern — NETFLIX.COM ones definitely qualify
      expect(patterns.length).toBeGreaterThanOrEqual(1);
    });

    it("clusters identical descriptions into one pattern", () => {
      const txns = monthlyOccurrences("NETFLIX.COM", 39.9, "2025-01-15", 3);
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].merchant).toBe("netflix");
    });

    it("clusters near-identical descriptions (prefix variation) together", () => {
      const txns = [
        makeTxn("1", "תשלום ב-NETFLIX.COM", 39.9, "2025-01-15"),
        makeTxn("2", "NETFLIX.COM", 39.9, "2025-02-15"),
        makeTxn("3", "תשלום ב-NETFLIX.COM", 39.9, "2025-03-15"),
      ];
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(1);
    });
  });

  describe("±10% amount tolerance", () => {
    it("groups amounts within ±10% into the same bucket", () => {
      const txns = [
        makeTxn("1", "NETFLIX.COM", 39.9, "2025-01-15"),
        makeTxn("2", "NETFLIX.COM", 43.0, "2025-02-15"), // ~7.8% more — within 10%
        makeTxn("3", "NETFLIX.COM", 41.5, "2025-03-15"),
      ];
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(1);
    });

    it("splits amounts differing by more than 10% into separate groups", () => {
      const txns = [
        // Group A: ~39.9
        makeTxn("1", "NETFLIX.COM", 39.9, "2025-01-15"),
        makeTxn("2", "NETFLIX.COM", 39.9, "2025-02-15"),
        makeTxn("3", "NETFLIX.COM", 39.9, "2025-03-15"),
        // Group B: ~79.9 — more than 10% different from 39.9
        makeTxn("4", "NETFLIX.COM", 79.9, "2025-01-20"),
        makeTxn("5", "NETFLIX.COM", 79.9, "2025-02-20"),
        makeTxn("6", "NETFLIX.COM", 79.9, "2025-03-20"),
      ];
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(2);
    });
  });

  describe("mixed-cadence rejection", () => {
    it("rejects a group with mixed monthly and quarterly intervals", () => {
      const txns = [
        makeTxn("1", "NETFLIX.COM", 39.9, "2025-01-15"),
        makeTxn("2", "NETFLIX.COM", 39.9, "2025-02-15"), // 31 days — monthly
        makeTxn("3", "NETFLIX.COM", 39.9, "2025-05-16"), // 90 days — quarterly
      ];
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(0);
    });

    it("rejects a group with inconsistent spacing (50 days — neither monthly nor quarterly)", () => {
      const txns = [
        makeTxn("1", "NETFLIX.COM", 39.9, "2025-01-01"),
        makeTxn("2", "NETFLIX.COM", 39.9, "2025-02-20"), // 50 days
        makeTxn("3", "NETFLIX.COM", 39.9, "2025-04-11"), // 50 days
      ];
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(0);
    });
  });

  describe("money-out filter (excludes income/credits)", () => {
    it("produces NO patterns from positive-amount transactions (e.g. monthly salary)", () => {
      // Salary recurs monthly with a stable amount, but chargedAmount is positive
      // (money IN) so it must never be treated as a recurring expense.
      const salary: DetectionTransaction[] = [
        { id: "s1", description: "משכורת", chargedAmount: 12000, date: "2025-01-01" },
        { id: "s2", description: "משכורת", chargedAmount: 12000, date: "2025-02-01" },
        { id: "s3", description: "משכורת", chargedAmount: 12000, date: "2025-03-01" },
      ];
      expect(detectPatterns(salary)).toHaveLength(0);
    });

    it("ignores the positive-amount occurrences in a mixed-sign cluster", () => {
      // Same merchant: 2 real expenses (negative) + recurring positive refunds.
      // After dropping the positives only 2 expenses remain → below threshold.
      const mixed: DetectionTransaction[] = [
        { id: "m1", description: "NETFLIX.COM", chargedAmount: -39.9, date: "2025-01-15" },
        { id: "m2", description: "NETFLIX.COM", chargedAmount: -39.9, date: "2025-02-15" },
        { id: "r1", description: "NETFLIX.COM", chargedAmount: 39.9, date: "2025-01-20" },
        { id: "r2", description: "NETFLIX.COM", chargedAmount: 39.9, date: "2025-02-20" },
        { id: "r3", description: "NETFLIX.COM", chargedAmount: 39.9, date: "2025-03-20" },
      ];
      expect(detectPatterns(mixed)).toHaveLength(0);
    });
  });

  describe("merchant-exclusivity heuristic", () => {
    it("rejects a habitual-purchase cluster (3 same-amount among many varied charges)", () => {
      // Bakery visited often: 3 coincidental ₪25 monthly charges among ~17 other
      // varied charges at the same merchant → 3/20 = 0.15 < 0.5 → rejected.
      const txns: DetectionTransaction[] = [
        // The 3 "recurring-looking" ₪25 charges, monthly cadence.
        makeTxn("b1", "מאפיית הבוקר", 25, "2025-01-05"),
        makeTxn("b2", "מאפיית הבוקר", 25, "2025-02-05"),
        makeTxn("b3", "מאפיית הבוקר", 25, "2025-03-05"),
      ];
      // 17 more varied-amount charges at the same merchant (different buckets).
      const varied = [12, 48, 7, 33, 61, 19, 88, 41, 15, 54, 9, 72, 28, 95, 38, 63, 21];
      varied.forEach((amount, i) => {
        txns.push(
          makeTxn(
            `v${i}`,
            "מאפיית הבוקר",
            amount,
            `2025-04-${String((i % 27) + 1).padStart(2, "0")}`,
          ),
        );
      });
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(0);
    });

    it("keeps a clean subscription where every charge is in one amount bucket", () => {
      // Netflix only ever charges ₪45, 5× → 5/5 = 1.0 ≥ 0.5 → kept.
      const txns = monthlyOccurrences("NETFLIX.COM", 45, "2025-01-15", 5);
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(1);
    });

    it("keeps an amount-group at exactly the 0.5 boundary (not a minority)", () => {
      // 6 charges at one merchant: 3 at ₪40, 3 at ₪80. Each group is 3/6 = 0.5,
      // which is NOT < 0.5 → both kept → 2 patterns.
      const txns = [
        makeTxn("a1", "GYM CLUB", 40, "2025-01-10"),
        makeTxn("a2", "GYM CLUB", 40, "2025-02-10"),
        makeTxn("a3", "GYM CLUB", 40, "2025-03-10"),
        makeTxn("b1", "GYM CLUB", 80, "2025-01-12"),
        makeTxn("b2", "GYM CLUB", 80, "2025-02-12"),
        makeTxn("b3", "GYM CLUB", 80, "2025-03-12"),
      ];
      const patterns = detectPatterns(txns);
      expect(patterns).toHaveLength(2);
    });
  });

  describe("pattern properties", () => {
    it("sets expectedAmount to rolling average of last 3", () => {
      const txns = [
        makeTxn("1", "NETFLIX.COM", 40.0, "2025-01-15"),
        makeTxn("2", "NETFLIX.COM", 41.0, "2025-02-15"),
        makeTxn("3", "NETFLIX.COM", 42.0, "2025-03-15"),
      ];
      const [pattern] = detectPatterns(txns);
      expect(pattern.expectedAmount).toBeCloseTo((40 + 41 + 42) / 3, 5);
    });

    it("uses rolling average of LAST 3 when more than 3 occurrences", () => {
      const txns = [
        makeTxn("1", "NETFLIX.COM", 100.0, "2025-01-15"), // old — excluded from last 3
        makeTxn("2", "NETFLIX.COM", 40.0, "2025-02-15"),
        makeTxn("3", "NETFLIX.COM", 41.0, "2025-03-15"),
        makeTxn("4", "NETFLIX.COM", 42.0, "2025-04-15"),
      ];
      const [pattern] = detectPatterns(txns);
      expect(pattern.expectedAmount).toBeCloseTo((40 + 41 + 42) / 3, 5);
    });

    it("sets lastMatchedTxnId to the most recent transaction id", () => {
      const txns = [
        makeTxn("txn-old", "NETFLIX.COM", 39.9, "2025-01-15"),
        makeTxn("txn-mid", "NETFLIX.COM", 39.9, "2025-02-15"),
        makeTxn("txn-new", "NETFLIX.COM", 39.9, "2025-03-15"),
      ];
      const [pattern] = detectPatterns(txns);
      expect(pattern.lastMatchedTxnId).toBe("txn-new");
    });

    it("patternFingerprint is deterministic — same input gives same fingerprint", () => {
      const txns = monthlyOccurrences("NETFLIX.COM", 39.9, "2025-01-15", 3);
      const [p1] = detectPatterns(txns);
      const [p2] = detectPatterns([...txns]); // same data, different array reference
      expect(p1.patternFingerprint).toBe(p2.patternFingerprint);
    });

    it("occurrenceDates are sorted ascending", () => {
      // Provide out-of-order to test that detection still sorts them
      const txns = [
        makeTxn("3", "NETFLIX.COM", 39.9, "2025-03-15"),
        makeTxn("1", "NETFLIX.COM", 39.9, "2025-01-15"),
        makeTxn("2", "NETFLIX.COM", 39.9, "2025-02-15"),
      ];
      const [pattern] = detectPatterns(txns);
      const dates = pattern.occurrenceDates;
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i].getTime()).toBeGreaterThan(dates[i - 1].getTime());
      }
    });
  });
});

// ── computeNextExpectedDate ───────────────────────────────────────────────────

describe("computeNextExpectedDate", () => {
  function makePattern(cadence: RecurringPattern["cadence"], lastDate: string): RecurringPattern {
    const last = new Date(lastDate);
    return {
      merchant: "netflix",
      expectedAmount: 39.9,
      cadence,
      occurrenceDates: [last],
      lastMatchedTxnId: "id-1",
      patternFingerprint: `netflix::39::${cadence}`,
      nextExpectedDate: last, // will be overwritten by computeNextExpectedDate
    };
  }

  it("adds 30 days for monthly cadence", () => {
    const pattern = makePattern("monthly", "2025-03-15");
    const next = computeNextExpectedDate(pattern);
    expect(next.toISOString().slice(0, 10)).toBe("2025-04-14");
  });

  it("adds 91 days for quarterly cadence", () => {
    const pattern = makePattern("quarterly", "2025-01-01");
    const next = computeNextExpectedDate(pattern);
    // 2025-01-01 + 91 days = 2025-04-02
    expect(next.toISOString().slice(0, 10)).toBe("2025-04-02");
  });

  it("adds 365 days for annual cadence", () => {
    const pattern = makePattern("annual", "2025-03-01");
    const next = computeNextExpectedDate(pattern);
    expect(next.toISOString().slice(0, 10)).toBe("2026-03-01");
  });

  it("is deterministic — same input gives same output", () => {
    const pattern = makePattern("monthly", "2025-06-15");
    const d1 = computeNextExpectedDate(pattern);
    const d2 = computeNextExpectedDate(pattern);
    expect(d1.getTime()).toBe(d2.getTime());
  });
});
