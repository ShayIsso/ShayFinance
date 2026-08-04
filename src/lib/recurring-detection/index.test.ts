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
    it("clusters cross-script Netflix variants (NETFLIX.COM and נטפליקס) as one merchant (#85)", () => {
      // Cross-script aliasing: these resolve to the same canonical brand, so
      // scoreSimilarity short-circuits to 1.0 and they cluster together.
      const txns = [
        makeTxn("1", "NETFLIX.COM", 39.9, "2025-01-15"),
        makeTxn("2", "נטפליקס ישראל", 39.9, "2025-02-15"),
        makeTxn("3", "NETFLIX.COM", 39.9, "2025-03-15"),
      ];
      const patterns = detectPatterns(txns);
      // Single merged merchant cluster → exactly one monthly pattern.
      expect(patterns).toHaveLength(1);
      expect(patterns[0].cadence).toBe("monthly");
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

    it("keeps both of a merchant's concurrent price regimes", () => {
      // 6 charges at one merchant: 3 at ₪40, 3 at ₪80. Two regimes, no incidental
      // charges — neither is weighed against the other, so both are kept.
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

// ── Recall: descriptor drift and price regimes (#237) ─────────────────────────
// Reproduces the two live recall failures from #237 with synthesized
// descriptors. The shapes are real; the strings are not bank data.
describe("descriptor drift and price regimes (#237)", () => {
  /** A standing order that switched branch descriptor AND price mid-history. */
  function standingOrderWithRegimeChange(): DetectionTransaction[] {
    const oldForm = 'הארבור מרכז פ"ת- הו"ק';
    const newForm = 'הארבור פ"ת דרום הו"ק';
    return [
      // Old regime: 8 monthly charges at 240.
      makeTxn("o1", oldForm, 240, "2025-05-20"),
      makeTxn("o2", oldForm, 240, "2025-06-20"),
      makeTxn("o3", oldForm, 240, "2025-07-20"),
      makeTxn("o4", oldForm, 240, "2025-08-20"),
      makeTxn("o5", oldForm, 240, "2025-09-17"),
      makeTxn("o6", oldForm, 240, "2025-10-17"),
      makeTxn("o7", oldForm, 240, "2025-11-17"),
      makeTxn("o8", oldForm, 240, "2025-12-17"),
      // Two incidental one-off charges at the same merchant, mid-switch.
      makeTxn("i1", 'הארבור פ"ת דרום-רגיל', 140, "2026-01-11"),
      makeTxn("i2", 'הארבור מרכז פ"ת-רגיל', 134, "2026-01-12"),
      // Successor regime: 6 monthly charges at 215, on the 17th.
      makeTxn("n1", newForm, 215, "2026-01-17"),
      makeTxn("n2", newForm, 215, "2026-02-17"),
      makeTxn("n3", newForm, 215, "2026-03-17"),
      makeTxn("n4", newForm, 215, "2026-04-17"),
      makeTxn("n5", newForm, 215, "2026-05-17"),
      makeTxn("n6", newForm, 215, "2026-06-17"),
      // A further small step, inside ±10% of BOTH regimes.
      makeTxn("n7", newForm, 225, "2026-07-17"),
    ];
  }

  it("detects the live successor regime of a standing order that changed branch and price", () => {
    const patterns = detectPatterns(standingOrderWithRegimeChange());
    expect(patterns).toHaveLength(1);
    expect(patterns[0].cadence).toBe("monthly");
    expect(patterns[0].occurrenceDates.length).toBeGreaterThanOrEqual(6);
  });

  it("anchors the detected regime on the CURRENT price, not the retired one", () => {
    const [pattern] = detectPatterns(standingOrderWithRegimeChange());
    expect(pattern.expectedAmount).toBeCloseTo(215, 5);
  });

  it("still rejects a habitual merchant whose same-amount run is drowned in one-offs", () => {
    // The guard the exclusivity ratio exists for: unlike a retired price regime,
    // one-off charges are never explained by a cadence of their own.
    const txns = [
      makeTxn("h1", "מכולת הפינה", 30, "2025-01-06"),
      makeTxn("h2", "מכולת הפינה", 30, "2025-02-06"),
      makeTxn("h3", "מכולת הפינה", 30, "2025-03-06"),
    ];
    [11, 47, 8, 74, 22, 96, 39, 61, 130, 155, 180, 210].forEach((amount, i) => {
      txns.push(makeTxn(`hv${i}`, "מכולת הפינה", amount, `2025-0${(i % 3) + 1}-${10 + i}`));
    });
    expect(detectPatterns(txns)).toHaveLength(0);
  });

  // Shape 2 — a card descriptor carrying a per-charge machine token. Every
  // charge is a distinct descriptor, so nothing may key off the raw string.
  it("names a detected series by its identity key, never one charge's token", () => {
    // The merchant reaches recurring_expenses as the upsert fingerprint, so a
    // per-charge token in it would mint a second row for an existing series.
    const [pattern] = detectPatterns([
      makeTxn("s1", "ORBITSND K7Q2M4     NORTHPORT   SE", 23.9, "2025-11-13"),
      makeTxn("s2", "ORBITSND K7Q2M9     NORTHPORT   SE", 23.9, "2025-12-13"),
      makeTxn("s3", "ORBITSND K7Q2N3     NORTHPORT   SE", 23.9, "2026-01-13"),
    ]);
    expect(pattern.merchant).toBe("orbitsnd northport se");
    expect(pattern.patternFingerprint).toBe("orbitsnd northport se::monthly");
  });

  it("fingerprints a tokenized series identically whichever charge arrives first", () => {
    const txns = [
      makeTxn("s1", "ORBITSND K7Q2M4     NORTHPORT   SE", 23.9, "2025-11-13"),
      makeTxn("s2", "ORBITSND K7Q2M9     NORTHPORT   SE", 23.9, "2025-12-13"),
      makeTxn("s3", "ORBITSND K7Q2N3     NORTHPORT   SE", 23.9, "2026-01-13"),
    ];
    const forward = detectPatterns(txns)[0].patternFingerprint;
    const reversed = detectPatterns([...txns].reverse())[0].patternFingerprint;
    expect(reversed).toBe(forward);
  });

  it("fingerprints a MIXED plain+tokenized family identically whichever form arrives first", () => {
    // The plain and tokenized forms key differently (only `sameMerchant` unites
    // them), so the cluster representative — and with it the upsert fingerprint —
    // must not depend on which form the scan happens to read first.
    const txns = [
      makeTxn("m1", "ORBITSND K7Q2M4     NORTHPORT   SE", 23.9, "2025-11-13"),
      makeTxn("m2", "ORBITSNDIL          NORTHPORT   SE", 23.9, "2025-12-13"),
      makeTxn("m3", "ORBITSNDIL          NORTHPORT   SE", 23.9, "2026-01-13"),
    ];
    const forward = detectPatterns(txns)[0].patternFingerprint;
    const reversed = detectPatterns([...txns].reverse())[0].patternFingerprint;
    expect(reversed).toBe(forward);
  });

  it("detects one series across a tokenized descriptor family mixed with the plain form", () => {
    const txns = [
      makeTxn("s1", "ORBITSNDIL          NORTHPORT   SE", 23.9, "2025-11-13"),
      makeTxn("s2", "ORBITSND K7Q2M4     NORTHPORT   SE", 23.9, "2025-12-13"),
      makeTxn("s3", "ORBITSND K7Q2M9     NORTHPORT   SE", 23.9, "2026-01-13"),
      makeTxn("s4", "ORBITSND K7Q2N3     NORTHPORT   SE", 23.9, "2026-02-13"),
      makeTxn("s5", "ORBITSNDIL          NORTHPORT   SE", 23.9, "2026-03-13"),
    ];
    const patterns = detectPatterns(txns);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].occurrenceDates).toHaveLength(5);
  });
});

describe("exclusivity boundary against incidental charges (#237)", () => {
  function runWithOneOffs(oneOffs: number[]): DetectionTransaction[] {
    const txns = [
      makeTxn("r1", "harbor market", 60, "2025-01-08"),
      makeTxn("r2", "harbor market", 60, "2025-02-08"),
      makeTxn("r3", "harbor market", 60, "2025-03-08"),
    ];
    oneOffs.forEach((amount, i) => {
      txns.push(makeTxn(`w${i}`, "harbor market", amount, `2025-04-${10 + i}`));
    });
    return txns;
  }

  it("keeps a run sitting exactly at the 0.5 boundary", () => {
    // 3 recurring charges against 3 incidental ones → 3/6 = 0.5, which is NOT
    // below the ratio, so it is kept.
    expect(detectPatterns(runWithOneOffs([20, 95, 150]))).toHaveLength(1);
  });

  it("rejects a run that falls just below the 0.5 boundary", () => {
    // One more incidental charge → 3/7 ≈ 0.43 → rejected.
    expect(detectPatterns(runWithOneOffs([20, 95, 150, 260]))).toHaveLength(0);
  });

  // Exempting every price regime from the ratio leaves cadence classification as
  // the only backstop against a merchant with two habitual price points. Pin it:
  // habitual visits are irregularly spaced, and irregular spacing is rejected.
  it("rejects two habitual price points that are not on a cadence", () => {
    const txns = [
      makeTxn("p1", "מזנון הרכבת", 30, "2025-03-03"),
      makeTxn("p2", "מזנון הרכבת", 30, "2025-03-07"),
      makeTxn("p3", "מזנון הרכבת", 30, "2025-03-12"),
      makeTxn("p4", "מזנון הרכבת", 30, "2025-03-19"),
      makeTxn("q1", "מזנון הרכבת", 52, "2025-03-05"),
      makeTxn("q2", "מזנון הרכבת", 52, "2025-03-10"),
      makeTxn("q3", "מזנון הרכבת", 52, "2025-03-14"),
      makeTxn("q4", "מזנון הרכבת", 52, "2025-03-21"),
    ];
    expect(detectPatterns(txns)).toHaveLength(0);
  });
});
