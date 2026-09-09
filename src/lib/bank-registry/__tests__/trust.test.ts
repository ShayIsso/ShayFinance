import { describe, it, expect } from "vitest";
import { resolveBankTrust, getBankEntry, type BankRegistryEntry } from "../index";

const verifiedEntry: BankRegistryEntry = getBankEntry("discount");
const experimentalEntry: BankRegistryEntry = { ...getBankEntry("discount"), tier: "experimental" };

describe("resolveBankTrust", () => {
  it("keeps a verified institution verified before this install has synced it", () => {
    expect(resolveBankTrust({ entry: verifiedEntry, hasRecordedSuccessfulSync: false })).toBe(
      "verified",
    );
  });

  it("keeps a verified institution verified after a successful sync too", () => {
    expect(resolveBankTrust({ entry: verifiedEntry, hasRecordedSuccessfulSync: true })).toBe(
      "verified",
    );
  });

  it("caveats an experimental institution this install has never synced", () => {
    expect(resolveBankTrust({ entry: experimentalEntry, hasRecordedSuccessfulSync: false })).toBe(
      "experimental",
    );
  });

  it("retires the caveat once this install has recorded a successful sync", () => {
    expect(resolveBankTrust({ entry: experimentalEntry, hasRecordedSuccessfulSync: true })).toBe(
      "observed",
    );
  });

  it("never reports an install's own evidence as something we verified", () => {
    expect(
      resolveBankTrust({ entry: experimentalEntry, hasRecordedSuccessfulSync: true }),
    ).not.toBe("verified");
  });
});
