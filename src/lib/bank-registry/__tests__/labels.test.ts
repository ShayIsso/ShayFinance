import { describe, it, expect } from "vitest";
import { bankLabel, bankRegistry } from "../index";

describe("bankLabel", () => {
  it("resolves the Hebrew name by default, matching the RTL interface", () => {
    expect(bankLabel("visaCal")).toBe("ויזה כאל");
  });

  it("resolves the English name when asked for it", () => {
    expect(bankLabel("visaCal", "en")).toBe("Cal");
  });

  it("resolves an id absent from the registry instead of returning nothing", () => {
    expect(bankLabel("institution-that-was-removed")).toBe("מוסד לא ידוע");
  });

  it("resolves an absent id in English too", () => {
    expect(bankLabel("institution-that-was-removed", "en")).toBe("Unknown institution");
  });

  it("resolves every registered institution to a non-empty label in both locales", () => {
    for (const entry of bankRegistry) {
      expect(bankLabel(entry.id)).toBeTruthy();
      expect(bankLabel(entry.id, "en")).toBeTruthy();
    }
  });
});
