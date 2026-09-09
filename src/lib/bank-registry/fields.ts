import { z } from "zod";

/**
 * Closed union — a new institution needing a sixth kind is a code change by
 * design. Each kind maps to exactly one input rendering and one Zod rule.
 */
export type CredentialFieldKind =
  | "text"
  | "password"
  | "national-id"
  | "account-number"
  | "card-6-digits";

/**
 * One credential field of one institution. Carries a single Hebrew label, not a
 * translation object: the interface is Hebrew RTL, and per-field i18n objects are
 * precluded inside an entry (ADR-0013 §2) along with regexes, conditional fields
 * and any validation DSL. Everything about how the field renders and validates
 * comes from its `kind`.
 */
export interface CredentialFieldDescriptor {
  /** Must match the scraper library's login-field name — pinned by the cross-check test. */
  readonly key: string;
  readonly kind: CredentialFieldKind;
  readonly label: string;
}

/** Everything a generic credential form needs to render a field without branching on its kind. */
export interface CredentialFieldRendering {
  readonly inputType: "text" | "password";
  readonly inputMode: "text" | "numeric";
}

interface CredentialFieldKindSpec {
  /**
   * Whether the stored value must never be read back out. The password kind is the
   * only secret one: national ids and account numbers are already covered
   * structurally by the redaction boundary's 5+-digit rule, and two overlapping
   * mechanisms guarding one invariant is how invariants rot (ADR-0013 §2).
   */
  readonly secret: boolean;
  readonly rendering: CredentialFieldRendering;
  readonly rule: (label: string) => z.ZodString;
}

const required = (label: string) => z.string().min(1, `${label} חובה`);

/**
 * Typed as a total record so the union above stays the single declaration of the
 * kinds and this table cannot fall behind it.
 *
 * Only `card-6-digits` constrains its value's shape. The other four validate
 * presence alone, matching what the app accepts today — tightening a national id
 * or account number would reject credentials that currently sync, which is a
 * deliberate product decision rather than a side effect of centralizing them.
 */
const CREDENTIAL_FIELD_KINDS: Record<CredentialFieldKind, CredentialFieldKindSpec> = {
  text: {
    secret: false,
    rendering: { inputType: "text", inputMode: "text" },
    rule: required,
  },
  password: {
    secret: true,
    rendering: { inputType: "password", inputMode: "text" },
    rule: required,
  },
  "national-id": {
    secret: false,
    rendering: { inputType: "text", inputMode: "numeric" },
    rule: required,
  },
  "account-number": {
    secret: false,
    rendering: { inputType: "text", inputMode: "numeric" },
    rule: required,
  },
  "card-6-digits": {
    secret: false,
    rendering: { inputType: "text", inputMode: "numeric" },
    rule: (label) => z.string().regex(/^\d{6}$/, `${label} חייב להכיל שש ספרות`),
  },
};

export const credentialFieldKinds = Object.freeze(
  Object.keys(CREDENTIAL_FIELD_KINDS) as CredentialFieldKind[],
);

export function isSecretFieldKind(kind: CredentialFieldKind): boolean {
  return CREDENTIAL_FIELD_KINDS[kind].secret;
}

export function credentialFieldRendering(kind: CredentialFieldKind): CredentialFieldRendering {
  return CREDENTIAL_FIELD_KINDS[kind].rendering;
}

export function credentialFieldRule(field: CredentialFieldDescriptor): z.ZodString {
  return CREDENTIAL_FIELD_KINDS[field.kind].rule(field.label);
}
