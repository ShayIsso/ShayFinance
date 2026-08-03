/**
 * TDD suite for the anomaly detectors in recurring-detection/anomalies.ts.
 *
 * All three detectors are pure functions — no DB, no Date.now(), deterministic.
 * Tests are organized per detector with explicit boundary cases.
 */

import { describe, it, expect } from "vitest";
import {
  detectPriceChanges,
  detectMissedPayments,
  detectNewlyDetected,
  detectDormant,
  countAnomalyAlerts,
  type AnomalyAlertLists,
} from "./anomalies";
import type { PersistedRecurringPattern, DetectionTransaction, PriceChangeAlert } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePattern(
  overrides: Partial<PersistedRecurringPattern> & { id: string },
): PersistedRecurringPattern {
  const nextExpectedDate = new Date("2025-06-01T00:00:00.000Z");
  return {
    id: overrides.id,
    merchant: overrides.merchant ?? "netflix",
    expectedAmount: overrides.expectedAmount ?? 39.9,
    cadence: overrides.cadence ?? "monthly",
    occurrenceDates: overrides.occurrenceDates ?? [
      new Date("2025-01-01T00:00:00.000Z"),
      new Date("2025-02-01T00:00:00.000Z"),
      new Date("2025-03-01T00:00:00.000Z"),
    ],
    lastMatchedTxnId: overrides.lastMatchedTxnId ?? "txn-abc",
    patternFingerprint: overrides.patternFingerprint ?? `${overrides.id ?? "netflix"}::monthly`,
    nextExpectedDate: overrides.nextExpectedDate ?? nextExpectedDate,
    displayName: overrides.displayName ?? null,
    status: overrides.status ?? "active",
    confirmedAt: overrides.confirmedAt !== undefined ? overrides.confirmedAt : new Date(),
  };
}

function makeTxn(
  id: string,
  description: string,
  chargedAmount: number,
  date: string,
): DetectionTransaction {
  return { id, description, chargedAmount, date };
}

/** Fixed "now" for the evidence-based detectors. */
const TODAY = new Date("2026-06-01T00:00:00.000Z");

/** ISO date `silenceDays` days before TODAY. */
function silenceDate(silenceDays: number): string {
  const d = new Date(TODAY.getTime());
  d.setUTCDate(d.getUTCDate() - silenceDays);
  return d.toISOString().slice(0, 10);
}

/** A money-out charge for `merchant`, `silenceDays` days before TODAY. */
function chargeAtSilence(merchant: string, silenceDays: number): DetectionTransaction {
  return makeTxn(`t-${merchant}-${silenceDays}`, merchant, -100, silenceDate(silenceDays));
}

// ── detectPriceChanges ────────────────────────────────────────────────────────

describe("detectPriceChanges", () => {
  const basePattern = makePattern({
    id: "p1",
    merchant: "netflix",
    expectedAmount: 100,
  });

  describe("no alert cases", () => {
    it("does not alert when no recent transactions match the pattern merchant", () => {
      const txns = [makeTxn("t1", "spotify", -100, "2025-05-01")];
      const alerts = detectPriceChanges([basePattern], txns);
      expect(alerts).toHaveLength(0);
    });

    it("does not alert when amount change is exactly 15% (boundary — no trigger)", () => {
      // expected=100, new=115 → diff=15/100=0.15 exactly — must NOT trigger
      const txns = [makeTxn("t1", "NETFLIX.COM", -115, "2025-05-01")];
      const alerts = detectPriceChanges([basePattern], txns);
      expect(alerts).toHaveLength(0);
    });

    it("does not alert when amount change is just under 15% (14.99%)", () => {
      // expected=100, new=114.99 → diff=0.1499 < 0.15
      const txns = [makeTxn("t1", "NETFLIX.COM", -114.99, "2025-05-01")];
      const alerts = detectPriceChanges([basePattern], txns);
      expect(alerts).toHaveLength(0);
    });

    it("does not alert for paused patterns even with large price change", () => {
      const paused = makePattern({
        id: "p2",
        merchant: "netflix",
        expectedAmount: 100,
        status: "paused",
      });
      const txns = [makeTxn("t1", "NETFLIX.COM", -200, "2025-05-01")];
      const alerts = detectPriceChanges([paused], txns);
      expect(alerts).toHaveLength(0);
    });

    it("does not alert for canceled patterns", () => {
      const canceled = makePattern({
        id: "p3",
        merchant: "netflix",
        expectedAmount: 100,
        status: "canceled",
      });
      const txns = [makeTxn("t1", "NETFLIX.COM", -200, "2025-05-01")];
      const alerts = detectPriceChanges([canceled], txns);
      expect(alerts).toHaveLength(0);
    });

    it("returns empty array for empty patterns", () => {
      const alerts = detectPriceChanges([], [makeTxn("t1", "NETFLIX.COM", -100, "2025-05-01")]);
      expect(alerts).toHaveLength(0);
    });
  });

  describe("alert cases", () => {
    it("alerts when amount change is just over 15% (15.01%)", () => {
      // expected=100, new=115.01 → diff=0.1501 > 0.15 — MUST trigger
      const txns = [makeTxn("t1", "NETFLIX.COM", -115.01, "2025-05-01")];
      const alerts = detectPriceChanges([basePattern], txns);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("price_change");
      expect(alerts[0].patternId).toBe("p1");
      expect(alerts[0].oldAmount).toBe(100);
      expect(alerts[0].newAmount).toBeCloseTo(115.01, 2);
    });

    it("alerts with correct positive pctChange when price rises", () => {
      // expected=100, new=150 → pctChange=0.5
      const txns = [makeTxn("t1", "NETFLIX.COM", -150, "2025-05-01")];
      const [alert] = detectPriceChanges([basePattern], txns);
      expect(alert.pctChange).toBeCloseTo(0.5, 5);
    });

    it("alerts with correct negative pctChange when price drops", () => {
      // expected=100, new=70 → diff=30% > 15% → trigger; pctChange=-0.3
      const txns = [makeTxn("t1", "NETFLIX.COM", -70, "2025-05-01")];
      const [alert] = detectPriceChanges([basePattern], txns);
      expect(alert.pctChange).toBeCloseTo(-0.3, 5);
    });

    it("uses the most-recent transaction when multiple matches exist", () => {
      // Two matching txns: old at 105 (5% change — no alert) and recent at 120 (20% — alert)
      const txns = [
        makeTxn("t1", "NETFLIX.COM", -105, "2025-03-01"),
        makeTxn("t2", "NETFLIX.COM", -120, "2025-05-01"), // most recent
      ];
      const alerts = detectPriceChanges([basePattern], txns);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].newAmount).toBeCloseTo(120, 2);
    });

    it("handles positive (income-style) chargedAmount via Math.abs", () => {
      // Some banks represent debits as positive amounts
      const txns = [makeTxn("t1", "NETFLIX.COM", 120, "2025-05-01")];
      const alerts = detectPriceChanges([basePattern], txns);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].newAmount).toBeCloseTo(120, 2);
    });
  });
});

// ── detectMissedPayments (evidence-based, ADR-0012) ───────────────────────────

describe("detectMissedPayments", () => {
  // monthly: interval 30d, grace 7d, death threshold 45d → missed when silence is 38..44
  const monthly = makePattern({ id: "mp1", merchant: "acme-gym", cadence: "monthly" });

  describe("no alert cases", () => {
    it("does not alert when the charge arrived today (no silence)", () => {
      const txns = [chargeAtSilence("acme-gym", 0)];
      expect(detectMissedPayments([monthly], txns, TODAY)).toHaveLength(0);
    });

    it("does not alert at exactly the grace boundary (silence = interval + 7)", () => {
      const txns = [chargeAtSilence("acme-gym", 37)];
      expect(detectMissedPayments([monthly], txns, TODAY)).toHaveLength(0);
    });

    it("does not alert once the series is dead (silence at the death threshold)", () => {
      const txns = [chargeAtSilence("acme-gym", 45)];
      expect(detectMissedPayments([monthly], txns, TODAY)).toHaveLength(0);
    });

    it("does not alert for a series with no evidence at all — that is dormant, not missed", () => {
      expect(detectMissedPayments([monthly], [], TODAY)).toHaveLength(0);
    });

    it("does not alert when the stored next-expected date is stale but the merchant still charges", () => {
      const stalePattern = makePattern({
        id: "mp-stale",
        merchant: "acme-gym",
        nextExpectedDate: new Date("2024-01-01T00:00:00.000Z"),
      });
      const txns = [chargeAtSilence("acme-gym", 3)];
      expect(detectMissedPayments([stalePattern], txns, TODAY)).toHaveLength(0);
    });

    it("does not alert for paused patterns", () => {
      const paused = makePattern({ id: "mp2", merchant: "acme-gym", status: "paused" });
      const txns = [chargeAtSilence("acme-gym", 40)];
      expect(detectMissedPayments([paused], txns, TODAY)).toHaveLength(0);
    });

    it("does not alert for canceled patterns", () => {
      const canceled = makePattern({ id: "mp3", merchant: "acme-gym", status: "canceled" });
      const txns = [chargeAtSilence("acme-gym", 40)];
      expect(detectMissedPayments([canceled], txns, TODAY)).toHaveLength(0);
    });

    it("returns empty for empty patterns list", () => {
      expect(detectMissedPayments([], [chargeAtSilence("acme-gym", 40)], TODAY)).toHaveLength(0);
    });
  });

  describe("alert cases", () => {
    it("alerts one day past the grace boundary (silence 38 → 8 days overdue)", () => {
      const txns = [chargeAtSilence("acme-gym", 38)];
      const alerts = detectMissedPayments([monthly], txns, TODAY);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("missed_payment");
      expect(alerts[0].patternId).toBe("mp1");
      expect(alerts[0].daysOverdue).toBe(8);
    });

    it("alerts one day short of death (silence 44 → 14 days overdue)", () => {
      const txns = [chargeAtSilence("acme-gym", 44)];
      const [alert] = detectMissedPayments([monthly], txns, TODAY);
      expect(alert.daysOverdue).toBe(14);
    });

    it("reports the projected date derived from evidence, not the stored column", () => {
      const stalePattern = makePattern({
        id: "mp-proj",
        merchant: "acme-gym",
        nextExpectedDate: new Date("2024-01-01T00:00:00.000Z"),
      });
      const txns = [chargeAtSilence("acme-gym", 40)];
      const [alert] = detectMissedPayments([stalePattern], txns, TODAY);
      // last observed 40 days ago + 30-day interval → 10 days ago
      expect(alert.projectedDate.toISOString().slice(0, 10)).toBe(silenceDate(10));
    });

    it("includes merchant name in the alert", () => {
      const txns = [chargeAtSilence("acme-gym", 40)];
      const [alert] = detectMissedPayments([monthly], txns, TODAY);
      expect(alert.merchant).toBe("acme-gym");
    });

    it("alerts multiple missed patterns simultaneously", () => {
      const other = makePattern({ id: "mp4", merchant: "acme-club", cadence: "monthly" });
      const txns = [chargeAtSilence("acme-gym", 40), chargeAtSilence("acme-club", 42)];
      expect(detectMissedPayments([monthly, other], txns, TODAY)).toHaveLength(2);
    });

    it("scales the missed window by cadence (quarterly: silence 99 is missed, not dead)", () => {
      const quarterly = makePattern({ id: "mp5", merchant: "acme-gym", cadence: "quarterly" });
      const txns = [chargeAtSilence("acme-gym", 99)];
      const [alert] = detectMissedPayments([quarterly], txns, TODAY);
      expect(alert.daysOverdue).toBe(8);
    });
  });
});

// ── detectNewlyDetected ───────────────────────────────────────────────────────

describe("detectNewlyDetected", () => {
  describe("no alert cases", () => {
    it("does not flag patterns where confirmedAt is set", () => {
      const confirmed = makePattern({
        id: "nd1",
        merchant: "netflix",
        confirmedAt: new Date("2025-04-01T00:00:00.000Z"),
      });
      const alerts = detectNewlyDetected([confirmed], []);
      expect(alerts).toHaveLength(0);
    });

    it("returns empty for empty patterns list", () => {
      expect(detectNewlyDetected([], [])).toHaveLength(0);
    });

    it("ignores recentTxns — confirmedAt=null always triggers regardless of txns", () => {
      const unconfirmed = makePattern({ id: "nd2", merchant: "spotify", confirmedAt: null });
      // Pass transactions that happen to match the merchant — should not suppress the alert
      const txns = [makeTxn("t1", "SPOTIFY", -20, "2025-05-01")];
      const alerts = detectNewlyDetected([unconfirmed], txns);
      expect(alerts).toHaveLength(1);
    });
  });

  describe("alert cases", () => {
    it("flags patterns where confirmedAt is null (newly detected)", () => {
      const unconfirmed = makePattern({ id: "nd3", merchant: "netflix", confirmedAt: null });
      const alerts = detectNewlyDetected([unconfirmed], []);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("newly_detected");
      expect(alerts[0].patternId).toBe("nd3");
    });

    it("includes merchant, expectedAmount, and cadence in the alert", () => {
      const unconfirmed = makePattern({
        id: "nd4",
        merchant: "adobe",
        expectedAmount: 59.99,
        cadence: "annual",
        confirmedAt: null,
      });
      const [alert] = detectNewlyDetected([unconfirmed], []);
      expect(alert.merchant).toBe("adobe");
      expect(alert.expectedAmount).toBeCloseTo(59.99, 2);
      expect(alert.cadence).toBe("annual");
    });

    it("flags multiple unconfirmed patterns simultaneously", () => {
      const p1 = makePattern({ id: "nd5", merchant: "netflix", confirmedAt: null });
      const p2 = makePattern({ id: "nd6", merchant: "spotify", confirmedAt: null });
      const alerts = detectNewlyDetected([p1, p2], []);
      expect(alerts).toHaveLength(2);
    });

    it("only flags unconfirmed — confirmed patterns in the same list are skipped", () => {
      const unconfirmed = makePattern({ id: "nd7", merchant: "netflix", confirmedAt: null });
      const confirmed = makePattern({
        id: "nd8",
        merchant: "spotify",
        confirmedAt: new Date("2025-03-01T00:00:00.000Z"),
      });
      const alerts = detectNewlyDetected([unconfirmed, confirmed], []);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].patternId).toBe("nd7");
    });

    it("treats confirmedAt=null regardless of pattern status (active, paused)", () => {
      // The design: newly-detected patterns start as status=active with confirmedAt=null.
      // A paused-but-unconfirmed edge case: still flag it (user may have paused before
      // confirming, and we still surface it for naming/categorization).
      const pausedUnconfirmed = makePattern({
        id: "nd9",
        merchant: "icloud",
        status: "paused",
        confirmedAt: null,
      });
      const alerts = detectNewlyDetected([pausedUnconfirmed], []);
      expect(alerts).toHaveLength(1);
    });
  });
});

// ── detectDormant (evidence-based, ADR-0012) ─────────────────────────────────

describe("detectDormant", () => {
  describe("monthly cadence (death threshold = 45 days of silence)", () => {
    const monthly = makePattern({ id: "d-m", merchant: "acme-gym", cadence: "monthly" });

    it("does NOT fire one day under the threshold (44 days of silence)", () => {
      expect(detectDormant([monthly], [chargeAtSilence("acme-gym", 44)], TODAY)).toHaveLength(0);
    });

    it("fires at exactly the threshold (45 days of silence)", () => {
      const alerts = detectDormant([monthly], [chargeAtSilence("acme-gym", 45)], TODAY);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("dormant");
      expect(alerts[0].patternId).toBe("d-m");
      expect(alerts[0].cadence).toBe("monthly");
      expect(alerts[0].silenceDays).toBe(45);
      expect(alerts[0].lastObservedChargeDate?.toISOString().slice(0, 10)).toBe(silenceDate(45));
    });

    it("fires well above the threshold (240 days of silence)", () => {
      expect(detectDormant([monthly], [chargeAtSilence("acme-gym", 240)], TODAY)).toHaveLength(1);
    });

    it("fires with no evidence at all — no evidence means no life", () => {
      const alerts = detectDormant([monthly], [], TODAY);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].lastObservedChargeDate).toBeNull();
      expect(alerts[0].silenceDays).toBeNull();
    });

    it("does NOT fire when the stored next-expected date is stale but the merchant still charges", () => {
      const stalePattern = makePattern({
        id: "d-stale",
        merchant: "acme-gym",
        cadence: "monthly",
        nextExpectedDate: new Date("2024-01-01T00:00:00.000Z"),
      });
      expect(detectDormant([stalePattern], [chargeAtSilence("acme-gym", 3)], TODAY)).toHaveLength(
        0,
      );
    });

    it("does NOT fire for paused patterns", () => {
      const paused = makePattern({
        id: "d-p",
        merchant: "acme-gym",
        cadence: "monthly",
        status: "paused",
      });
      expect(detectDormant([paused], [chargeAtSilence("acme-gym", 240)], TODAY)).toHaveLength(0);
    });
  });

  describe("quarterly cadence (threshold = 137 days)", () => {
    const quarterly = makePattern({ id: "d-q", merchant: "acme-gym", cadence: "quarterly" });

    it("does NOT fire at 136 days of silence; fires at 137", () => {
      expect(detectDormant([quarterly], [chargeAtSilence("acme-gym", 136)], TODAY)).toHaveLength(0);
      expect(detectDormant([quarterly], [chargeAtSilence("acme-gym", 137)], TODAY)).toHaveLength(1);
    });
  });

  describe("annual cadence (threshold = 548 days)", () => {
    const annual = makePattern({ id: "d-a", merchant: "acme-gym", cadence: "annual" });

    it("does NOT fire at 547 days of silence; fires at 548", () => {
      expect(detectDormant([annual], [chargeAtSilence("acme-gym", 547)], TODAY)).toHaveLength(0);
      expect(detectDormant([annual], [chargeAtSilence("acme-gym", 548)], TODAY)).toHaveLength(1);
    });
  });
});

describe("missed / dormant mutual exclusivity (monthly: grace 37, threshold 45)", () => {
  const monthly = makePattern({ id: "x1", merchant: "acme-gym", cadence: "monthly" });

  function verdicts(silenceDays: number) {
    const txns = [chargeAtSilence("acme-gym", silenceDays)];
    return {
      missed: detectMissedPayments([monthly], txns, TODAY).length,
      dormant: detectDormant([monthly], txns, TODAY).length,
    };
  }

  it("at the grace boundary (37) → neither", () => {
    expect(verdicts(37)).toEqual({ missed: 0, dormant: 0 });
  });

  it("just inside the missed window (38) → missed only", () => {
    expect(verdicts(38)).toEqual({ missed: 1, dormant: 0 });
  });

  it("one day under the threshold (44) → missed only", () => {
    expect(verdicts(44)).toEqual({ missed: 1, dormant: 0 });
  });

  it("at the threshold (45) → dormant only", () => {
    expect(verdicts(45)).toEqual({ missed: 0, dormant: 1 });
  });

  it("long silent (240) → dormant only", () => {
    expect(verdicts(240)).toEqual({ missed: 0, dormant: 1 });
  });

  it("no evidence → dormant only", () => {
    expect(detectMissedPayments([monthly], [], TODAY)).toHaveLength(0);
    expect(detectDormant([monthly], [], TODAY)).toHaveLength(1);
  });
});

// ── countAnomalyAlerts ────────────────────────────────────────────────────────
// Pure fold over the four detectors' outputs (#196 attention-counts feeder).
// No detector logic here — only summation, so these tests target the fold
// itself: totals, the zero case, and that each category counts independently.

function makePriceChangeAlert(id: string): PriceChangeAlert {
  return {
    type: "price_change",
    patternId: id,
    merchant: "m",
    oldAmount: 1,
    newAmount: 2,
    pctChange: 1,
  };
}

function emptyLists(): AnomalyAlertLists {
  return { priceChanges: [], missedPayments: [], dormant: [], newlyDetected: [] };
}

describe("countAnomalyAlerts", () => {
  it("returns 0 when all four detector outputs are empty", () => {
    expect(countAnomalyAlerts(emptyLists())).toBe(0);
  });

  it("counts a single alert in a single category", () => {
    const lists = { ...emptyLists(), priceChanges: [makePriceChangeAlert("p1")] };
    expect(countAnomalyAlerts(lists)).toBe(1);
  });

  it("sums alerts across all four categories", () => {
    const netflixPriceChange = detectPriceChanges(
      [makePattern({ id: "p1", merchant: "netflix", expectedAmount: 100 })],
      [makeTxn("t1", "NETFLIX", -150, "2025-05-01")],
    );
    const missed = detectMissedPayments(
      [makePattern({ id: "p2", merchant: "acme-gym" })],
      [chargeAtSilence("acme-gym", 40)],
      TODAY,
    );
    const dormant = detectDormant([makePattern({ id: "p3", merchant: "acme-club" })], [], TODAY);
    const newlyDetected = detectNewlyDetected([makePattern({ id: "p4", confirmedAt: null })], []);

    expect(netflixPriceChange).toHaveLength(1);
    expect(missed).toHaveLength(1);
    expect(dormant).toHaveLength(1);
    expect(newlyDetected).toHaveLength(1);

    const total = countAnomalyAlerts({
      priceChanges: netflixPriceChange,
      missedPayments: missed,
      dormant,
      newlyDetected,
    });
    expect(total).toBe(4);
  });

  it("each category contributes independently — one empty category does not zero out the total", () => {
    const lists: AnomalyAlertLists = {
      priceChanges: [makePriceChangeAlert("a"), makePriceChangeAlert("b")],
      missedPayments: [],
      dormant: [],
      newlyDetected: [],
    };
    expect(countAnomalyAlerts(lists)).toBe(2);
  });

  it("counts multiple alerts within the same category plus alerts in another category", () => {
    const lists: AnomalyAlertLists = {
      priceChanges: [makePriceChangeAlert("a"), makePriceChangeAlert("b")],
      missedPayments: [],
      dormant: [],
      newlyDetected: [
        {
          type: "newly_detected",
          patternId: "n1",
          merchant: "m",
          expectedAmount: 10,
          cadence: "monthly",
        },
      ],
    };
    expect(countAnomalyAlerts(lists)).toBe(3);
  });
});
