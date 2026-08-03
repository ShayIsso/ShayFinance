import { describe, it, expect } from "vitest";
import {
  capUpcomingCharges,
  isLateButLive,
  formatMonthlyCountLabel,
  UPCOMING_DISPLAY_CAP,
  type UpcomingCharge,
} from "@/components/dashboard/upcoming-charges-card";

function makeCharge(overrides: Partial<UpcomingCharge> = {}): UpcomingCharge {
  return {
    id: overrides.id ?? "series-1",
    merchant: overrides.merchant ?? "merchant-a",
    displayName: overrides.displayName ?? null,
    expectedAmount: overrides.expectedAmount ?? 100,
    cadence: overrides.cadence ?? "monthly",
    projectedDate: overrides.projectedDate ?? "2026-08-10",
  };
}

describe("capUpcomingCharges", () => {
  it("returns the full list when under the cap", () => {
    const charges = [makeCharge({ id: "1" }), makeCharge({ id: "2" })];
    expect(capUpcomingCharges(charges)).toEqual(charges);
  });

  it("caps at UPCOMING_DISPLAY_CAP by default, matching the Recent side's row count", () => {
    const charges = Array.from({ length: UPCOMING_DISPLAY_CAP + 5 }, (_, i) =>
      makeCharge({ id: `series-${i}` }),
    );
    const capped = capUpcomingCharges(charges);
    expect(capped).toHaveLength(UPCOMING_DISPLAY_CAP);
    expect(capped).toEqual(charges.slice(0, UPCOMING_DISPLAY_CAP));
  });

  it("accepts an explicit cap override", () => {
    const charges = [makeCharge({ id: "1" }), makeCharge({ id: "2" }), makeCharge({ id: "3" })];
    expect(capUpcomingCharges(charges, 1)).toEqual([charges[0]]);
  });

  it("does not re-sort — the API already sorts late-but-live first", () => {
    const charges = [makeCharge({ id: "2" }), makeCharge({ id: "1" })];
    expect(capUpcomingCharges(charges).map((c) => c.id)).toEqual(["2", "1"]);
  });
});

describe("isLateButLive", () => {
  it("is false when the projected date is today", () => {
    expect(isLateButLive("2026-08-03", "2026-08-03")).toBe(false);
  });

  it("is false when the projected date is in the future", () => {
    expect(isLateButLive("2026-08-10", "2026-08-03")).toBe(false);
  });

  it("is true when the projected date has already passed (late but live)", () => {
    expect(isLateButLive("2026-06-01", "2026-08-03")).toBe(true);
  });

  it("is true for a projection many months in the past, as an annual series' bounded lateness allows", () => {
    // Annual death threshold is ~183 days beyond the interval (ADR-0012) —
    // a projection this stale can still be a genuinely live series.
    expect(isLateButLive("2026-02-01", "2026-08-03")).toBe(true);
  });
});

describe("formatMonthlyCountLabel", () => {
  it("uses the singular form for exactly one charge", () => {
    expect(formatMonthlyCountLabel(1)).toBe("חיוב קבוע אחד צפוי החודש");
  });

  it("uses the plural form with the count for more than one charge", () => {
    expect(formatMonthlyCountLabel(3)).toBe("3 חיובים קבועים צפויים החודש");
  });

  it("uses the plural form for zero (defensive — the card never calls this at zero)", () => {
    expect(formatMonthlyCountLabel(0)).toBe("0 חיובים קבועים צפויים החודש");
  });
});
