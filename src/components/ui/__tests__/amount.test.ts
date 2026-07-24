import { describe, it, expect } from "vitest";
import { amountColorClass, formatAmount, normalizeCurrency } from "@/components/ui/amount";

describe("amountColorClass", () => {
  it("maps positive money to text-pos (emerald)", () => {
    expect(amountColorClass(1234.5, true)).toBe("text-pos");
  });

  it("maps negative money to text-neg (red)", () => {
    expect(amountColorClass(-1, true)).toBe("text-neg");
  });

  it("maps zero to text-pos (zero is non-negative money)", () => {
    expect(amountColorClass(0, true)).toBe("text-pos");
  });

  it("returns undefined when colorize is false regardless of sign", () => {
    expect(amountColorClass(-100, false)).toBeUndefined();
    expect(amountColorClass(100, false)).toBeUndefined();
    expect(amountColorClass(0, false)).toBeUndefined();
  });

  it("never colors a non-positive figure emerald", () => {
    for (const v of [-0.01, -50, -9999]) {
      expect(amountColorClass(v, true)).toBe("text-neg");
    }
  });
});

describe("normalizeCurrency", () => {
  it("maps known symbols to ISO 4217 codes", () => {
    expect(normalizeCurrency("₪")).toBe("ILS");
    expect(normalizeCurrency("$")).toBe("USD");
  });

  it("passes through strings that are already codes", () => {
    expect(normalizeCurrency("ILS")).toBe("ILS");
    expect(normalizeCurrency("USD")).toBe("USD");
  });
});

describe("formatAmount", () => {
  it("honors the fractionDigits override (no fractional part at 0 digits)", () => {
    // he-IL uses "," as the thousands separator, so assert specifically on the
    // decimal point: 0 digits → no ".dd" tail; 2 digits → a ".dd" tail present.
    expect(formatAmount(1000, "ILS", 0)).not.toMatch(/\.\d/);
    expect(formatAmount(1000, "ILS", 2)).toMatch(/\.\d\d/);
  });
});
