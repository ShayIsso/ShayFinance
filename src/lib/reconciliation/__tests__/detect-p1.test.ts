import { describe, it, expect } from "vitest";
import { detectP1Settlement } from "../detect-p1";
import type { ReconciliationTransaction } from "../types";

// NOTE: v1 tests single card per provider only.
// Multi-card composition (two Max cards summing to one lump) is a v2 refinement.

let idCounter = 0;
function tx(overrides: Partial<ReconciliationTransaction> = {}): ReconciliationTransaction {
  idCounter++;
  return {
    id: `tx-${idCounter}`,
    bankAccountId: `ba-${idCounter}`,
    bankType: "discount",
    date: "2026-01-15",
    chargedAmount: -300,
    description: "חיוב ויזה",
    categoryId: null,
    reconciliationGroupId: null,
    ...overrides,
  };
}

describe("detectP1Settlement", () => {
  it("returns empty array for empty input", () => {
    expect(detectP1Settlement([])).toEqual([]);
  });

  it("returns empty when there are only bank-side transactions (no card-side)", () => {
    const lump = tx({ bankType: "discount", description: "חיוב ויזה", chargedAmount: -300 });
    expect(detectP1Settlement([lump])).toEqual([]);
  });

  it("returns empty when there are only card-side transactions (no bank lumps)", () => {
    const card1 = tx({ bankType: "max", description: "קפה", chargedAmount: -50 });
    const card2 = tx({ bankType: "max", description: "מסעדה", chargedAmount: -250 });
    expect(detectP1Settlement([card1, card2])).toEqual([]);
  });

  it("detects exact sum match with ויזה description → confidence 1.0", () => {
    const lump = tx({ bankType: "discount", description: "חיוב ויזה", chargedAmount: -300 });
    const card1 = tx({ bankType: "max", description: "קפה", chargedAmount: -100 });
    const card2 = tx({ bankType: "max", description: "מסעדה", chargedAmount: -200 });

    const result = detectP1Settlement([lump, card1, card2]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(1.0);
    expect(result[0].bankLump.id).toBe(lump.id);
    expect(result[0].cardDetails.map((c) => c.id)).toEqual(
      expect.arrayContaining([card1.id, card2.id]),
    );
  });

  it("detects מאסטרקארד description as strong marker → confidence 1.0", () => {
    const lump = tx({ bankType: "discount", description: "חיוב מאסטרקארד", chargedAmount: -500 });
    const card1 = tx({ bankType: "visaCal", description: "חנות", chargedAmount: -300 });
    const card2 = tx({ bankType: "visaCal", description: "סופר", chargedAmount: -200 });

    const result = detectP1Settlement([lump, card1, card2]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(1.0);
  });

  it("detects card last-4 pattern in description as strong marker", () => {
    const lump = tx({ bankType: "discount", description: "חיוב 4321", chargedAmount: -300 });
    const card1 = tx({ bankType: "max", description: "קפה", chargedAmount: -100 });
    const card2 = tx({ bankType: "max", description: "מסעדה", chargedAmount: -200 });

    const result = detectP1Settlement([lump, card1, card2]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(1.0);
  });

  it("drops candidate when description is generic (no provider marker) even on exact sum", () => {
    // "העברה" has no ויזה/מאסטרקארד marker and no חיוב — confidence too low
    const lump = tx({ bankType: "discount", description: "העברה", chargedAmount: -300 });
    const card1 = tx({ bankType: "max", description: "קפה", chargedAmount: -100 });
    const card2 = tx({ bankType: "max", description: "מסעדה", chargedAmount: -200 });

    const result = detectP1Settlement([lump, card1, card2]);

    expect(result).toHaveLength(0);
  });

  it("produces a candidate (queued range) when sum is within 10% but not 2% + strong marker", () => {
    // Sum is -297 vs -300 lump → 1% diff → within 2% → actually confidence 1.0
    // Let's make it 5% off: -285 vs -300 (5% diff)
    const lump = tx({ bankType: "discount", description: "חיוב ויזה", chargedAmount: -300 });
    const card1 = tx({ bankType: "max", description: "קפה", chargedAmount: -100 });
    const card2 = tx({ bankType: "max", description: "מסעדה", chargedAmount: -185 }); // sum -285 vs -300

    const result = detectP1Settlement([lump, card1, card2]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBeGreaterThanOrEqual(0.7);
    expect(result[0].confidence).toBeLessThan(0.95);
  });

  it("drops candidate when sum is off by more than 10%", () => {
    const lump = tx({ bankType: "discount", description: "חיוב ויזה", chargedAmount: -300 });
    const card1 = tx({ bankType: "max", description: "קפה", chargedAmount: -100 });
    const card2 = tx({ bankType: "max", description: "מסעדה", chargedAmount: -100 }); // sum -200, >33% off

    const result = detectP1Settlement([lump, card1, card2]);

    expect(result).toHaveLength(0);
  });

  it("returns empty when no card transactions fall within ±35 days of the bank lump", () => {
    const lump = tx({ bankType: "discount", date: "2026-01-15", chargedAmount: -300 });
    // Card transactions 40 days before the lump date
    const card1 = tx({ bankType: "max", date: "2025-12-06", chargedAmount: -300 });

    const result = detectP1Settlement([lump, card1]);

    expect(result).toHaveLength(0);
  });

  it("includes card transactions within ±35 days and excludes those outside", () => {
    const lump = tx({
      bankType: "discount",
      date: "2026-01-15",
      description: "חיוב ויזה",
      chargedAmount: -300,
    });
    // 34 days before: within window
    const cardIn = tx({ bankType: "max", date: "2025-12-12", chargedAmount: -300 });
    // 36 days before: outside window
    const cardOut = tx({ bankType: "max", date: "2025-12-10", chargedAmount: -300 });

    const resultWith = detectP1Settlement([lump, cardIn]);
    expect(resultWith).toHaveLength(1);

    const resultWithout = detectP1Settlement([lump, cardOut]);
    expect(resultWithout).toHaveLength(0);
  });

  it("skips transactions that already have a reconciliationGroupId (idempotency)", () => {
    const lump = tx({
      bankType: "discount",
      description: "חיוב ויזה",
      chargedAmount: -300,
      reconciliationGroupId: "already-grouped",
    });
    const card1 = tx({ bankType: "max", chargedAmount: -300 });

    const result = detectP1Settlement([lump, card1]);

    expect(result).toHaveLength(0);
  });

  it("skips already-reconciled card transactions (idempotency)", () => {
    const lump = tx({ bankType: "discount", description: "חיוב ויזה", chargedAmount: -300 });
    const card1 = tx({
      bankType: "max",
      chargedAmount: -300,
      reconciliationGroupId: "already-grouped",
    });

    // Card is already grouped so no unreconciled card txns remain in the cycle
    const result = detectP1Settlement([lump, card1]);

    expect(result).toHaveLength(0);
  });

  it("does not treat a Max-side transaction as a bank lump even if description contains חיוב ויזה", () => {
    const notALump = tx({
      bankType: "max",
      description: "חיוב ויזה",
      chargedAmount: -300,
    });
    const card1 = tx({ bankType: "max", chargedAmount: -300 });

    const result = detectP1Settlement([notALump, card1]);

    // notALump is on Max — it's a card-side txn, not a bank lump
    expect(result).toHaveLength(0);
  });

  it("degrades confidence when two bank lumps compete for the same card cycle", () => {
    const lump1 = tx({
      id: "lump-1",
      bankType: "discount",
      description: "חיוב ויזה",
      chargedAmount: -300,
      date: "2026-01-15",
    });
    const lump2 = tx({
      id: "lump-2",
      bankType: "discount",
      description: "חיוב ויזה",
      chargedAmount: -300,
      date: "2026-01-16",
    });
    const card1 = tx({ bankType: "max", chargedAmount: -100, date: "2026-01-10" });
    const card2 = tx({ bankType: "max", chargedAmount: -200, date: "2026-01-10" });

    const result = detectP1Settlement([lump1, lump2, card1, card2]);

    // Both lumps match the same card cycle → confidence degraded on both
    expect(result.every((c) => c.confidence < 1.0)).toBe(true);
  });
});
