/**
 * redaction — pure module (data in, data out; no I/O, no store, no DB awareness).
 *
 * The single implementation of "what must never leak" (ADR-0008 §3).
 * Shared by the log sanitizer (src/lib/logging/redact.ts) and, in future
 * slices, the AI-egress path — one rule set, so the two can never drift.
 */

declare const redactedBrand: unique symbol;

/**
 * A string that has passed through `redactText`. Mintable only by this
 * module — plain strings do not type-check where a RedactedString is
 * required (ADR-0008 §4).
 */
export type RedactedString = string & { readonly [redactedBrand]: typeof redactedBrand };

export interface RedactionRule {
  /** Stable rule identifier (ADR-0008 §3 rule class). */
  readonly name: "digit-run" | "keyword-secret" | "email" | "credentialed-url" | "home-path";
  /** The bracketed placeholder this rule class emits. */
  readonly placeholder: string;
  /** Applies the rule to a raw string, returning the redacted string. */
  readonly apply: (input: string) => string;
}

/**
 * Rule 1 — digit runs of 5+ (ADR-0008 §3.1).
 *
 * Deliberately over-broad: catches account numbers, card fragments,
 * national IDs, and phone numbers without classifying them.
 *
 * NOT the same thing as the 4+ digit token stripping in
 * src/lib/transaction-matching/merchant.ts — that rule serves merchant
 * MATCHING (normalizing descriptors so duplicates collapse), this one
 * serves PRIVACY (nothing identifying leaves a log line or the host).
 * They evolve independently; do not "deduplicate" one into the other.
 */
const DIGIT_RUN = /\d{5,}/g;

const digitRunRule: RedactionRule = {
  name: "digit-run",
  placeholder: "[REDACTED_DIGITS]",
  apply: (input) => input.replace(DIGIT_RUN, "[REDACTED_DIGITS]"),
};

/**
 * Rule 2 — keyword-secret patterns (ADR-0008 §3.2): password / token /
 * key / OTP (and Hebrew equivalents) plus the adjacent value.
 *
 * Three sub-patterns, applied in order. The Bearer and OTP sub-patterns
 * predate this module (they were the log sanitizer's whole string-level
 * pass) and keep their exact legacy output tokens — `Bearer [REDACTED]`
 * and `[REDACTED_OTP]` — so existing log expectations stay stable. The
 * generic keyword sub-pattern emits this rule class's canonical token,
 * `[REDACTED_SECRET]`.
 *
 * Rule 1 runs first, so a 5+ digit OTP reaches this rule already as
 * `[REDACTED_DIGITS]`; the OTP sub-pattern accepts that placeholder as
 * the adjacent value and upgrades it to `[REDACTED_OTP]`.
 */
const BEARER_PATTERN = /Bearer (?:\[REDACTED_DIGITS\]|[A-Za-z0-9._\-])+/g;
const OTP_PATTERN = /(otp|code|קוד|אימות)([^0-9]{0,15})(\[REDACTED_DIGITS\]|[0-9]{4,8}(?!\d))/gi;
const KEYWORD_SECRET_PATTERN =
  /((?:\b(?:password|passwd|pwd|secret|token|api[-_]?key|apikey|key)\b|סיסמה|מפתח|טוקן)(?:\s+is)?\s*[:=]?\s*)(\S+)/gi;

const keywordSecretRule: RedactionRule = {
  name: "keyword-secret",
  placeholder: "[REDACTED_SECRET]",
  apply: (input) => {
    let result = input.replace(BEARER_PATTERN, "Bearer [REDACTED]");
    result = result.replace(OTP_PATTERN, (_m, keyword, gap) => `${keyword}${gap}[REDACTED_OTP]`);
    result = result.replace(KEYWORD_SECRET_PATTERN, (_m, prefix) => `${prefix}[REDACTED_SECRET]`);
    return result;
  },
};

/**
 * Rule 3 — email addresses (ADR-0008 §3.3).
 *
 * The character classes include `[` and `]` so an address whose local
 * part or domain already contains a `[REDACTED_DIGITS]` placeholder
 * (rule 1 runs first) is still consumed whole.
 *
 * The negative lookbehind skips "emails" that are really the tail of a
 * URL authority (`scheme://user:pass@host`) — those must survive to
 * rule 4, which redacts the whole credentialed URL.
 */
const EMAIL_PATTERN = /(?<!\/\/[^\s\/@]*)[A-Za-z0-9._%+\-\[\]]+@[A-Za-z0-9.\-\[\]]+\.[A-Za-z]{2,}/g;

const emailRule: RedactionRule = {
  name: "email",
  placeholder: "[REDACTED_EMAIL]",
  apply: (input) => input.replace(EMAIL_PATTERN, "[REDACTED_EMAIL]"),
};

/**
 * Rule 4 — credentialed URLs (ADR-0008 §3.4): any URL carrying userinfo
 * (`scheme://user:pass@host`) or a credential-looking query parameter.
 * The whole URL is replaced — hosts and paths travelling with a
 * credential are not worth preserving. URLs without credentials pass
 * through untouched.
 */
const URL_PATTERN = /\b[a-z][a-z0-9+.\-]*:\/\/[^\s"'<>]+/gi;
const URL_USERINFO = /^[a-z][a-z0-9+.\-]*:\/\/[^\/\s?#]*@/i;
const URL_CREDENTIAL_QUERY =
  /[?&](password|passwd|pwd|token|access[-_]?token|auth|api[-_]?key|apikey|key|secret|otp|code|sig|signature)=/i;

const credentialedUrlRule: RedactionRule = {
  name: "credentialed-url",
  placeholder: "[REDACTED_URL]",
  apply: (input) =>
    input.replace(URL_PATTERN, (url) =>
      URL_USERINFO.test(url) || URL_CREDENTIAL_QUERY.test(url) ? "[REDACTED_URL]" : url,
    ),
};

/**
 * Rule 5 — home-directory paths (ADR-0008 §3.5): filesystem paths under
 * a user home (`/Users/...`, `/home/...`, `/root/...`, `~/...`). The
 * whole path is replaced — usernames and directory layouts both reveal.
 * Non-home absolute paths (`/var/log/...`) pass through. Character
 * class keeps `[`/`]` so digit-run placeholders inside a path are
 * consumed, and stops at quotes/closing parens so surrounding prose
 * survives.
 */
const HOME_PATH_PATTERN = /(?:~|\/(?:Users|home|root))\/[^\s"'`)]*/g;

const homePathRule: RedactionRule = {
  name: "home-path",
  placeholder: "[REDACTED_PATH]",
  apply: (input) => input.replace(HOME_PATH_PATTERN, "[REDACTED_PATH]"),
};

/**
 * The ADR-0008 §3 rule table, in application order. Consumed by the log
 * sanitizer's string-level pass and by `redactText`.
 */
export const redactionRules: readonly RedactionRule[] = [
  digitRunRule,
  keywordSecretRule,
  emailRule,
  credentialedUrlRule,
  homePathRule,
];

/** Applies every redaction rule in ADR order and mints the brand. */
export function redactText(input: string): RedactedString {
  let result = input;
  for (const rule of redactionRules) {
    result = rule.apply(result);
  }
  return result as RedactedString;
}
