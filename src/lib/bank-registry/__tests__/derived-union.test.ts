import { describe, it, expect } from "vitest";
import { bankRegistry, enabledBankEntries, enabledBankTypes, type BankType } from "../index";

/** True only when A and B are the same type in both directions. */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

describe("the institution union", () => {
  it("is the array's id union in both directions, so it cannot be written beside the array", () => {
    const derived: Equals<BankType, (typeof bankRegistry)[number]["id"]> = true;
    expect(derived).toBe(true);
  });

  /**
   * The assertion above compares the alias to its own definition, so it catches a
   * hand-written union replacing the derivation but not the derivation quietly
   * widening. Losing the array's `as const` does exactly that: `satisfies` keeps
   * compiling while `id` becomes `string`, and every literal typo in every
   * migrated consumer then type-checks. These two assertions are what fail.
   */
  it("stays narrower than string, so a lost const assertion cannot go unnoticed", () => {
    const notWidened: Equals<BankType, string> = false;
    expect(notWidened).toBe(false);
  });

  it("rejects an unregistered literal", () => {
    // @ts-expect-error an id absent from the frozen array is not a BankType
    const unregistered: BankType = "institution-that-was-removed";
    expect(unregistered).toBeTruthy();
  });

  it("accepts every id the frozen array declares", () => {
    const ids: BankType[] = bankRegistry.map((entry) => entry.id);
    expect(ids).toHaveLength(bankRegistry.length);
  });
});

describe("enabledBankEntries", () => {
  it("offers every registered institution, since a tier is presentational and not a gate", () => {
    expect(enabledBankEntries().map((entry) => entry.id)).toEqual(
      bankRegistry.map((entry) => entry.id),
    );
  });
});

describe("enabledBankTypes", () => {
  it("lists the ids in registration order", () => {
    expect(enabledBankTypes()).toEqual(["discount", "max", "visaCal"]);
  });
});
