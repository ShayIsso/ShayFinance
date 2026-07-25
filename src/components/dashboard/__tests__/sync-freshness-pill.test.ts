import { describe, it, expect } from "vitest";
import { classifySyncFreshness } from "@/components/dashboard/sync-freshness-pill";
import type { SyncRunSummary } from "@/lib/sync/runs";

const NOW = new Date("2026-07-24T12:00:00.000Z").getTime();

function hoursAgo(hours: number): Date {
  return new Date(NOW - hours * 60 * 60 * 1000);
}

function run(overrides: Partial<SyncRunSummary> & Pick<SyncRunSummary, "bank">): SyncRunSummary {
  return {
    id: `run-${overrides.bank}`,
    status: "success",
    transactionsImported: 0,
    startedAt: hoursAgo(1),
    finishedAt: hoursAgo(1),
    errorMessage: null,
    ...overrides,
  };
}

describe("classifySyncFreshness", () => {
  it("returns 'never' for an empty run list, with no ageMs", () => {
    expect(classifySyncFreshness([], NOW)).toEqual({ level: "never" });
  });

  it("classifies a same-day successful run as fresh", () => {
    const verdict = classifySyncFreshness([run({ bank: "discount", startedAt: hoursAgo(2) })], NOW);
    expect(verdict).toEqual({ level: "fresh", ageMs: 2 * 60 * 60 * 1000 });
  });

  it("classifies a 2-day-old successful run as aging (neutral gap between manual syncs)", () => {
    const verdict = classifySyncFreshness([run({ bank: "max", startedAt: hoursAgo(48) })], NOW);
    expect(verdict.level).toBe("aging");
  });

  it("classifies a run older than 3 days as stale", () => {
    const verdict = classifySyncFreshness(
      [run({ bank: "visaCal", startedAt: hoursAgo(24 * 4) })],
      NOW,
    );
    expect(verdict.level).toBe("stale");
  });

  it("treats the fresh/stale boundary as inclusive-fresh at exactly 24h", () => {
    expect(
      classifySyncFreshness([run({ bank: "discount", startedAt: hoursAgo(24) })], NOW).level,
    ).toBe("fresh");
    expect(
      classifySyncFreshness([run({ bank: "discount", startedAt: hoursAgo(24 * 3) })], NOW).level,
    ).toBe("aging");
  });

  it("classifies an errored run as 'error' regardless of age", () => {
    const verdict = classifySyncFreshness(
      [run({ bank: "discount", status: "error", startedAt: hoursAgo(1) })],
      NOW,
    );
    expect(verdict.level).toBe("error");
  });

  it("classifies an otp_skipped run as 'otp_skipped' regardless of age", () => {
    const verdict = classifySyncFreshness(
      [run({ bank: "max", status: "otp_skipped", startedAt: hoursAgo(1) })],
      NOW,
    );
    expect(verdict.level).toBe("otp_skipped");
  });

  it("aggregates to the most stale bank, not an average", () => {
    const verdict = classifySyncFreshness(
      [
        run({ bank: "discount", startedAt: hoursAgo(1) }), // fresh
        run({ bank: "max", startedAt: hoursAgo(24 * 4) }), // stale
        run({ bank: "visaCal", startedAt: hoursAgo(2) }), // fresh
      ],
      NOW,
    );
    expect(verdict.level).toBe("stale");
  });

  it("ranks a failed bank above a merely stale one", () => {
    const verdict = classifySyncFreshness(
      [
        run({ bank: "discount", startedAt: hoursAgo(24 * 10) }), // stale
        run({ bank: "max", status: "error", startedAt: hoursAgo(1) }), // error
      ],
      NOW,
    );
    expect(verdict.level).toBe("error");
  });

  it("stays fresh only when every bank in the list is fresh", () => {
    const verdict = classifySyncFreshness(
      [
        run({ bank: "discount", startedAt: hoursAgo(1) }),
        run({ bank: "max", startedAt: hoursAgo(20) }),
      ],
      NOW,
    );
    expect(verdict.level).toBe("fresh");
  });
});
