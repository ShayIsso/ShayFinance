/**
 * A pure pacing schedule for sequential provider batches. It computes delays and
 * retry/give-up decisions from state passed in — it never reads the clock and
 * never sleeps. The consuming network layer (ticket #147) owns the actual timer
 * and `Date.now()`; keeping the schedule pure makes the backoff curve and the
 * give-up boundary testable without waiting real time.
 */
export interface PacingPolicy {
  /** Total attempts allowed per batch, including the first (>= 1). */
  readonly maxAttempts: number;
  /** Backoff base for the first retry, in milliseconds. */
  readonly baseDelayMs: number;
  /** Ceiling on any single backoff delay. */
  readonly maxDelayMs: number;
  /** Steady pause after a successful batch, before the next one. */
  readonly interBatchDelayMs: number;
}

export type PacingOutcome = "ok" | "rate_limited" | "error";

export interface PacingDecision {
  readonly action: "proceed" | "retry" | "give_up";
  readonly delayMs: number;
}

/** Exponential backoff for the retry that follows a failed 1-based attempt, capped. */
export function backoffDelayMs(policy: PacingPolicy, attempt: number): number {
  const raw = policy.baseDelayMs * 2 ** (attempt - 1);
  return Math.min(raw, policy.maxDelayMs);
}

/**
 * Decides what to do after an attempt on a batch.
 *
 * `attempt` is the 1-based number of the attempt that just finished. On `ok`,
 * proceed after the steady inter-batch pause. On a failure, retry with capped
 * exponential backoff until `maxAttempts` is reached, then give up on the batch
 * (the run records it as a failure and moves on — a stuck batch never blocks the
 * rest).
 */
export function planPacing(
  policy: PacingPolicy,
  input: { attempt: number; outcome: PacingOutcome },
): PacingDecision {
  if (policy.maxAttempts < 1) throw new RangeError("maxAttempts must be >= 1");
  if (input.attempt < 1) throw new RangeError("attempt must be >= 1");

  if (input.outcome === "ok") {
    return { action: "proceed", delayMs: policy.interBatchDelayMs };
  }
  if (input.attempt >= policy.maxAttempts) {
    return { action: "give_up", delayMs: 0 };
  }
  return { action: "retry", delayMs: backoffDelayMs(policy, input.attempt) };
}
