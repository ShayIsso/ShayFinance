/**
 * TDD suite for countPendingAnomalies (#196 attention-counts feeder) — the
 * DB-backed wrapper around the pure detectors + countAnomalyAlerts fold.
 * A fake RecurringStore keeps this DB-free (project convention — no Drizzle
 * is mocked).
 */

import { describe, it, expect } from "vitest";
import { countPendingAnomalies } from "./scan";
import type { RecurringStore } from "./store";
import type { DetectionTransaction, PersistedRecurringPattern, RecurringPattern } from "./types";

function makePattern(
  overrides: Partial<PersistedRecurringPattern> & { id: string },
): PersistedRecurringPattern {
  return {
    id: overrides.id,
    merchant: overrides.merchant ?? "netflix",
    expectedAmount: overrides.expectedAmount ?? 39.9,
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

describe("countPendingAnomalies", () => {
  it("returns 0 when there are no patterns at all", async () => {
    const store = makeFakeStore([]);
    const total = await countPendingAnomalies(store, new Date("2025-06-01T00:00:00.000Z"));
    expect(total).toBe(0);
  });

  it("counts a single newly-detected pattern (confirmedAt null, no other anomaly)", async () => {
    const pattern = makePattern({ id: "p1", confirmedAt: null });
    const store = makeFakeStore([pattern]);
    const total = await countPendingAnomalies(store, new Date("2025-06-01T00:00:00.000Z"));
    expect(total).toBe(1);
  });

  it("sums independent anomalies across multiple patterns and categories", async () => {
    const today = new Date("2025-06-01T00:00:00.000Z");

    // p1: confirmed, on schedule, price jumped 50% → price_change only.
    const priceChangePattern = makePattern({
      id: "p1",
      merchant: "netflix",
      expectedAmount: 100,
      nextExpectedDate: today,
    });
    // p2: confirmed, 30 days overdue (monthly grace=7, dormancy=45) → missed_payment only.
    const missedPattern = makePattern({
      id: "p2",
      merchant: "spotify",
      nextExpectedDate: new Date("2025-05-02T00:00:00.000Z"),
    });
    // p3: confirmed, 240 days overdue → dormant only.
    const dormantPattern = makePattern({
      id: "p3",
      merchant: "adobe",
      nextExpectedDate: new Date("2024-10-01T00:00:00.000Z"),
    });
    // p4: unconfirmed → newly_detected only.
    const newPattern = makePattern({ id: "p4", merchant: "icloud", confirmedAt: null });

    const recentTxns: DetectionTransaction[] = [
      { id: "t1", description: "NETFLIX.COM", chargedAmount: -150, date: "2025-05-25" },
    ];

    const store = makeFakeStore(
      [priceChangePattern, missedPattern, dormantPattern, newPattern],
      recentTxns,
    );
    const total = await countPendingAnomalies(store, today);
    expect(total).toBe(4);
  });

  it("defaults `now` to the current time when not supplied", async () => {
    // Overdue far enough in the past that it fires regardless of when the
    // test runs — proves the default-now path works without a fixed clock.
    const dormantPattern = makePattern({
      id: "p1",
      nextExpectedDate: new Date("2000-01-01T00:00:00.000Z"),
    });
    const store = makeFakeStore([dormantPattern]);
    const total = await countPendingAnomalies(store);
    expect(total).toBe(1);
  });
});
