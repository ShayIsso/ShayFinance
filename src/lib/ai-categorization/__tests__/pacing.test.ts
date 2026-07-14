import { describe, it, expect } from "vitest";
import { planPacing, backoffDelayMs, type PacingPolicy } from "../pacing";

const policy: PacingPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  interBatchDelayMs: 500,
};

describe("backoffDelayMs", () => {
  it("grows exponentially from the base", () => {
    expect(backoffDelayMs(policy, 1)).toBe(1000);
    expect(backoffDelayMs(policy, 2)).toBe(2000);
    expect(backoffDelayMs(policy, 3)).toBe(4000);
  });

  it("is capped at maxDelayMs", () => {
    expect(backoffDelayMs(policy, 5)).toBe(8000);
  });
});

describe("planPacing", () => {
  it("proceeds with the inter-batch pause after a success", () => {
    expect(planPacing(policy, { attempt: 1, outcome: "ok" })).toEqual({
      action: "proceed",
      delayMs: 500,
    });
  });

  it("retries with backoff after a recoverable failure below the attempt cap", () => {
    expect(planPacing(policy, { attempt: 1, outcome: "rate_limited" })).toEqual({
      action: "retry",
      delayMs: 1000,
    });
    expect(planPacing(policy, { attempt: 2, outcome: "error" })).toEqual({
      action: "retry",
      delayMs: 2000,
    });
  });

  it("gives up once maxAttempts is reached", () => {
    expect(planPacing(policy, { attempt: 3, outcome: "error" })).toEqual({
      action: "give_up",
      delayMs: 0,
    });
  });

  it("rejects invalid policy or attempt state", () => {
    expect(() => planPacing({ ...policy, maxAttempts: 0 }, { attempt: 1, outcome: "ok" })).toThrow(
      RangeError,
    );
    expect(() => planPacing(policy, { attempt: 0, outcome: "ok" })).toThrow(RangeError);
  });
});
