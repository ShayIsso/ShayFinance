import { describe, it, expect } from "vitest";
import { monthDateRange } from "../month-window";

// The single owner of the calendar-month window (issue #168). The reports store,
// the analytics DB wrappers, and the CSV href builder all consume THIS function,
// so pinning its boundaries pins the "reports totals agree with the Dashboard"
// invariant — a divergent copy would break it silently.
describe("monthDateRange", () => {
  it("spans the whole calendar month with zero-padded ISO bounds", () => {
    expect(monthDateRange(2026, 6)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(monthDateRange(2026, 1)).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("resolves month length correctly, including February leap years", () => {
    expect(monthDateRange(2024, 2).to).toBe("2024-02-29"); // leap
    expect(monthDateRange(2025, 2).to).toBe("2025-02-28"); // non-leap
    expect(monthDateRange(2026, 11).to).toBe("2026-11-30"); // 30-day month
  });
});
