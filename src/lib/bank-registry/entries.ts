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
 * Consumers read this through the accessors below, not by indexing it.
 *
 * The `as const` is load-bearing, not stylistic: without it `id` widens to
 * `string` and `BankType` silently stops constraining anything, while
 * `satisfies` keeps compiling. `__tests__/derived-union.test.ts` fails if it
 * is ever dropped.
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

/** Never replace this with a hand-written union: such copies are what ADR-0013 exists to retire. */
export type BankType = (typeof bankRegistry)[number]["id"];

const byId: ReadonlyMap<string, BankRegistryEntry> = new Map(
  bankRegistry.map((entry) => [entry.id, entry]),
);

/**
 * The only entry lookup, and it takes `string` rather than `BankType` on purpose.
 * Institution ids arrive as database text with no CHECK constraint behind them
 * (ADR-0013 §4), so a row naming a de-registered institution must stay readable
 * and render as unknown. A lookup typed `(id: BankType) => BankRegistryEntry`
 * would let a caller cast such text and then read a property off `undefined`,
 * turning the very case §4 accepts into a crash — so the optional return is what
 * forces every consumer to handle it at compile time.
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
