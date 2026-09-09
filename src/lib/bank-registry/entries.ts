// The library's `lib/definitions` module is imported directly rather than through
// the package root: the root barrel pulls in the scraper factory and puppeteer,
// which would make the bank registry unimportable from a client component and
// from the DB-free consumers below. `lib/definitions` has no dependencies of its own.
import { CompanyTypes } from "israeli-bank-scrapers-core/lib/definitions";
import type { CredentialFieldDescriptor } from "./fields";

/**
 * Whether an institution holds an account or issues a card. Code that needs
 * different behaviour for cards branches on this, never on an institution id
 * (ADR-0013 law 2) — an institution missing from a card-shaped set is invisible
 * to settlement reconciliation and to the next-debit estimate.
 */
export type BankKind = "bank" | "card";

/** Whether we have tested the institution ourselves. Presentational only, never a second code path. */
export type BankTier = "verified" | "experimental";

export interface BankRegistryEntry {
  readonly id: string;
  readonly nameHe: string;
  readonly nameEn: string;
  readonly kind: BankKind;
  readonly issuesOtp: boolean;
  readonly company: CompanyTypes;
  /** Ordered as the credential form renders them. */
  readonly credentialFields: readonly CredentialFieldDescriptor[];
  readonly tier: BankTier;
}

/**
 * The single source of institution facts (ADR-0013). Adding an institution is an
 * entry here plus the scraper's company-mapping line — nothing else.
 *
 * `oneZero` is deliberately absent from both tiers rather than registered as
 * experimental: its login needs a long-term OTP token, which ADR-0003 puts out of
 * scope, so listing it would promise what the scraper structurally cannot deliver.
 */
export const bankRegistry = Object.freeze([
  {
    id: "discount",
    nameHe: "דיסקונט",
    nameEn: "Bank Discount",
    kind: "bank",
    issuesOtp: true,
    company: CompanyTypes.discount,
    credentialFields: [
      { key: "id", kind: "national-id", label: "תעודת זהות" },
      { key: "password", kind: "password", label: "סיסמה" },
      { key: "num", kind: "account-number", label: "מספר חשבון" },
    ],
    tier: "verified",
  },
  {
    id: "max",
    nameHe: "מקס",
    nameEn: "Max",
    kind: "card",
    issuesOtp: false,
    company: CompanyTypes.max,
    credentialFields: [
      { key: "username", kind: "text", label: "שם משתמש" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "verified",
  },
  {
    id: "visaCal",
    nameHe: "ויזה כאל",
    nameEn: "Cal",
    kind: "card",
    issuesOtp: false,
    company: CompanyTypes.visaCal,
    credentialFields: [
      { key: "username", kind: "text", label: "שם משתמש" },
      { key: "password", kind: "password", label: "סיסמה" },
    ],
    tier: "verified",
  },
] as const satisfies readonly BankRegistryEntry[]);

/**
 * Derived from the array above, never written beside it — an entry added to
 * `bankRegistry` widens this union in the same edit, so the runtime list and the
 * compile-time union cannot diverge.
 */
export type BankType = (typeof bankRegistry)[number]["id"];

const byId: ReadonlyMap<string, BankRegistryEntry> = new Map(
  bankRegistry.map((entry) => [entry.id, entry]),
);

export function getBankEntry(id: BankType): BankRegistryEntry {
  return byId.get(id)!;
}

/**
 * Lookup for an id that may not be registered — a stored row naming an
 * institution since removed from the registry stays readable (ADR-0013 §5).
 */
export function findBankEntry(id: string): BankRegistryEntry | undefined {
  return byId.get(id);
}

export function isBankType(id: string): id is BankType {
  return byId.has(id);
}

/**
 * Every institution a user may select. Every registered institution is selectable:
 * the tier is presentational, never a gate, so this must not filter by tier.
 */
export function enabledBankEntries(): readonly BankRegistryEntry[] {
  return bankRegistry;
}

export function enabledBankTypes(): readonly BankType[] {
  return bankRegistry.map((entry) => entry.id);
}

/**
 * The property to branch on instead of an institution id (ADR-0013 law 2).
 * Undefined for an unregistered id, so `bankKindOf(x) === "card"` excludes it —
 * matching how the sets this replaces treated an unknown id.
 */
export function bankKindOf(id: string): BankKind | undefined {
  return byId.get(id)?.kind;
}

export function bankIssuesOtp(id: string): boolean {
  return byId.get(id)?.issuesOtp ?? false;
}

/**
 * Empty for an unregistered id: a caller stripping a stored credential row by
 * field kind then exposes nothing, which is the safe direction to fail.
 */
export function credentialFieldsFor(id: string): readonly CredentialFieldDescriptor[] {
  return byId.get(id)?.credentialFields ?? [];
}
