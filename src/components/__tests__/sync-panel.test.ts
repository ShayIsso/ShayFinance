import { describe, it, expect } from "vitest";
import { resolveBankDisplay, formatRelativeAge, type BankSyncState } from "@/components/sync-panel";
import type { SyncRunSummary } from "@/lib/sync/runs";

function persistedRun(overrides: Partial<SyncRunSummary> = {}): SyncRunSummary {
  return {
    id: "run-1",
    bank: "discount",
    status: "success",
    transactionsImported: 12,
    startedAt: new Date("2026-07-24T10:00:00.000Z"),
    finishedAt: new Date("2026-07-24T10:01:00.000Z"),
    errorMessage: null,
    ...overrides,
  };
}

const liveState: BankSyncState = { status: "scraping" };

describe("resolveBankDisplay", () => {
  it("picks the live SSE state when both a live state and a persisted row exist", () => {
    const display = resolveBankDisplay(liveState, persistedRun());
    expect(display).toEqual({ source: "live", state: liveState });
  });

  it("falls back to the persisted row when there is no live state yet", () => {
    const run = persistedRun({ status: "error" });
    const display = resolveBankDisplay(undefined, run);
    expect(display).toEqual({ source: "persisted", run });
  });

  it("reports 'none' when neither a live state nor a persisted row exists", () => {
    expect(resolveBankDisplay(undefined, undefined)).toEqual({ source: "none" });
  });

  it("keeps preferring live state even after the SSE stream ends (state stays in bankStates)", () => {
    const completed: BankSyncState = { status: "complete", transactionCount: 7 };
    const display = resolveBankDisplay(completed, persistedRun({ status: "error" }));
    expect(display).toEqual({ source: "live", state: completed });
  });
});

describe("formatRelativeAge", () => {
  it("reads as 'less than a minute' just under the one-minute boundary", () => {
    expect(formatRelativeAge(59 * 1000)).toBe("לפני פחות מדקה");
  });

  it("formats whole minutes under an hour", () => {
    expect(formatRelativeAge(5 * 60 * 1000)).toBe("לפני 5 דקות");
  });

  it("formats whole hours under a day", () => {
    expect(formatRelativeAge(3 * 60 * 60 * 1000)).toBe("לפני 3 שעות");
  });

  it("special-cases exactly one day as 'אתמול'", () => {
    expect(formatRelativeAge(24 * 60 * 60 * 1000)).toBe("אתמול");
  });

  it("formats multiple days as a count", () => {
    expect(formatRelativeAge(5 * 24 * 60 * 60 * 1000)).toBe("לפני 5 ימים");
  });
});
