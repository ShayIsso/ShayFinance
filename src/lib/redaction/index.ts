/**
 * redaction — pure module (data in, data out; no I/O, no store, no DB awareness).
 *
 * The single implementation of "what must never leak" (ADR-0008 §3).
 * Shared by the log sanitizer (src/lib/logging/redact.ts) and, in future
 * slices, the AI-egress path — one rule set, so the two can never drift.
 *
 * Known limits (ADR-0008 scope) — recorded for the accounting-intelligence
 * epic; widening any of these is an ADR conversation, not a quiet edit:
 * - Separator-formatted numbers (e.g. 1234-5678-9012-3456) are not one
 *   5+ digit run; each group is under 5 digits and survives rule 1.
 * - Only ASCII digits count as digits; non-ASCII digit forms and
 *   zero-width-joiner tricks bypass rule 1.
 * - IDN / punycode email addresses (non-ASCII local part or domain) are
 *   not matched by the email pattern.
 * - Credentials in URL fragments (#token=...) are not treated as
 *   credential query parameters.
 * - Paths containing spaces are only consumed up to the first space.
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
  /** Every bracketed token this rule class may emit. */
  readonly placeholders: readonly string[];
  /** Applies the rule to a raw string, returning the redacted string. */
  readonly apply: (input: string) => string;
}

const DIGITS_PLACEHOLDER = "[REDACTED_DIGITS]";
const SECRET_PLACEHOLDER = "[REDACTED_SECRET]";
const OTP_PLACEHOLDER = "[REDACTED_OTP]";
const BEARER_PLACEHOLDER = "[REDACTED]";
const EMAIL_PLACEHOLDER = "[REDACTED_EMAIL]";
const URL_PLACEHOLDER = "[REDACTED_URL]";
const PATH_PLACEHOLDER = "[REDACTED_PATH]";

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

const digitRunRule: RedactionRule = Object.freeze({
  name: "digit-run",
  placeholders: Object.freeze([DIGITS_PLACEHOLDER]),
  apply: (input: string) => input.replace(DIGIT_RUN, DIGITS_PLACEHOLDER),
});

/**
 * Rule 2 — keyword-secret patterns (ADR-0008 §3.2): password / token /
 * key / OTP (and Hebrew equivalents) plus the adjacent value.
 *
 * Three sub-patterns, applied in order. The Bearer and numeric-OTP
 * sub-patterns predate this module (they were the log sanitizer's whole
 * string-level pass) and keep their exact legacy output tokens —
 * `Bearer [REDACTED]` and `[REDACTED_OTP]` — so existing log
 * expectations stay stable. The generic keyword sub-pattern emits this
 * rule class's canonical token, `[REDACTED_SECRET]`, and covers what
 * the numeric sub-pattern cannot: alphanumeric OTPs, short codes, and
 * natural Hebrew phrasing.
 *
 * Rule 1 runs first, so a 5+ digit OTP reaches this rule already as
 * `[REDACTED_DIGITS]`; the numeric OTP sub-pattern accepts that
 * placeholder as the adjacent value and upgrades it to `[REDACTED_OTP]`.
 *
 * Hebrew keywords carry no word boundaries — `\b` does not work across
 * Hebrew letters — so longer words containing a keyword also match.
 * That over-redaction is deliberate (ADR-0008's safe direction).
 * The generic sub-pattern bridges natural phrasing: an optional Hebrew
 * possessive (שלי/שלך/שלנו) and an optional copula (is/היא/הוא/זה)
 * between keyword and value. Its value part refuses to bind another
 * keyword (so "OTP code: x" redacts x, not "code"), refuses tokens
 * already starting with `[REDACTED` (idempotence), and must not start
 * with a separator character — otherwise backtracking the optional
 * `[:=]` would let a bare ":" be consumed as the "value".
 */
const BEARER_PATTERN = /Bearer (?:\[REDACTED_DIGITS\]|[A-Za-z0-9._\-])+/g;
const OTP_PATTERN = /(otp|code|קוד|אימות)([^0-9]{0,15})(\[REDACTED_DIGITS\]|[0-9]{4,8}(?!\d))/gi;
const KEYWORD_SECRET_PATTERN =
  /((?:\b(?:password|passwd|pwd|secret|token|api[-_]?key|apikey|key|otp|code)\b|קוד\s+אימות|סיסמה|מפתח|טוקן|קוד|אימות)(?:\s+(?:שלי|שלך|שלנו))?(?:\s+(?:is|היא|הוא|זה))?\s*[:=]?\s*)(?!(?:password|passwd|pwd|secret|token|api[-_]?key|apikey|key|otp|code|is|סיסמה|מפתח|טוקן|קוד|אימות|היא|הוא|זה|שלי|שלך|שלנו)(?![\p{L}\p{N}_])|\[REDACTED)([^\s:=]\S*)/giu;

const keywordSecretRule: RedactionRule = Object.freeze({
  name: "keyword-secret",
  placeholders: Object.freeze([SECRET_PLACEHOLDER, OTP_PLACEHOLDER, BEARER_PLACEHOLDER]),
  apply: (input: string) => {
    let result = input.replace(BEARER_PATTERN, `Bearer ${BEARER_PLACEHOLDER}`);
    result = result.replace(
      OTP_PATTERN,
      (_m, keyword, gap) => `${keyword}${gap}${OTP_PLACEHOLDER}`,
    );
    result = result.replace(
      KEYWORD_SECRET_PATTERN,
      (_m, prefix) => `${prefix}${SECRET_PLACEHOLDER}`,
    );
    return result;
  },
});

/**
 * Rule 3 — email addresses (ADR-0008 §3.3).
 *
 * The character classes include `[` and `]` so an address whose local
 * part or domain already contains a `[REDACTED_DIGITS]` placeholder
 * (rule 1 runs first) is still consumed whole.
 *
 * The negative lookbehind skips "emails" that are really the tail of a
 * URL authority (`//user:pass@host`, with or without a scheme) — those
 * must survive to rule 4, which redacts the whole credentialed URL.
 */
const EMAIL_PATTERN = /(?<!\/\/[^\s\/@]*)[A-Za-z0-9._%+\-\[\]]+@[A-Za-z0-9.\-\[\]]+\.[A-Za-z]{2,}/g;

const emailRule: RedactionRule = Object.freeze({
  name: "email",
  placeholders: Object.freeze([EMAIL_PLACEHOLDER]),
  apply: (input: string) => input.replace(EMAIL_PATTERN, EMAIL_PLACEHOLDER),
});

/**
 * Rule 4 — credentialed URLs (ADR-0008 §3.4): any URL carrying userinfo
 * (`user:pass@host`) or a credential-looking query parameter. The
 * scheme is optional so protocol-relative URLs (`//user:pass@host`)
 * are caught too. The whole URL is replaced — hosts and paths
 * travelling with a credential are not worth preserving. URLs without
 * credentials pass through untouched.
 */
const URL_PATTERN = /(?:\b[a-z][a-z0-9+.\-]*:)?\/\/[^\s"'<>]+/gi;
const URL_USERINFO = /^(?:[a-z][a-z0-9+.\-]*:)?\/\/[^\/\s?#]*@/i;
const URL_CREDENTIAL_QUERY =
  /[?&](password|passwd|pwd|token|access[-_]?token|auth|api[-_]?key|apikey|key|secret|otp|code|sig|signature)=/i;

const credentialedUrlRule: RedactionRule = Object.freeze({
  name: "credentialed-url",
  placeholders: Object.freeze([URL_PLACEHOLDER]),
  apply: (input: string) =>
    input.replace(URL_PATTERN, (url) =>
      URL_USERINFO.test(url) || URL_CREDENTIAL_QUERY.test(url) ? URL_PLACEHOLDER : url,
    ),
});

/**
 * Rule 5 — home-directory paths (ADR-0008 §3.5): filesystem paths under
 * a user home — POSIX (`/Users/...`, `/home/...`, `/root/...`, `~/...`)
 * and Windows (`C:\Users\...`). The whole path is replaced — usernames
 * and directory layouts both reveal. Non-home absolute paths
 * (`/var/log/...`) pass through. Character class keeps `[`/`]` so
 * digit-run placeholders inside a path are consumed, and stops at
 * quotes/closing parens so surrounding prose survives. Case-insensitive:
 * macOS and Windows filesystems are.
 */
const HOME_PATH_PATTERN = /(?:~|\/(?:Users|home|root))\/[^\s"'`)]*|[A-Za-z]:\\Users\\[^\s"'`)]*/gi;

const homePathRule: RedactionRule = Object.freeze({
  name: "home-path",
  placeholders: Object.freeze([PATH_PLACEHOLDER]),
  apply: (input: string) => input.replace(HOME_PATH_PATTERN, PATH_PLACEHOLDER),
});

/**
 * The ADR-0008 §3 rule table, in application order. Consumed by the log
 * sanitizer's string-level pass and by `redactText`. Frozen — this
 * table is security-critical and must not be mutable at runtime.
 */
export const redactionRules: readonly RedactionRule[] = Object.freeze([
  digitRunRule,
  keywordSecretRule,
  emailRule,
  credentialedUrlRule,
  homePathRule,
]);

/** Applies every redaction rule in ADR order and mints the brand. */
export function redactText(input: string): RedactedString {
  let result = input;
  for (const rule of redactionRules) {
    result = rule.apply(result);
  }
  return result as RedactedString;
}
