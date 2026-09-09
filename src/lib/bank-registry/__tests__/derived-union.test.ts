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
