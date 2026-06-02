import { describe, it, expect } from "vitest";
import { cronTimeToExpression } from "../config";

describe("cronTimeToExpression", () => {
  it('converts "07:00" to "0 7 * * *"', () => {
    expect(cronTimeToExpression("07:00")).toBe("0 7 * * *");
  });

  it('converts "00:00" (midnight) to "0 0 * * *"', () => {
    expect(cronTimeToExpression("00:00")).toBe("0 0 * * *");
  });

  it('converts "23:45" to "45 23 * * *"', () => {
    expect(cronTimeToExpression("23:45")).toBe("45 23 * * *");
  });

  it('converts "12:30" to "30 12 * * *"', () => {
    expect(cronTimeToExpression("12:30")).toBe("30 12 * * *");
  });

  it('strips leading zeros (e.g. "09:05" → "5 9 * * *")', () => {
    expect(cronTimeToExpression("09:05")).toBe("5 9 * * *");
  });

  it("throws on an empty string", () => {
    expect(() => cronTimeToExpression("")).toThrow();
  });

  it('throws on a string without colon separator (e.g. "0700")', () => {
    expect(() => cronTimeToExpression("0700")).toThrow();
  });

  it('throws on an out-of-range hour (e.g. "25:00")', () => {
    expect(() => cronTimeToExpression("25:00")).toThrow();
  });

  it('throws on an out-of-range minute (e.g. "12:60")', () => {
    expect(() => cronTimeToExpression("12:60")).toThrow();
  });

  it("throws on a non-string input", () => {
    // @ts-expect-error — testing runtime guard
    expect(() => cronTimeToExpression(700)).toThrow();
  });
});
