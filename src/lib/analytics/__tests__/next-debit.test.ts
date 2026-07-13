import { describe, it, expect } from "vitest";
import { computeNextDebitEstimate } from "../index";

// Local, slightly wider type than the pure function's parameter type so tests
// can attach an extra `status` field and prove it plays no role in the
// computation (the function only ever reads processedDate/chargedAmount).
type TestTx = {
  processedDate: string;
  chargedAmount: number;
  status?: "completed" | "pending";
  type?: "normal" | "installments";
};

describe("computeNextDebitEstimate", () => {
  it("excludes a transaction dated exactly today (exclusive lower bound)", () => {
    const txs: TestTx[] = [{ processedDate: "2026-07-13", chargedAmount: -100 }];
    const result = computeNextDebitEstimate(txs, "2026-07-13");
    expect(result).toEqual({ estimate: 0, nextDebitDate: null });
  });

  it("includes a transaction dated exactly today + 31 days (inclusive upper bound)", () => {
    const txs: TestTx[] = [{ processedDate: "2026-08-13", chargedAmount: -250 }];
    const result = computeNextDebitEstimate(txs, "2026-07-13");
    expect(result.estimate).toBe(-250);
    expect(result.nextDebitDate).toBe("2026-08-13");
  });

  it("excludes a transaction dated today + 32 days (past the window)", () => {
    const txs: TestTx[] = [{ processedDate: "2026-08-14", chargedAmount: -250 }];
    const result = computeNextDebitEstimate(txs, "2026-07-13");
    expect(result).toEqual({ estimate: 0, nextDebitDate: null });
  });

  it("handles a window that crosses a month/year boundary", () => {
    const txs: TestTx[] = [
      { processedDate: "2026-01-01", chargedAmount: -300 }, // today + 31d exactly
      { processedDate: "2026-01-02", chargedAmount: -50 }, // one day past the window
    ];
    const result = computeNextDebitEstimate(txs, "2025-12-01");
    expect(result.estimate).toBe(-300);
    expect(result.nextDebitDate).toBe("2026-01-01");
  });

  it("ignores transaction status — only the date predicate decides", () => {
    const txs: TestTx[] = [
      // Future-dated pending row: counts.
      { processedDate: "2026-07-20", chargedAmount: -400, status: "pending" },
      // Stale past-dated pending row: falls out on date alone, not status.
      { processedDate: "2026-07-01", chargedAmount: -999, status: "pending" },
      // Future-dated completed row: counts.
      { processedDate: "2026-07-25", chargedAmount: -100, status: "completed" },
    ];
    const result = computeNextDebitEstimate(txs, "2026-07-13");
    expect(result.estimate).toBe(-500);
  });

  it("returns estimate 0 and nextDebitDate null for an empty window", () => {
    const result = computeNextDebitEstimate([], "2026-07-13");
    expect(result).toEqual({ estimate: 0, nextDebitDate: null });
  });

  it("returns a positive estimate when refunds outweigh charges in the window", () => {
    const txs: TestTx[] = [
      { processedDate: "2026-07-15", chargedAmount: -80 },
      { processedDate: "2026-07-16", chargedAmount: -40 },
      { processedDate: "2026-07-18", chargedAmount: 200 }, // refund
    ];
    const result = computeNextDebitEstimate(txs, "2026-07-13");
    expect(result.estimate).toBe(80);
  });

  it("counts only the in-window installment payment, not a later one", () => {
    const txs: TestTx[] = [
      // Payment 2 of 4 — lands inside the window.
      {
        processedDate: "2026-07-28",
        chargedAmount: -300,
        type: "installments",
      },
      // Payment 3 of 4 — one month later, outside the window.
      {
        processedDate: "2026-08-28",
        chargedAmount: -300,
        type: "installments",
      },
    ];
    const result = computeNextDebitEstimate(txs, "2026-07-13");
    expect(result.estimate).toBe(-300);
    expect(result.nextDebitDate).toBe("2026-07-28");
  });

  it("picks the date with the largest absolute summed charge as the hint, not an early straggler", () => {
    const txs: TestTx[] = [
      // Small off-cycle straggler, early in the window.
      { processedDate: "2026-07-15", chargedAmount: -10 },
      // Main billing cycle cluster, later in the window, much larger in total.
      { processedDate: "2026-08-01", chargedAmount: -400 },
      { processedDate: "2026-08-01", chargedAmount: -150 },
      { processedDate: "2026-08-01", chargedAmount: -50 },
    ];
    const result = computeNextDebitEstimate(txs, "2026-07-13");
    expect(result.estimate).toBe(-610);
    expect(result.nextDebitDate).toBe("2026-08-01");
  });
});
