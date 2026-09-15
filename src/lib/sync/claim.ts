// In-progress claim for `syncAllBanks` (#246). One claim, shared by every
// entry point that can launch a sync — the SSE route and the scheduler —
// so two concurrent runs can never both hold it. Deliberately process-lifetime
// (an in-memory boolean, not a DB row): this app is single-user/single-instance
// (CONTEXT.md "single-user, self-hosted"), so a crashed or killed process
// holds no claim — recovery on restart is automatic, with no staleness
// window to reconcile the way a persisted claim would need.

export type SyncClaim = {
  /** Atomically takes the claim. Returns false if it is already held. */
  acquire(): boolean;
  /** Releases the claim. Safe to call even when not held. */
  release(): void;
  isHeld(): boolean;
};

/**
 * Factory rather than a bare module export — each test gets an isolated
 * claim instead of sharing (and having to reset) one hidden global, and
 * `src/lib/sync/index.ts` instantiates exactly one for the real process.
 */
export function createSyncClaim(): SyncClaim {
  let held = false;
  return {
    acquire() {
      if (held) return false;
      held = true;
      return true;
    },
    release() {
      held = false;
    },
    isHeld() {
      return held;
    },
  };
}

export type ClaimedRun<T> = {
  events: AsyncGenerator<T>;
  /**
   * Releases the claim. Idempotent, and safe to call even if `events` was
   * never iterated at all — see the note on `acquireAndRelease` below for
   * why that case needs its own release path rather than relying on
   * `events`'s `finally`.
   */
  release(): void;
};

/**
 * Acquires `claim` and, if that succeeds, returns `events` (re-yielding
 * `makeEvents()`) plus a standalone `release`. Returns `null` — never a
 * rejected/empty result — when the claim is already held, so a refused
 * start is a plain synchronous fact the caller can check before doing
 * anything else (route.ts turns it into a 409 before ever constructing its
 * stream).
 *
 * `events`'s own `finally` releases the claim once iteration ends — by
 * normal completion, a genuine throw, or the consumer walking away early.
 * The last case matters: an SSE client disconnect tears the route's
 * `ReadableStream` down mid-iteration by calling `.return()` on whatever
 * it's consuming, which `yield*` forwards through to `makeEvents()`'s
 * generator, resuming this function at its current `yield` as if a
 * `return` were written there and unwinding through the `finally` exactly
 * like a normal finish.
 *
 * But `.return()` on a generator that was never iterated (no `.next()`
 * call yet) completes it WITHOUT running the body at all — the `finally`
 * never executes, so a caller that acquires, then exits before ever
 * starting to consume `events` (an `await`ed check added between acquiring
 * and iterating, say), would leak the claim for the rest of the process
 * with no timeout to recover it. `release` is exposed separately so a
 * caller's own cleanup path can guarantee release regardless of whether
 * `events` ever started — this is why `acquireAndRelease` hands back an
 * object instead of a bare generator.
 */
export function acquireAndRelease<T>(
  claim: SyncClaim,
  makeEvents: () => AsyncGenerator<T>,
): ClaimedRun<T> | null {
  if (!claim.acquire()) return null;

  let released = false;
  function release(): void {
    if (released) return;
    released = true;
    claim.release();
  }

  async function* run(): AsyncGenerator<T> {
    try {
      yield* makeEvents();
    } finally {
      release();
    }
  }
  return { events: run(), release };
}
