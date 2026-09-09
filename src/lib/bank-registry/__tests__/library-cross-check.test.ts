import { describe, it, expect } from "vitest";
import { CompanyTypes, SCRAPERS } from "israeli-bank-scrapers-core/lib/definitions";
import { enabledBankEntries } from "../index";

/**
 * Login-field names the library declares that a user never types, and which our
 * curated descriptors therefore must not carry:
 *   - `otpCodeRetriever` is a callback the caller supplies, not a value;
 *   - `otpLongTermToken` is an MFA token issued by a previous login.
 *
 * Surveyed across all of the library's companies, not only the ones registered
 * here, so an institution promoted out of the experimental tier is measured
 * against the same list. Every other declared name is a value the user enters.
 */
const NON_USER_ENTERED_LOGIN_FIELDS: readonly string[] = ["otpCodeRetriever", "otpLongTermToken"];

function userEnteredLoginFields(company: CompanyTypes): string[] {
  return SCRAPERS[company].loginFields
    .filter((field) => !NON_USER_ENTERED_LOGIN_FIELDS.includes(field))
    .sort();
}

describe("registry entries cross-checked against the scraper library", () => {
  it.each(enabledBankEntries().map((entry) => [entry.id, entry] as const))(
    "%s declares exactly the library's user-entered login fields",
    (_id, entry) => {
      const declared = entry.credentialFields.map((field) => field.key).sort();
      expect(declared).toEqual(userEnteredLoginFields(entry.company));
    },
  );

  it.each(enabledBankEntries().map((entry) => [entry.id, entry] as const))(
    "%s names a company the library still supports",
    (_id, entry) => {
      expect(SCRAPERS[entry.company]).toBeDefined();
      expect(Object.values(CompanyTypes)).toContain(entry.company);
    },
  );

  it.each(enabledBankEntries().map((entry) => [entry.id, entry] as const))(
    "%s declares each field once, so a form cannot render a duplicate input",
    (_id, entry) => {
      const keys = entry.credentialFields.map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
    },
  );

  it.each(enabledBankEntries().map((entry) => [entry.id, entry] as const))(
    "%s carries a secret field for the credential endpoint to strip",
    (_id, entry) => {
      expect(entry.credentialFields.some((field) => field.kind === "password")).toBe(true);
    },
  );

  it("excludes only names the library actually declares, so the exclusion list cannot rot", () => {
    const everyDeclaredField = Object.values(SCRAPERS).flatMap((scraper) => scraper.loginFields);
    for (const excluded of NON_USER_ENTERED_LOGIN_FIELDS) {
      expect(everyDeclaredField).toContain(excluded);
    }
  });
});
