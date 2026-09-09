import { describe, it, expect } from "vitest";
import { createSyncClaim, acquireAndRelease } from "../claim";

function fakeEvents<T>(events: T[]): () => AsyncGenerator<T> {
  return async function* () {
    for (const event of events) yield event;
  };
}

async function drain<T>(events: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const event of events) out.push(event);
  return out;
}

// Synthetic event shapes mirroring the scraper's SyncEvent union — plain
// objects, not imported types, so this suite stays decoupled from the
// scraper module (ADR-0003 protected) and needs no DB or browser.
const BANK_ERROR = {
  type: "bank_error",
  bank: "max",
  error: "synthetic-test-failure",
  hasScreenshot: false,
} as const;

const OTP_TIMEOUT = { type: "otp_timeout", bank: "discount" } as const;

const SYNC_COMPLETE = { type: "sync_complete" } as const;

describe("createSyncClaim", () => {
  it("refuses a second concurrent acquire while the first is held", () => {
    const claim = createSyncClaim();
    expect(claim.acquire()).toBe(true);
    expect(claim.acquire()).toBe(false);
  });

  it("allows re-acquiring once released", () => {
    const claim = createSyncClaim();
    claim.acquire();
    claim.release();
    expect(claim.acquire()).toBe(true);
  });

  it("release is a no-op when the claim isn't held", () => {
    const claim = createSyncClaim();
    expect(() => claim.release()).not.toThrow();
    expect(claim.isHeld()).toBe(false);
  });
});

describe("acquireAndRelease", () => {
  it("refuses a second concurrent invocation while a run is in progress", () => {
    const claim = createSyncClaim();
    claim.acquire(); // a first sync is already running and holds the claim

    const refused = acquireAndRelease(claim, fakeEvents([SYNC_COMPLETE]));

    expect(refused).toBeNull();
    // The first run's claim must be completely unaffected by the refused attempt.
    expect(claim.isHeld()).toBe(true);
  });

  it("returns null for a second call while the first call's run is still mid-stream, not just before it starts", async () => {
    const claim = createSyncClaim();

    async function* stillRunning(): AsyncGenerator<{ type: string }> {
      yield { type: "progress" };
      yield { type: "progress" };
    }

    const first = acquireAndRelease(claim, stillRunning);
    expect(first).not.toBeNull();
    await first!.events.next(); // first run has genuinely started, not just acquired

    expect(acquireAndRelease(claim, fakeEvents([SYNC_COMPLETE]))).toBeNull();
  });

  it("releases the claim after the wrapped run completes successfully", async () => {
    const claim = createSyncClaim();

    const claimed = acquireAndRelease(claim, fakeEvents([SYNC_COMPLETE]));
    expect(claimed).not.toBeNull();
    await drain(claimed!.events);

    expect(claim.isHeld()).toBe(false);
  });

  // acquireAndRelease is agnostic to what gets yielded, so this and the OTP
  // test below can't discriminate the way a true regression test would —
  // they're kept anyway because the ticket's acceptance criteria name these
  // two cases explicitly, and they document that per-bank failure/timeout
  // events reach the caller unfiltered. The "still mid-stream" and
  // "never iterated" tests carry the actual discriminating power.
  it("releases the claim after a per-bank failure is yielded (ADR-0003: yielded, not thrown)", async () => {
    const claim = createSyncClaim();

    const claimed = acquireAndRelease(claim, fakeEvents([BANK_ERROR, SYNC_COMPLETE]));
    const seen = await drain(claimed!.events);

    // The failure event still reaches the caller — the guard must not swallow it.
    expect(seen).toContainEqual(BANK_ERROR);
    expect(claim.isHeld()).toBe(false);
  });

  it("releases the claim after an OTP timeout is yielded", async () => {
    const claim = createSyncClaim();

    const claimed = acquireAndRelease(claim, fakeEvents([OTP_TIMEOUT, SYNC_COMPLETE]));
    const seen = await drain(claimed!.events);

    expect(seen).toContainEqual(OTP_TIMEOUT);
    expect(claim.isHeld()).toBe(false);
  });

  it("releases the claim when the consumer disconnects mid-stream", async () => {
    const claim = createSyncClaim();

    // Yields twice, then would keep going if asked for more — mirrors
    // syncAllBanks still mid-run when the SSE client goes away.
    async function* stillRunning(): AsyncGenerator<{ type: string }> {
      yield { type: "progress" };
      yield { type: "progress" };
    }

    const claimed = acquireAndRelease(claim, stillRunning);
    const first = await claimed!.events.next();
    expect(first.done).toBe(false);

    // Simulates the SSE route's ReadableStream `cancel()` calling `.return()`
    // on the generator it's consuming.
    await claimed!.events.return(undefined);

    expect(claim.isHeld()).toBe(false);
  });

  it("releases the claim even when the wrapped run throws", async () => {
    const claim = createSyncClaim();

    async function* throwing(): AsyncGenerator<{ type: string }> {
      yield { type: "progress" };
      throw new Error("synthetic DB failure");
    }

    const claimed = acquireAndRelease(claim, throwing);
    await expect(drain(claimed!.events)).rejects.toThrow("synthetic DB failure");
    expect(claim.isHeld()).toBe(false);
  });

  it("lets a fresh run acquire the claim once the previous one has released it", async () => {
    const claim = createSyncClaim();

    const first = acquireAndRelease(claim, fakeEvents([SYNC_COMPLETE]));
    expect(acquireAndRelease(claim, fakeEvents([SYNC_COMPLETE]))).toBeNull(); // still refused mid-run
    await drain(first!.events);

    expect(acquireAndRelease(claim, fakeEvents([SYNC_COMPLETE]))).not.toBeNull();
  });

  describe("ClaimedRun.release()", () => {
    it("releases the claim even when events is never iterated at all", () => {
      const claim = createSyncClaim();
      const claimed = acquireAndRelease(claim, fakeEvents([SYNC_COMPLETE]));

      // No .next() call on claimed.events — simulates a caller that acquires
      // and then exits before ever starting to consume (an awaited check
      // added between acquiring and iterating, say) without this standalone
      // release existing to call.
      claimed!.release();

      expect(claim.isHeld()).toBe(false);
    });

    it("is the reason release exists: .return() alone does not release a not-yet-started generator", async () => {
      const claim = createSyncClaim();
      const claimed = acquireAndRelease(claim, fakeEvents([SYNC_COMPLETE]));

      // .next() was never called, so events is still "suspendedStart" — per
      // the async generator spec, .return() on a generator in that state
      // completes it WITHOUT running its body (and so its `finally`) at all.
      await claimed!.events.return(undefined);

      expect(claim.isHeld()).toBe(true); // still held — exactly the gap `release` closes
    });

    it("is idempotent and does not affect a claim re-acquired by someone else after it already fired", () => {
      const claim = createSyncClaim();
      const claimed = acquireAndRelease(claim, fakeEvents([SYNC_COMPLETE]))!;

      claimed.release();
      expect(claim.isHeld()).toBe(false);

      claim.acquire(); // a different run acquires the now-free claim

      claimed.release(); // must not steal the new holder's claim
      expect(claim.isHeld()).toBe(true);
    });
  });
});
