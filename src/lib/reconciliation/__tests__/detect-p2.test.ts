import { describe, it, expect } from "vitest";
import { detectP2Mirror } from "../detect-p2";
import type { ReconciliationTransaction } from "../types";

let idCounter = 0;

function tx(overrides: Partial<ReconciliationTransaction> = {}): ReconciliationTransaction {
  idCounter++;
  return {
    id: `tx-${idCounter}`,
    bankAccountId: `ba-${idCounter}`,
    bankType: "discount",
    date: "2026-01-15",
    chargedAmount: -50,
    description: "ביט",
    categoryId: null,
    reconciliationGroupId: null,
    ...overrides,
  };
}

describe("detectP2Mirror", () => {
  it("returns empty array for empty input", () => {
    expect(detectP2Mirror([])).toEqual([]);
  });

  it("detects a pair with Bit marker on both sides → confidence 0.95", () => {
    const bankSide = tx({
      id: "bank-1",
      bankAccountId: "ba-discount",
      bankType: "discount",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });
    const cardSide = tx({
      id: "card-1",
      bankAccountId: "ba-max",
      bankType: "max",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });

    const result = detectP2Mirror([bankSide, cardSide]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.95);
    expect(result[0].bankSide.id).toBe("bank-1");
    expect(result[0].cardSide.id).toBe("card-1");
    expect(result[0].kind).toBe("p2_mirror");
  });

  it("detects a pair with חיוב ישיר marker → confidence 0.95 when both sides carry it", () => {
    const bankSide = tx({
      id: "bank-2",
      bankAccountId: "ba-discount",
      bankType: "discount",
      description: "חיוב ישיר",
      chargedAmount: -120,
      date: "2026-02-10",
    });
    const cardSide = tx({
      id: "card-2",
      bankAccountId: "ba-max",
      bankType: "max",
      description: "חיוב ישיר",
      chargedAmount: -120,
      date: "2026-02-10",
    });

    const result = detectP2Mirror([bankSide, cardSide]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.95);
  });

  it("detects a pair with BIT (Latin, case-insensitive) on one side → confidence 0.70", () => {
    const bankSide = tx({
      id: "bank-3",
      bankAccountId: "ba-discount",
      bankType: "discount",
      description: "BIT payment",
      chargedAmount: -75,
      date: "2026-01-20",
    });
    const cardSide = tx({
      id: "card-3",
      bankAccountId: "ba-max",
      bankType: "max",
      description: "generic purchase",
      chargedAmount: -75,
      date: "2026-01-20",
    });

    const result = detectP2Mirror([bankSide, cardSide]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.7);
  });

  it("produces confidence 0.70 when only card side has marker", () => {
    const bankSide = tx({
      id: "bank-4",
      bankAccountId: "ba-discount",
      bankType: "discount",
      description: "generic bank deduction",
      chargedAmount: -90,
      date: "2026-01-25",
    });
    const cardSide = tx({
      id: "card-4",
      bankAccountId: "ba-max",
      bankType: "max",
      description: "ביט",
      chargedAmount: -90,
      date: "2026-01-25",
    });

    const result = detectP2Mirror([bankSide, cardSide]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.7);
  });

  it("drops pair when neither side has a Bit/debit marker", () => {
    const bankSide = tx({
      id: "bank-5",
      bankAccountId: "ba-discount",
      bankType: "discount",
      description: "generic deduction",
      chargedAmount: -50,
      date: "2026-01-15",
    });
    const cardSide = tx({
      id: "card-5",
      bankAccountId: "ba-max",
      bankType: "max",
      description: "supermarket",
      chargedAmount: -50,
      date: "2026-01-15",
    });

    const result = detectP2Mirror([bankSide, cardSide]);

    expect(result).toHaveLength(0);
  });

  it("drops pair when amount is off by more than 2%", () => {
    const bankSide = tx({
      id: "bank-6",
      bankAccountId: "ba-discount",
      bankType: "discount",
      description: "ביט",
      chargedAmount: -100,
      date: "2026-01-15",
    });
    const cardSide = tx({
      id: "card-6",
      bankAccountId: "ba-max",
      bankType: "max",
      description: "ביט",
      chargedAmount: -85, // 15% off → exceeds EXACT_TOLERANCE
      date: "2026-01-15",
    });

    const result = detectP2Mirror([bankSide, cardSide]);

    expect(result).toHaveLength(0);
  });

  it("drops pair when date difference is more than ±1 day", () => {
    const bankSide = tx({
      id: "bank-7",
      bankAccountId: "ba-discount",
      bankType: "discount",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });
    const cardSide = tx({
      id: "card-7",
      bankAccountId: "ba-max",
      bankType: "max",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-17", // 2 days later → outside window
    });

    const result = detectP2Mirror([bankSide, cardSide]);

    expect(result).toHaveLength(0);
  });

  it("allows pair when date difference is exactly 1 day", () => {
    const bankSide = tx({
      id: "bank-8",
      bankAccountId: "ba-discount",
      bankType: "discount",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });
    const cardSide = tx({
      id: "card-8",
      bankAccountId: "ba-max",
      bankType: "max",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-16", // exactly 1 day
    });

    const result = detectP2Mirror([bankSide, cardSide]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.95);
  });

  it("degrades confidence when two card-side candidates match the same bank-side row", () => {
    const bankSide = tx({
      id: "bank-9",
      bankAccountId: "ba-discount-9",
      bankType: "discount",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });
    // Both card sides share the same bankAccountId so they cannot pair with each other,
    // ensuring only the two (bankSide, cardSideN) pairs are produced.
    const cardSide1 = tx({
      id: "card-9a",
      bankAccountId: "ba-max-9", // shared account id
      bankType: "max",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });
    const cardSide2 = tx({
      id: "card-9b",
      bankAccountId: "ba-max-9", // same account as cardSide1 → cannot pair together
      bankType: "max",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });

    const result = detectP2Mirror([bankSide, cardSide1, cardSide2]);

    // Both candidates should have degraded confidence (0.95 - 0.25 = 0.70, still above threshold)
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.confidence < 0.95)).toBe(true);
    expect(result.every((c) => c.confidence >= 0.7)).toBe(true);
  });

  it("drops candidates that fall below 0.70 after overlap penalty", () => {
    // Three card-side candidates for one bank row: 0.70 - 2*0.25 = 0.20 → dropped.
    // All card rows share the same bankAccountId to prevent them pairing with each other.
    const bankSide = tx({
      id: "bank-10",
      bankAccountId: "ba-discount-10",
      bankType: "discount",
      description: "generic deduction", // no marker → 0.70 base per pair
      chargedAmount: -50,
      date: "2026-01-15",
    });
    const card1 = tx({
      id: "card-10a",
      bankAccountId: "ba-card-shared-10", // shared — prevents card-card pairing
      bankType: "max",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });
    const card2 = tx({
      id: "card-10b",
      bankAccountId: "ba-card-shared-10",
      bankType: "max",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });
    const card3 = tx({
      id: "card-10c",
      bankAccountId: "ba-card-shared-10",
      bankType: "max",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });

    // Each of the 3 candidates has 2 competitors → penalty = 2 * 0.25 = 0.50 → 0.70 - 0.50 = 0.20 → all dropped
    const result = detectP2Mirror([bankSide, card1, card2, card3]);

    expect(result).toHaveLength(0);
  });

  it("ignores rows that already have a reconciliationGroupId", () => {
    const bankSide = tx({
      id: "bank-11",
      bankAccountId: "ba-discount",
      bankType: "discount",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
      reconciliationGroupId: "already-grouped",
    });
    const cardSide = tx({
      id: "card-11",
      bankAccountId: "ba-max",
      bankType: "max",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });

    const result = detectP2Mirror([bankSide, cardSide]);

    expect(result).toHaveLength(0);
  });

  it("does NOT match two transactions on the same bankAccountId (no self-pairing)", () => {
    const tx1 = tx({
      id: "same-ba-1",
      bankAccountId: "ba-shared",
      bankType: "discount",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });
    const tx2 = tx({
      id: "same-ba-2",
      bankAccountId: "ba-shared", // same account
      bankType: "discount",
      description: "ביט",
      chargedAmount: -50,
      date: "2026-01-15",
    });

    const result = detectP2Mirror([tx1, tx2]);

    expect(result).toHaveLength(0);
  });
});
