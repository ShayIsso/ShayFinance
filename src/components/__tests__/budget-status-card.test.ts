import { describe, it, expect } from "vitest";
import {
  buildTargetsHeadline,
  countByVerdict,
  VERDICT_LABEL,
  VERDICT_CHIP_CLASS,
} from "@/components/budget-status-card";
import type { BudgetVerdict } from "@/lib/budgets";

const ALL_VERDICTS: BudgetVerdict[] = ["over", "at-risk", "on-pace", "comfortably-under"];

describe("VERDICT_LABEL / VERDICT_CHIP_CLASS", () => {
  it("has a non-empty label and chip class for every pace verdict the module can return", () => {
    for (const verdict of ALL_VERDICTS) {
      expect(VERDICT_LABEL[verdict]).toBeTruthy();
      expect(VERDICT_CHIP_CLASS[verdict]).toBeTruthy();
    }
  });
});

describe("countByVerdict", () => {
  it("returns nothing for an empty budget list", () => {
    expect(countByVerdict([])).toEqual([]);
  });

  it("counts and orders by severity, omitting verdicts with zero budgets", () => {
    const counts = countByVerdict([
      { verdict: "on-pace" },
      { verdict: "over" },
      { verdict: "on-pace" },
      { verdict: "at-risk" },
    ]);
    expect(counts).toEqual([
      { verdict: "over", count: 1 },
      { verdict: "at-risk", count: 1 },
      { verdict: "on-pace", count: 2 },
    ]);
  });

  it("omits comfortably-under entirely when no budget has it", () => {
    const counts = countByVerdict([{ verdict: "over" }]);
    expect(counts.some((c) => c.verdict === "comfortably-under")).toBe(false);
  });
});

describe("buildTargetsHeadline", () => {
  it("hides both lines when neither target is set", () => {
    const headline = buildTargetsHeadline({
      expenseTarget: null,
      expenseActual: 500,
      savingsTarget: null,
    });
    expect(headline.expense).toBeNull();
    expect(headline.savings).toBeNull();
  });

  it("flags the expense line as over only when actual exceeds target", () => {
    const under = buildTargetsHeadline({
      expenseTarget: 1000,
      expenseActual: 900,
      savingsTarget: null,
    });
    expect(under.expense).toEqual({ target: 1000, actual: 900, over: false });

    const over = buildTargetsHeadline({
      expenseTarget: 1000,
      expenseActual: 1100,
      savingsTarget: null,
    });
    expect(over.expense?.over).toBe(true);
  });

  it("treats an exact match as not over", () => {
    const headline = buildTargetsHeadline({
      expenseTarget: 1000,
      expenseActual: 1000,
      savingsTarget: null,
    });
    expect(headline.expense?.over).toBe(false);
  });

  it("passes the savings verdict through untouched — null intra-month, met/missed at month close", () => {
    const intraMonth = buildTargetsHeadline({
      expenseTarget: null,
      expenseActual: 0,
      savingsTarget: { target: 3000, netSavings: 1200, monthClosed: false, verdict: null },
    });
    expect(intraMonth.savings).toEqual({
      target: 3000,
      actual: 1200,
      verdict: null,
      monthClosed: false,
    });

    const closedMet = buildTargetsHeadline({
      expenseTarget: null,
      expenseActual: 0,
      savingsTarget: { target: 3000, netSavings: 3400, monthClosed: true, verdict: "met" },
    });
    expect(closedMet.savings).toEqual({
      target: 3000,
      actual: 3400,
      verdict: "met",
      monthClosed: true,
    });
  });
});
