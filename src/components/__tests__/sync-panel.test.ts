import { describe, it, expect } from "vitest";
import {
  resolveBankDisplay,
  formatRelativeAge,
  takeFrames,
  hasSyncComplete,
  type BankSyncState,
  type ClientSyncEvent,
} from "@/components/sync-panel";
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

describe("takeFrames", () => {
  it("returns no frames and keeps everything as rest when the buffer has no separator yet", () => {
    const { frames, rest } = takeFrames('data: {"type":"progress"}');
    expect(frames).toEqual([]);
    expect(rest).toBe('data: {"type":"progress"}');
  });

  it("extracts a single complete frame and leaves no rest", () => {
    const { frames, rest } = takeFrames('data: {"type":"progress"}\n\n');
    expect(frames).toEqual(['data: {"type":"progress"}']);
    expect(rest).toBe("");
  });

  it("extracts multiple complete frames from one buffer, in order", () => {
    const { frames, rest } = takeFrames('data: {"a":1}\n\ndata: {"b":2}\n\n');
    expect(frames).toEqual(['data: {"a":1}', 'data: {"b":2}']);
    expect(rest).toBe("");
  });

  it("keeps a trailing partial frame as rest alongside completed ones", () => {
    const { frames, rest } = takeFrames('data: {"a":1}\n\ndata: {"b":2}');
    expect(frames).toEqual(['data: {"a":1}']);
    expect(rest).toBe('data: {"b":2}');
  });

  it("completes a frame whose separator itself arrived split across two reads", () => {
    // First chunk ends mid-separator: only one of the two newlines has arrived.
    const afterFirstChunk = takeFrames('data: {"type":"sync_complete"}\n');
    expect(afterFirstChunk.frames).toEqual([]);
    expect(afterFirstChunk.rest).toBe('data: {"type":"sync_complete"}\n');

    // Second chunk supplies the rest of the separator plus the next frame's start.
    const afterSecondChunk = takeFrames(afterFirstChunk.rest + '\ndata: {"type":"progress"');
    expect(afterSecondChunk.frames).toEqual(['data: {"type":"sync_complete"}']);
    expect(afterSecondChunk.rest).toBe('data: {"type":"progress"');
  });

  it("round-trips a frame containing Hebrew text unmangled", () => {
    const hebrewError = JSON.stringify({
      type: "bank_error",
      bank: "max",
      error: "סנכרון כבר פועל",
      hasScreenshot: false,
    });
    const { frames, rest } = takeFrames(`data: ${hebrewError}\n\n`);
    expect(frames).toEqual([`data: ${hebrewError}`]);
    expect(rest).toBe("");
    expect((JSON.parse(frames[0].slice(6)) as { error: string }).error).toBe("סנכרון כבר פועל");
  });
});

describe("hasSyncComplete", () => {
  it("is false for an empty event list", () => {
    expect(hasSyncComplete([])).toBe(false);
  });

  it("is false when only progress/bank_complete events were seen — the clean-EOF-without-completion case (#246)", () => {
    const events: ClientSyncEvent[] = [
      { type: "progress", bank: "max", status: "scraping" },
      { type: "bank_complete", bank: "max" },
    ];
    expect(hasSyncComplete(events)).toBe(false);
  });

  it("is true once sync_complete appears anywhere in the list", () => {
    const events: ClientSyncEvent[] = [
      { type: "progress", bank: "max", status: "scraping" },
      { type: "sync_complete", summary: { total: 3, byBank: { max: 3 } } },
    ];
    expect(hasSyncComplete(events)).toBe(true);
  });
});
