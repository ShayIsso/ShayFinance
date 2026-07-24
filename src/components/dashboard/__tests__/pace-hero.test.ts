import { describe, it, expect } from "vitest";
import { paceHeroViewModel } from "@/components/dashboard/pace-hero";
import type { BudgetPace, BudgetVerdict } from "@/lib/budgets";

function pace(overrides: Partial<BudgetPace>): BudgetPace {
  return {
    limit: 7000,
    spent: 5395,
    spentFraction: 5395 / 7000,
    elapsedFraction: 0.5,
    verdict: "on-pace",
    ...overrides,
  };
}

describe("paceHeroViewModel", () => {
  it("returns null when there's no expense target configured", () => {
    expect(paceHeroViewModel(null)).toBeNull();
  });

  it("maps 'over' to the destructive fill", () => {
    const vm = paceHeroViewModel(pace({ verdict: "over", spentFraction: 1.1 }));
    expect(vm?.barFillClass).toBe("bg-destructive");
    expect(vm?.fillPercent).toBe(100);
    expect(vm?.spentLabel).toBe("110%");
  });

  it("maps 'at-risk' to the warning fill", () => {
    const vm = paceHeroViewModel(pace({ verdict: "at-risk", spentFraction: 0.65 }));
    expect(vm?.barFillClass).toBe("bg-warning");
    expect(vm?.spentLabel).toBe("65%");
  });

  it("maps 'on-pace' to the neutral fill", () => {
    const vm = paceHeroViewModel(pace({ verdict: "on-pace" }));
    expect(vm?.barFillClass).toBe("bg-bar-strong");
  });

  it("maps 'comfortably-under' to the neutral fill — never emerald", () => {
    const vm = paceHeroViewModel(pace({ verdict: "comfortably-under", spentFraction: 0.2 }));
    expect(vm?.barFillClass).toBe("bg-bar-strong");
    expect(vm?.barFillClass).not.toMatch(/emerald/);
  });

  it("has a non-empty Hebrew sentence for every verdict", () => {
    const verdicts: BudgetVerdict[] = ["over", "at-risk", "on-pace", "comfortably-under"];
    for (const verdict of verdicts) {
      expect(paceHeroViewModel(pace({ verdict }))?.sentence).toBeTruthy();
    }
  });

  it("clamps an Infinity spentFraction (non-zero spend against a zero limit) to a 100% fill and an infinity label", () => {
    const vm = paceHeroViewModel(
      pace({ limit: 0, spent: 250, spentFraction: Infinity, verdict: "over" }),
    );
    expect(vm?.fillPercent).toBe(100);
    expect(vm?.spentLabel).toBe("∞%");
  });

  it("clamps a spend past 999% and an elapsed fraction to whole-percent labels", () => {
    const vm = paceHeroViewModel(
      pace({ spentFraction: 12, elapsedFraction: 0.333, verdict: "over" }),
    );
    expect(vm?.fillPercent).toBe(100);
    expect(vm?.spentLabel).toBe("1200%");
    expect(vm?.elapsedPercent).toBeCloseTo(33.3);
    expect(vm?.elapsedLabel).toBe("33%");
  });
});
