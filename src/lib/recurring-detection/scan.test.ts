/**
 * TDD suite for countPendingAnomalies (#196 attention-counts feeder) — the
 * DB-backed wrapper around the pure detectors + countAnomalyAlerts fold.
 * A fake RecurringStore keeps this DB-free (project convention — no Drizzle
 * is mocked).
 */

import { describe, it, expect } from "vitest";
import { countPendingAnomalies, persistDetectedPatterns } from "./scan";
import type { RecurringStore } from "./store";
import type { DetectionTransaction, PersistedRecurringPattern, RecurringPattern } from "./types";

function makePattern(
  overrides: Partial<PersistedRecurringPattern> & { id: string },
): PersistedRecurringPattern {
  return {
    id: overrides.id,
    merchant: overrides.merchant ?? "acme-stream",
    expectedAmount: overrides.expectedAmount ?? 100,
    cadence: overrides.cadence ?? "monthly",
    occurrenceDates: overrides.occurrenceDates ?? [],
    lastMatchedTxnId: overrides.lastMatchedTxnId ?? "txn-abc",
    patternFingerprint: overrides.patternFingerprint ?? `${overrides.id}::monthly`,
    nextExpectedDate: overrides.nextExpectedDate ?? new Date("2025-06-01T00:00:00.000Z"),
    displayName: overrides.displayName ?? null,
    status: overrides.status ?? "active",
    confirmedAt: overrides.confirmedAt !== undefined ? overrides.confirmedAt : new Date(),
  };
}

function makeFakeStore(
  patterns: PersistedRecurringPattern[],
  recentTxns: DetectionTransaction[] = [],
): RecurringStore {
  return {
    async getTransactionsForDetection() {
      return recentTxns;
    },
    async upsertPattern(_pattern: RecurringPattern) {},
    async getPersistedPatterns() {
      return patterns;
    },
  };
}

/** A money-out charge for `merchant` on `date`. */
function makeTxn(merchant: string, date: string): DetectionTransaction {
  return { id: `t-${merchant}-${date}`, description: merchant, chargedAmount: -100, date };
}

describe("countPendingAnomalies", () => {
  it("returns 0 when there are no patterns at all", async () => {
    const store = makeFakeStore([]);
    const total = await countPendingAnomalies(store, new Date("2025-06-01T00:00:00.000Z"));
    expect(total).toBe(0);
  });

  it("counts a single newly-detected pattern (confirmedAt null, no other anomaly)", async () => {
    const pattern = makePattern({ id: "p1", confirmedAt: null });
    // Charged a few days ago → live, so newly_detected is the only alert.
    const store = makeFakeStore([pattern], [makeTxn("acme-stream", "2025-05-29")]);
    const total = await countPendingAnomalies(store, new Date("2025-06-01T00:00:00.000Z"));
    expect(total).toBe(1);
  });

  it("sums independent anomalies across multiple patterns and categories", async () => {
    const today = new Date("2025-06-01T00:00:00.000Z");

    // p1: confirmed, charged 5 days ago, but 50% above the stored amount → price_change only.
    const priceChangePattern = makePattern({
      id: "p1",
      merchant: "acme-stream",
      expectedAmount: 100,
    });
    // p2: confirmed, silent 40 days (monthly grace 37, death 45) → missed_payment only.
    const missedPattern = makePattern({ id: "p2", merchant: "acme-gym" });
    // p3: confirmed, silent 60 days → dormant only.
    const dormantPattern = makePattern({ id: "p3", merchant: "acme-club" });
    // p4: unconfirmed and live → newly_detected only.
    const newPattern = makePattern({ id: "p4", merchant: "acme-news", confirmedAt: null });

    const recentTxns: DetectionTransaction[] = [
      { id: "t1", description: "acme-stream", chargedAmount: -150, date: "2025-05-27" },
      makeTxn("acme-gym", "2025-04-22"),
      makeTxn("acme-club", "2025-04-02"),
      makeTxn("acme-news", "2025-05-27"),
    ];

    const store = makeFakeStore(
      [priceChangePattern, missedPattern, dormantPattern, newPattern],
      recentTxns,
    );
    const total = await countPendingAnomalies(store, today);
    expect(total).toBe(4);
  });

  it("defaults `now` to the current time when not supplied", async () => {
    // Silent since 2000 — dormant regardless of when the test runs, so the
    // default-now path is exercised without a fixed clock.
    const dormantPattern = makePattern({ id: "p1", merchant: "acme-stream" });
    const store = makeFakeStore([dormantPattern], [makeTxn("acme-stream", "2000-01-01")]);
    const total = await countPendingAnomalies(store);
    expect(total).toBe(1);
  });
});

describe("persistDetectedPatterns — one row per fingerprint (#237)", () => {
  function makeDetected(fingerprint: string, amount: number, last: string): RecurringPattern {
    return {
      merchant: "harbor market",
      expectedAmount: amount,
      cadence: "monthly",
      occurrenceDates: [new Date(`${last}T00:00:00.000Z`)],
      lastMatchedTxnId: `txn-${amount}`,
      patternFingerprint: fingerprint,
      nextExpectedDate: new Date("2026-07-01T00:00:00.000Z"),
    };
  }

  function recordingStore(upserted: RecurringPattern[]): RecurringStore {
    return {
      async getTransactionsForDetection() {
        return [];
      },
      async upsertPattern(pattern: RecurringPattern) {
        upserted.push(pattern);
      },
      async getPersistedPatterns() {
        return [];
      },
    };
  }

  it("upserts the most recent regime when several share one fingerprint", async () => {
    const upserted: RecurringPattern[] = [];
    await persistDetectedPatterns(
      [
        makeDetected("harbor market::monthly", 54, "2026-06-01"),
        makeDetected("harbor market::monthly", 33, "2026-04-01"),
        makeDetected("harbor market::monthly", 67, "2026-02-01"),
      ],
      recordingStore(upserted),
    );

    expect(upserted).toHaveLength(1);
    expect(upserted[0].expectedAmount).toBe(54);
  });

  it("is order-independent", async () => {
    const forward: RecurringPattern[] = [];
    const reversed: RecurringPattern[] = [];
    const regimes = [
      makeDetected("harbor market::monthly", 54, "2026-06-01"),
      makeDetected("harbor market::monthly", 33, "2026-04-01"),
    ];

    await persistDetectedPatterns(regimes, recordingStore(forward));
    await persistDetectedPatterns([...regimes].reverse(), recordingStore(reversed));

    expect(reversed[0].expectedAmount).toBe(forward[0].expectedAmount);
  });

  it("still upserts every distinct fingerprint", async () => {
    const upserted: RecurringPattern[] = [];
    await persistDetectedPatterns(
      [
        makeDetected("harbor market::monthly", 54, "2026-06-01"),
        makeDetected("orbit sound::monthly", 33, "2026-04-01"),
      ],
      recordingStore(upserted),
    );

    expect(upserted).toHaveLength(2);
  });
});
