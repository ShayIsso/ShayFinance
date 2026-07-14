import { describe, it, expect } from "vitest";
import { routeConfidence } from "../router";

describe("routeConfidence", () => {
  it("routes 6–7 to auto_apply", () => {
    expect(routeConfidence(6)).toBe("auto_apply");
    expect(routeConfidence(7)).toBe("auto_apply");
  });

  it("routes 3–5 to review", () => {
    expect(routeConfidence(3)).toBe("review");
    expect(routeConfidence(4)).toBe("review");
    expect(routeConfidence(5)).toBe("review");
  });

  it("routes 1–2 to discard", () => {
    expect(routeConfidence(1)).toBe("discard");
    expect(routeConfidence(2)).toBe("discard");
  });

  it("rejects out-of-range or non-integer scores — never treats a 0–1 float as a tier", () => {
    expect(() => routeConfidence(0)).toThrow(RangeError);
    expect(() => routeConfidence(8)).toThrow(RangeError);
    expect(() => routeConfidence(0.9)).toThrow(RangeError);
    expect(() => routeConfidence(0.5)).toThrow(RangeError);
  });
});
