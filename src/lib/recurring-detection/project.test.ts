/**
 * TDD suite for the evidence core (ADR-0012): liveness is judged only from
 * transaction evidence, and the verdict is derived — never persisted.
 *
 * Pure functions — `today` is always passed in. Merchant descriptors are
 * synthesized ("acme-stream"), never copied from real bank data.
 */

import { describe, it, expect } from "vitest";
import { projectSeries, projectUpcomingCharges } from "./project";
import type { DetectionTransaction, PersistedRecurringPattern } from "./types";

const TODAY = new Date("2026-06-01T00:00:00.000Z");

function daysBefore(base: Date, days: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function makePattern(
  overrides: Partial<PersistedRecurringPattern> & { id: string },
): PersistedRecurringPattern {
  return {
    id: overrides.id,
    merchant: overrides.merchant ?? "acme-stream",
    expectedAmount: overrides.expectedAmount ?? 40,
    cadence: overrides.cadence ?? "monthly",
    occurrenceDates: overrides.occurrenceDates ?? [],
    lastMatchedTxnId: overrides.lastMatchedTxnId ?? "txn-1",
    patternFingerprint: overrides.patternFingerprint ?? `${overrides.id}::monthly`,
    // Deliberately stale in most fixtures: the stored column must never move a verdict.
    nextExpectedDate: overrides.nextExpectedDate ?? new Date("2025-01-01T00:00:00.000Z"),
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

describe("projectSeries — liveness evidence", () => {
  it("anchors liveness on the most recent matching charge, not the stored next-expected date", () => {
    const pattern = makePattern({
      id: "p1",
      merchant: "acme-stream",
      nextExpectedDate: new Date("2024-03-01T00:00:00.000Z"),
    });
    const txns = [
      makeTxn("t1", "ACME-STREAM", -40, daysBefore(TODAY, 33)),
      makeTxn("t2", "ACME-STREAM", -40, daysBefore(TODAY, 3)),
    ];

    const [projection] = projectSeries([pattern], txns, TODAY);

    expect(projection.evidence?.lastObservedChargeDate.toISOString().slice(0, 10)).toBe(
      daysBefore(TODAY, 3),
    );
    expect(projection.evidence?.silenceDays).toBe(3);
    expect(projection.isLive).toBe(true);
  });

  it("is live one day under the monthly death threshold (44 days of silence)", () => {
    const pattern = makePattern({ id: "p1", cadence: "monthly" });
    const txns = [makeTxn("t1", "acme-stream", -40, daysBefore(TODAY, 44))];

    const [projection] = projectSeries([pattern], txns, TODAY);

    expect(projection.evidence?.silenceDays).toBe(44);
    expect(projection.isLive).toBe(true);
  });

  it("is dead at exactly the monthly death threshold (45 days of silence)", () => {
    const pattern = makePattern({ id: "p1", cadence: "monthly" });
    const txns = [makeTxn("t1", "acme-stream", -40, daysBefore(TODAY, 45))];

    const [projection] = projectSeries([pattern], txns, TODAY);

    expect(projection.isLive).toBe(false);
  });

  it("scales the threshold by cadence — 137 days of silence is dead monthly, live quarterly", () => {
    const monthly = makePattern({ id: "m", merchant: "acme-gym", cadence: "monthly" });
    const quarterly = makePattern({ id: "q", merchant: "acme-gym", cadence: "quarterly" });
    const txns = [makeTxn("t1", "acme-gym", -100, daysBefore(TODAY, 136))];

    const [m, q] = projectSeries([monthly, quarterly], txns, TODAY);

    expect(m.isLive).toBe(false);
    expect(q.isLive).toBe(true);
  });

  it("treats a series with zero matching charges in the window as dead with no evidence", () => {
    const pattern = makePattern({ id: "p1", merchant: "acme-stream" });
    const txns = [makeTxn("t1", "other-shop", -40, daysBefore(TODAY, 2))];

    const [projection] = projectSeries([pattern], txns, TODAY);

    expect(projection.evidence).toBeNull();
    expect(projection.isLive).toBe(false);
  });

  it("stays live through a price change — matching is amount-agnostic", () => {
    const pattern = makePattern({ id: "p1", expectedAmount: 40 });
    const txns = [makeTxn("t1", "acme-stream", -400, daysBefore(TODAY, 4))];

    const [projection] = projectSeries([pattern], txns, TODAY);

    expect(projection.isLive).toBe(true);
  });

  it("matches on the immutable merchant key, never on displayName", () => {
    const pattern = makePattern({
      id: "p1",
      merchant: "acme-stream",
      displayName: "my streaming service",
    });
    const txns = [makeTxn("t1", "my streaming service", -40, daysBefore(TODAY, 2))];

    const [projection] = projectSeries([pattern], txns, TODAY);

    expect(projection.isLive).toBe(false);
  });
});

describe("projectSeries — forecast from evidence", () => {
  it("projects the last observed charge plus the cadence interval", () => {
    const pattern = makePattern({ id: "p1", cadence: "monthly" });
    const txns = [makeTxn("t1", "acme-stream", -40, "2026-05-20")];

    const [projection] = projectSeries([pattern], txns, TODAY);

    expect(projection.evidence?.projectedDate.toISOString().slice(0, 10)).toBe("2026-06-19");
  });

  it("averages the last three observed charges, ignoring the stored expectedAmount", () => {
    const pattern = makePattern({ id: "p1", expectedAmount: 40 });
    const txns = [
      makeTxn("t1", "acme-stream", -40, daysBefore(TODAY, 120)),
      makeTxn("t2", "acme-stream", -60, daysBefore(TODAY, 90)),
      makeTxn("t3", "acme-stream", -60, daysBefore(TODAY, 60)),
      makeTxn("t4", "acme-stream", -60, daysBefore(TODAY, 30)),
    ];

    const [projection] = projectSeries([pattern], txns, TODAY);

    expect(projection.evidence?.observedAmount).toBeCloseTo(60, 2);
  });

  it("averages fewer than three charges when that is all the evidence there is", () => {
    const pattern = makePattern({ id: "p1", expectedAmount: 40 });
    const txns = [
      makeTxn("t1", "acme-stream", -50, daysBefore(TODAY, 32)),
      makeTxn("t2", "acme-stream", -70, daysBefore(TODAY, 2)),
    ];

    const [projection] = projectSeries([pattern], txns, TODAY);

    expect(projection.evidence?.observedAmount).toBeCloseTo(60, 2);
  });
});

describe("projectUpcomingCharges", () => {
  it("projects a live series whose stored next-expected date is months stale", () => {
    const pattern = makePattern({
      id: "p1",
      merchant: "acme-stream",
      nextExpectedDate: new Date("2024-02-01T00:00:00.000Z"),
    });
    const txns = [makeTxn("t1", "ACME-STREAM", -40, daysBefore(TODAY, 5))];

    const { upcoming, total } = projectUpcomingCharges([pattern], txns, TODAY);

    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].patternId).toBe("p1");
    expect(upcoming[0].projectedDate.toISOString().slice(0, 10)).toBe(daysBefore(TODAY, -25));
    expect(total).toBeCloseTo(40, 2);
  });

  it("omits a dead series regardless of its active status", () => {
    const pattern = makePattern({ id: "p1", status: "active" });
    const txns = [makeTxn("t1", "acme-stream", -40, daysBefore(TODAY, 60))];

    const { upcoming, total } = projectUpcomingCharges([pattern], txns, TODAY);

    expect(upcoming).toHaveLength(0);
    expect(total).toBe(0);
  });

  it("omits a series with no evidence at all", () => {
    const pattern = makePattern({ id: "p1", merchant: "acme-stream" });

    const { upcoming } = projectUpcomingCharges([pattern], [], TODAY);

    expect(upcoming).toHaveLength(0);
  });

  it("omits paused series — paused is not dead, but it is not upcoming either", () => {
    const pattern = makePattern({ id: "p1", status: "paused" });
    const txns = [makeTxn("t1", "acme-stream", -40, daysBefore(TODAY, 2))];

    const { upcoming } = projectUpcomingCharges([pattern], txns, TODAY);

    expect(upcoming).toHaveLength(0);
  });

  it("includes an unconfirmed series", () => {
    const pattern = makePattern({ id: "p1", confirmedAt: null });
    const txns = [makeTxn("t1", "acme-stream", -40, daysBefore(TODAY, 2))];

    const { upcoming } = projectUpcomingCharges([pattern], txns, TODAY);

    expect(upcoming).toHaveLength(1);
  });

  it("keeps a late-but-live series whose projected date already passed, sorted first", () => {
    const late = makePattern({ id: "late", merchant: "acme-gym" });
    const onTime = makePattern({ id: "on-time", merchant: "acme-stream" });
    const txns = [
      makeTxn("t1", "acme-gym", -100, daysBefore(TODAY, 40)),
      makeTxn("t2", "acme-stream", -40, daysBefore(TODAY, 6)),
    ];

    const { upcoming } = projectUpcomingCharges([late, onTime], txns, TODAY);

    expect(upcoming.map((c) => c.patternId)).toEqual(["late", "on-time"]);
    expect(upcoming[0].projectedDate.getTime()).toBeLessThan(TODAY.getTime());
  });

  it("serves the observed rolling average, not the stored expectedAmount", () => {
    const pattern = makePattern({ id: "p1", expectedAmount: 40 });
    const txns = [
      makeTxn("t1", "acme-stream", -90, daysBefore(TODAY, 62)),
      makeTxn("t2", "acme-stream", -90, daysBefore(TODAY, 32)),
      makeTxn("t3", "acme-stream", -90, daysBefore(TODAY, 2)),
    ];

    const { upcoming, total } = projectUpcomingCharges([pattern], txns, TODAY);

    expect(upcoming[0].expectedAmount).toBeCloseTo(90, 2);
    expect(total).toBeCloseTo(90, 2);
  });

  it("carries merchant, displayName and cadence through for rendering", () => {
    const pattern = makePattern({
      id: "p1",
      merchant: "acme-stream",
      displayName: "my streaming service",
      cadence: "quarterly",
    });
    const txns = [makeTxn("t1", "acme-stream", -40, daysBefore(TODAY, 70))];

    const { upcoming } = projectUpcomingCharges([pattern], txns, TODAY);

    expect(upcoming[0].merchant).toBe("acme-stream");
    expect(upcoming[0].displayName).toBe("my streaming service");
    expect(upcoming[0].cadence).toBe("quarterly");
  });

  it("includes a projection landing exactly on the 31-day horizon and excludes the next day", () => {
    // Quarterly: projected = last + 91d, so silence 60 → +31 (in), silence 59 → +32 (out).
    const inHorizon = makePattern({ id: "in", merchant: "acme-gym", cadence: "quarterly" });
    const outOfHorizon = makePattern({ id: "out", merchant: "acme-club", cadence: "quarterly" });
    const txns = [
      makeTxn("t1", "acme-gym", -100, daysBefore(TODAY, 60)),
      makeTxn("t2", "acme-club", -100, daysBefore(TODAY, 59)),
    ];

    const { upcoming } = projectUpcomingCharges([inHorizon, outOfHorizon], txns, TODAY);

    expect(upcoming.map((c) => c.patternId)).toEqual(["in"]);
  });

  it("shows every live monthly series exactly once at the default horizon", () => {
    const patterns = [
      makePattern({ id: "fresh", merchant: "acme-stream" }),
      makePattern({ id: "mid", merchant: "acme-gym" }),
      makePattern({ id: "stale", merchant: "acme-club" }),
    ];
    const txns = [
      makeTxn("t1", "acme-stream", -40, daysBefore(TODAY, 1)),
      makeTxn("t2", "acme-gym", -40, daysBefore(TODAY, 20)),
      makeTxn("t3", "acme-club", -40, daysBefore(TODAY, 44)),
    ];

    const { upcoming } = projectUpcomingCharges(patterns, txns, TODAY);

    expect(upcoming.map((c) => c.patternId)).toEqual(["stale", "mid", "fresh"]);
  });

  it("honours an explicit horizon", () => {
    const pattern = makePattern({ id: "p1" });
    const txns = [makeTxn("t1", "acme-stream", -40, daysBefore(TODAY, 5))];

    expect(projectUpcomingCharges([pattern], txns, TODAY, 7).upcoming).toHaveLength(0);
    expect(projectUpcomingCharges([pattern], txns, TODAY, 25).upcoming).toHaveLength(1);
  });
});
