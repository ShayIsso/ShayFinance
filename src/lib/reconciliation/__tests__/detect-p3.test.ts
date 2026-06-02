import { describe, it, expect } from "vitest";
import { detectP3InterAccount } from "../detect-p3";
import type { ReconciliationTransaction } from "../types";

let idCounter = 0;

function tx(overrides: Partial<ReconciliationTransaction> = {}): ReconciliationTransaction {
  idCounter++;
  return {
    id: `tx-${idCounter}`,
    bankAccountId: `ba-${idCounter}`,
    bankType: "discount",
    date: "2026-01-15",
    chargedAmount: -250,
    description: "ביט",
    categoryId: null,
    reconciliationGroupId: null,
    ...overrides,
  };
}

describe("detectP3InterAccount", () => {
  it("returns empty array for empty input", () => {
    expect(detectP3InterAccount([])).toEqual([]);
  });

  it("detects opposite-sign pair with Bit markers on both sides → confidence 0.9", () => {
    const outgoing = tx({
      id: "out-1",
      bankAccountId: "ba-discount",
      bankType: "discount",
      description: "ביט",
      chargedAmount: -250,
      date: "2026-01-15",
    });
    const incoming = tx({
      id: "in-1",
      bankAccountId: "ba-max",
      bankType: "max",
      description: "ביט",
      chargedAmount: 250,
      date: "2026-01-15",
    });

    const result = detectP3InterAccount([outgoing, incoming]);

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("p3_inter_account");
    expect(result[0].confidence).toBe(0.9);
    expect(result[0].outgoingSide.id).toBe("out-1");
    expect(result[0].incomingSide.id).toBe("in-1");
  });

  it("detects pair with העברה markers on both sides → confidence 0.9", () => {
    const outgoing = tx({
      id: "out-2",
      bankAccountId: "ba-discount",
      bankType: "discount",
      description: "העברה יוצאת",
      chargedAmount: -500,
      date: "2026-02-10",
    });
    const incoming = tx({
      id: "in-2",
      bankAccountId: "ba-visacal",
      bankType: "visaCal",
      description: "העברה נכנסת",
      chargedAmount: 500,
      date: "2026-02-10",
    });

    const result = detectP3InterAccount([outgoing, incoming]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.9);
  });

  it("drops pair when both amounts have same sign (same direction)", () => {
    const tx1 = tx({
      id: "same-1",
      bankAccountId: "ba-a",
      description: "ביט",
      chargedAmount: -250,
    });
    const tx2 = tx({
      id: "same-2",
      bankAccountId: "ba-b",
      description: "ביט",
      chargedAmount: -250,
    });

    const result = detectP3InterAccount([tx1, tx2]);

    expect(result).toHaveLength(0);
  });

  it("drops pair when absolute amounts differ by more than 2%", () => {
    const outgoing = tx({
      id: "out-3",
      bankAccountId: "ba-a",
      description: "ביט",
      chargedAmount: -250,
    });
    const incoming = tx({
      id: "in-3",
      bankAccountId: "ba-b",
      description: "ביט",
      chargedAmount: 210, // 16% off → exceeds tolerance
    });

    const result = detectP3InterAccount([outgoing, incoming]);

    expect(result).toHaveLength(0);
  });

  it("drops pair when date difference is more than ±2 days", () => {
    const outgoing = tx({
      id: "out-4",
      bankAccountId: "ba-a",
      description: "ביט",
      chargedAmount: -250,
      date: "2026-01-15",
    });
    const incoming = tx({
      id: "in-4",
      bankAccountId: "ba-b",
      description: "ביט",
      chargedAmount: 250,
      date: "2026-01-18", // 3 days later → outside window
    });

    const result = detectP3InterAccount([outgoing, incoming]);

    expect(result).toHaveLength(0);
  });

  it("allows pair when date difference is exactly 2 days", () => {
    const outgoing = tx({
      id: "out-5",
      bankAccountId: "ba-a",
      description: "ביט",
      chargedAmount: -250,
      date: "2026-01-15",
    });
    const incoming = tx({
      id: "in-5",
      bankAccountId: "ba-b",
      description: "ביט",
      chargedAmount: 250,
      date: "2026-01-17", // exactly 2 days
    });

    const result = detectP3InterAccount([outgoing, incoming]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.9);
  });

  it("drops pair when both transactions are on the same bankAccountId", () => {
    const tx1 = tx({
      id: "sa-1",
      bankAccountId: "ba-shared",
      description: "ביט",
      chargedAmount: -250,
    });
    const tx2 = tx({
      id: "sa-2",
      bankAccountId: "ba-shared",
      description: "ביט",
      chargedAmount: 250,
    });

    const result = detectP3InterAccount([tx1, tx2]);

    expect(result).toHaveLength(0);
  });

  it("ignores rows that already have a reconciliationGroupId", () => {
    const outgoing = tx({
      id: "out-6",
      bankAccountId: "ba-a",
      description: "ביט",
      chargedAmount: -250,
      reconciliationGroupId: "already-grouped",
    });
    const incoming = tx({
      id: "in-6",
      bankAccountId: "ba-b",
      description: "ביט",
      chargedAmount: 250,
    });

    const result = detectP3InterAccount([outgoing, incoming]);

    expect(result).toHaveLength(0);
  });

  it("produces confidence 0.7 when only one side has a transfer marker", () => {
    const outgoing = tx({
      id: "out-7",
      bankAccountId: "ba-a",
      description: "ביט",
      chargedAmount: -250,
    });
    const incoming = tx({
      id: "in-7",
      bankAccountId: "ba-b",
      description: "זיכוי כללי", // no marker
      chargedAmount: 250,
    });

    const result = detectP3InterAccount([outgoing, incoming]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.7);
  });

  it("drops pair when neither side has a transfer marker", () => {
    const outgoing = tx({
      id: "out-8",
      bankAccountId: "ba-a",
      description: "קניה כללית",
      chargedAmount: -250,
    });
    const incoming = tx({
      id: "in-8",
      bankAccountId: "ba-b",
      description: "זיכוי כללי",
      chargedAmount: 250,
    });

    const result = detectP3InterAccount([outgoing, incoming]);

    expect(result).toHaveLength(0);
  });

  it("degrades confidence when one outgoing row matches multiple incoming rows", () => {
    const outgoing = tx({
      id: "out-9",
      bankAccountId: "ba-discount-9",
      bankType: "discount",
      description: "ביט",
      chargedAmount: -250,
      date: "2026-01-15",
    });
    // Two incoming transactions on different accounts, both match outgoing
    const incoming1 = tx({
      id: "in-9a",
      bankAccountId: "ba-max-9",
      bankType: "max",
      description: "ביט",
      chargedAmount: 250,
      date: "2026-01-15",
    });
    const incoming2 = tx({
      id: "in-9b",
      bankAccountId: "ba-visacal-9",
      bankType: "visaCal",
      description: "ביט",
      chargedAmount: 250,
      date: "2026-01-15",
    });

    const result = detectP3InterAccount([outgoing, incoming1, incoming2]);

    // Both candidates should have degraded confidence (0.9 - 0.25 = 0.65 → still above 0.7? No: 0.65 < 0.7 → dropped)
    // Actually with one competitor each: 0.9 - 1*0.25 = 0.65 → both dropped
    expect(result).toHaveLength(0);
  });

  it("drops candidates falling below 0.7 after degradation penalty", () => {
    // One outgoing matches three incomings: each candidate gets 2 competitors
    // 0.9 - 2*0.25 = 0.40 → all dropped
    const outgoing = tx({
      id: "out-10",
      bankAccountId: "ba-discount-10",
      bankType: "discount",
      description: "ביט",
      chargedAmount: -300,
      date: "2026-01-15",
    });
    const makeIncoming = (id: string, bankAccountId: string) =>
      tx({
        id,
        bankAccountId,
        bankType: "max",
        description: "ביט",
        chargedAmount: 300,
        date: "2026-01-15",
      });

    const in1 = makeIncoming("in-10a", "ba-max-10a");
    const in2 = makeIncoming("in-10b", "ba-max-10b");
    const in3 = makeIncoming("in-10c", "ba-max-10c");

    const result = detectP3InterAccount([outgoing, in1, in2, in3]);

    expect(result).toHaveLength(0);
  });

  it("correctly assigns outgoingSide as negative amount and incomingSide as positive amount", () => {
    // Incoming listed first in array — sides should still be assigned by sign
    const incoming = tx({
      id: "in-11",
      bankAccountId: "ba-a",
      description: "העברה",
      chargedAmount: 750,
    });
    const outgoing = tx({
      id: "out-11",
      bankAccountId: "ba-b",
      description: "העברה",
      chargedAmount: -750,
    });

    const result = detectP3InterAccount([incoming, outgoing]);

    expect(result).toHaveLength(1);
    expect(result[0].outgoingSide.chargedAmount).toBeLessThan(0);
    expect(result[0].incomingSide.chargedAmount).toBeGreaterThan(0);
    expect(result[0].outgoingSide.id).toBe("out-11");
    expect(result[0].incomingSide.id).toBe("in-11");
  });

  it("uses Latin 'transfer' keyword as a valid marker", () => {
    const outgoing = tx({
      id: "out-12",
      bankAccountId: "ba-a",
      description: "bank transfer out",
      chargedAmount: -100,
    });
    const incoming = tx({
      id: "in-12",
      bankAccountId: "ba-b",
      description: "bank transfer in",
      chargedAmount: 100,
    });

    const result = detectP3InterAccount([outgoing, incoming]);

    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(0.9);
  });
});
