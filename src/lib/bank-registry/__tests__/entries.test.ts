import { describe, it, expect } from "vitest";
import { bankRegistry, getBankEntry, findBankEntry, isBankType } from "../index";

describe("bankRegistry", () => {
  it("registers exactly the three verified institutions", () => {
    expect(bankRegistry.map((e) => e.id)).toEqual(["discount", "max", "visaCal"]);
  });

  it("does not register an institution whose login needs an unattended MFA token", () => {
    expect(bankRegistry.map((e) => e.id)).not.toContain("oneZero");
  });
});

describe("getBankEntry", () => {
  it("returns the entry carrying every fact about the institution", () => {
    expect(getBankEntry("discount")).toMatchObject({
      id: "discount",
      nameHe: "דיסקונט",
      nameEn: "Bank Discount",
      kind: "bank",
      tier: "verified",
    });
  });
});

describe("findBankEntry", () => {
  it("returns undefined for an id no longer in the registry", () => {
    expect(findBankEntry("institution-that-was-removed")).toBeUndefined();
  });

  it("returns the entry for a registered id", () => {
    expect(findBankEntry("max")?.nameHe).toBe("מקס");
  });
});

describe("isBankType", () => {
  it("rejects an id absent from the registry", () => {
    expect(isBankType("institution-that-was-removed")).toBe(false);
  });

  it("accepts every registered id", () => {
    expect(bankRegistry.every((e) => isBankType(e.id))).toBe(true);
  });
});
