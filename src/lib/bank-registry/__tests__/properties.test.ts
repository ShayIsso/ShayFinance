import { describe, it, expect } from "vitest";
import { bankKindOf, bankIssuesOtp, credentialFieldsFor } from "../index";

describe("bankKindOf", () => {
  it("reports the account-holding institution as a bank", () => {
    expect(bankKindOf("discount")).toBe("bank");
  });

  it("reports both card issuers as cards", () => {
    expect([bankKindOf("max"), bankKindOf("visaCal")]).toEqual(["card", "card"]);
  });

  it("reports no kind for an unregistered id, so a kind comparison excludes it", () => {
    expect(bankKindOf("institution-that-was-removed")).toBeUndefined();
  });
});

describe("bankIssuesOtp", () => {
  it("flags the institution that challenges login with a one-time code", () => {
    expect(bankIssuesOtp("discount")).toBe(true);
  });

  it("does not flag institutions that log in with credentials alone", () => {
    expect([bankIssuesOtp("max"), bankIssuesOtp("visaCal")]).toEqual([false, false]);
  });

  it("does not flag an unregistered id", () => {
    expect(bankIssuesOtp("institution-that-was-removed")).toBe(false);
  });
});

describe("credentialFieldsFor", () => {
  it("lists the account-holding institution's fields in form order", () => {
    expect(credentialFieldsFor("discount")).toEqual([
      { key: "id", kind: "national-id", label: "תעודת זהות" },
      { key: "password", kind: "password", label: "סיסמה" },
      { key: "num", kind: "account-number", label: "מספר חשבון" },
    ]);
  });

  it("lists a card issuer's internet username rather than a national id", () => {
    expect(credentialFieldsFor("visaCal").map((f) => f.key)).toEqual(["username", "password"]);
  });

  it("lists no fields for an unregistered id, so a caller strips rather than exposes", () => {
    expect(credentialFieldsFor("institution-that-was-removed")).toEqual([]);
  });
});
