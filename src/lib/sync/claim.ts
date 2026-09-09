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

/**
 * Acquires `claim` and, if that succeeds, returns `makeEvents()` re-yielded
 * with the claim released once iteration ends — by normal completion, a
 * genuine throw, or the consumer walking away early. The last case matters
 * here: an SSE client disconnect tears down the route's `ReadableStream`
 * mid-iteration by calling `.return()` on whatever it's consuming, which
 * `yield*` forwards through to `makeEvents()`'s generator. That resumes this
 * function at its current `yield`, as if a `return` were written there, and
 * unwinds through the `finally` below exactly like a normal finish — so the
 * claim still gets released instead of leaking until the process restarts.
 *
 * Returns `null` — never a rejected/empty generator — when the claim is
 * already held, so a refused start is a plain synchronous fact the caller
 * can check before doing anything else (route.ts turns it into a 409 before
 * ever constructing its stream). Acquire and wrap happen together, in one
 * call, so there's no separate "acquire, then remember to wrap" step a
 * future caller could skip and end up releasing a claim it never took.
 */
export function acquireAndRelease<T>(
  claim: SyncClaim,
  makeEvents: () => AsyncGenerator<T>,
): AsyncGenerator<T> | null {
  if (!claim.acquire()) return null;

  async function* run(): AsyncGenerator<T> {
    try {
      yield* makeEvents();
    } finally {
      claim.release();
    }
  }
  return run();
}
