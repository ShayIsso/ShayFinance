/**
 * TDD suite for the anomaly detectors in recurring-detection/anomalies.ts.
 *
 * All three detectors are pure functions — no DB, no Date.now(), deterministic.
 * Tests are organized per detector with explicit boundary cases.
 */

import { describe, it, expect } from "vitest";
import { detectPriceChanges, detectMissedPayments, detectNewlyDetected } from "./anomalies";
import type { PersistedRecurringPattern, DetectionTransaction } from "./types";

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

/** Returns a date that is `days` days after baseDate */
function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
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

// ── detectMissedPayments ──────────────────────────────────────────────────────

describe("detectMissedPayments", () => {
  const nextExpected = new Date("2025-05-01T00:00:00.000Z");

  const activePattern = makePattern({
    id: "mp1",
    merchant: "spotify",
    nextExpectedDate: nextExpected,
  });

  describe("no alert cases", () => {
    it("does not alert when today is the expected date (0 days overdue)", () => {
      const alerts = detectMissedPayments([activePattern], nextExpected);
      expect(alerts).toHaveLength(0);
    });

    it("does not alert when today is 7 days after (exactly 7 — boundary, NOT missed)", () => {
      const today = addDays(nextExpected, 7);
      const alerts = detectMissedPayments([activePattern], today);
      expect(alerts).toHaveLength(0);
    });

    it("does not alert when today is before the expected date", () => {
      const today = addDays(nextExpected, -1);
      const alerts = detectMissedPayments([activePattern], today);
      expect(alerts).toHaveLength(0);
    });

    it("does not alert for paused patterns", () => {
      const paused = makePattern({
        id: "mp2",
        merchant: "spotify",
        nextExpectedDate: nextExpected,
        status: "paused",
      });
      const today = addDays(nextExpected, 30);
      const alerts = detectMissedPayments([paused], today);
      expect(alerts).toHaveLength(0);
    });

    it("does not alert for canceled patterns", () => {
      const canceled = makePattern({
        id: "mp3",
        merchant: "spotify",
        nextExpectedDate: nextExpected,
        status: "canceled",
      });
      const today = addDays(nextExpected, 30);
      const alerts = detectMissedPayments([canceled], today);
      expect(alerts).toHaveLength(0);
    });

    it("returns empty for empty patterns list", () => {
      const today = addDays(nextExpected, 30);
      expect(detectMissedPayments([], today)).toHaveLength(0);
    });
  });

  describe("alert cases", () => {
    it("alerts when today is 8 days after (8 > 7 — missed)", () => {
      const today = addDays(nextExpected, 8);
      const alerts = detectMissedPayments([activePattern], today);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe("missed_payment");
      expect(alerts[0].patternId).toBe("mp1");
      expect(alerts[0].daysOverdue).toBe(8);
    });

    it("alerts when today is 30 days overdue", () => {
      const today = addDays(nextExpected, 30);
      const [alert] = detectMissedPayments([activePattern], today);
      expect(alert.daysOverdue).toBe(30);
    });

    it("includes correct nextExpectedDate in the alert", () => {
      const today = addDays(nextExpected, 10);
      const [alert] = detectMissedPayments([activePattern], today);
      expect(alert.nextExpectedDate.getTime()).toBe(nextExpected.getTime());
    });

    it("includes merchant name in the alert", () => {
      const today = addDays(nextExpected, 10);
      const [alert] = detectMissedPayments([activePattern], today);
      expect(alert.merchant).toBe("spotify");
    });

    it("alerts multiple missed patterns simultaneously", () => {
      const p2 = makePattern({
        id: "mp4",
        merchant: "adobe",
        nextExpectedDate: addDays(nextExpected, -5), // 5 days earlier → more overdue
      });
      const today = addDays(nextExpected, 10);
      const alerts = detectMissedPayments([activePattern, p2], today);
      expect(alerts).toHaveLength(2);
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
