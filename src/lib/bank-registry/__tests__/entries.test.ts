import { describe, it, expect } from "vitest";
import {
  bankRegistry,
  findBankEntry,
  isBankType,
  bankKindOf,
  bankIssuesOtp,
  credentialFieldsFor,
  bankLabel,
} from "../index";

const UNREGISTERED = "institution-that-was-removed";

describe("bankRegistry", () => {
  it("registers exactly the three verified institutions", () => {
    expect(bankRegistry.map((e) => e.id)).toEqual(["discount", "max", "visaCal"]);
  });

  it("marks every registered institution as verified", () => {
    expect(bankRegistry.map((e) => [e.id, e.tier])).toEqual([
      ["discount", "verified"],
      ["max", "verified"],
      ["visaCal", "verified"],
    ]);
  });

  it("gives each institution a distinct id, so no entry can shadow another", () => {
    const ids = bankRegistry.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not register an institution whose login needs an unattended MFA token", () => {
    expect(bankRegistry.map((e) => e.id)).not.toContain("oneZero");
  });

  it("names every institution in both Hebrew and English", () => {
    for (const entry of bankRegistry) {
      expect(entry.nameHe).toBeTruthy();
      expect(entry.nameEn).toBeTruthy();
    }
  });
});

describe("findBankEntry", () => {
  it("returns undefined for an id no longer in the registry", () => {
    expect(findBankEntry(UNREGISTERED)).toBeUndefined();
  });

  it("returns the entry carrying every fact about the institution", () => {
    expect(findBankEntry("discount")).toMatchObject({
      id: "discount",
      nameHe: "דיסקונט",
      nameEn: "Bank Discount",
      kind: "bank",
      tier: "verified",
    });
  });
});

describe("isBankType", () => {
  it("rejects an id absent from the registry", () => {
    expect(isBankType(UNREGISTERED)).toBe(false);
  });

  it("accepts every registered id", () => {
    expect(bankRegistry.every((e) => isBankType(e.id))).toBe(true);
  });
});

describe("a stored row naming a de-registered institution", () => {
  it("is answered by every id-keyed accessor without throwing", () => {
    expect(findBankEntry(UNREGISTERED)).toBeUndefined();
    expect(bankKindOf(UNREGISTERED)).toBeUndefined();
    expect(bankIssuesOtp(UNREGISTERED)).toBe(false);
    expect(credentialFieldsFor(UNREGISTERED)).toEqual([]);
    expect(bankLabel(UNREGISTERED)).toBeTruthy();
  });
});
