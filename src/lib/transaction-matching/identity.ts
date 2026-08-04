import { extractMerchant } from "./merchant";
import { canonicalizeMerchant } from "./canonicalize";
import { jaroWinkler } from "./similarity";
import { tokenize } from "./tokenize";

/**
 * Merchant identity — see CONTEXT.md `merchant identity` for the concept and the
 * invariant that consumers must share one definition of it (#237).
 *
 * `extractMerchant` is deliberately left alone: its output is a PERSISTED key
 * (merchant-memory entries, `recurring_expenses.merchant`), so redefining it
 * would orphan stored rows. Identity layers on top instead.
 */

/**
 * Share of the shorter key's tokens that must have a counterpart in the longer
 * key. Token-aware rather than a whole-string similarity score because
 * whole-string Jaro-Winkler rewards a shared prefix: sibling names ("acme-gym"
 * vs "acme-stream") score as one merchant, while a branch rename — which keeps
 * most of its tokens and swaps one — barely outscores them.
 */
const TOKEN_OVERLAP_RATIO = 0.8;

/**
 * Containment needs at least this many tokens on the shorter side. A lone token
 * matching *inside* a longer descriptor is not identity but coincidence: on real
 * data a one-word key merged two unrelated merchants that merely shared a
 * similar word, and generic descriptors ("transfer") swallowed everything they
 * prefixed. Two single-token keys are still compared to each other directly.
 */
const MIN_CONTAINMENT_TOKENS = 2;

/** Above this raw Jaro-Winkler two tokens are the same word (a suffixed brand
 * token, a typo, a truncation) rather than two different words. */
const TOKEN_SIMILARITY = 0.9;

/**
 * A token this long, carrying at least this many digits alongside letters, is a
 * machine reference minted per charge (payment-processor token, authorization
 * code) rather than part of the merchant's name. The floors keep real brand
 * tokens ("level3", "h2o", "פז 3") out of the strip: a brand rarely mixes two or
 * more digits into a 5+ character word.
 */
const MACHINE_TOKEN_MIN_LENGTH = 5;
const MACHINE_TOKEN_MIN_DIGITS = 2;

/** Host prefix left on a web merchant's descriptor; carries no identity. */
const HOST_PREFIX = /^www\./;

/** A per-charge date stamped into the descriptor, e.g. an ATM withdrawal's day. */
const DATE_FRAGMENT = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g;

/**
 * Reference numbers glued to a word by punctuation. `extractMerchant` only
 * strips whitespace-bounded digit runs, so "<word>:<number>" survives it and
 * gives every charge its own merchant.
 */
const GLUED_DIGIT_RUN = /\d{4,}/g;

/** Separators left dangling once a stripped fragment is removed. */
const DANGLING_SEPARATORS = /^[:\-–,]+|[:\-–,]+$/g;

function isMachineToken(token: string): boolean {
  if (token.length < MACHINE_TOKEN_MIN_LENGTH) return false;
  if (!/^[\p{L}\p{N}]+$/u.test(token)) return false;
  if (!/\p{L}/u.test(token)) return false;
  return (token.match(/\p{N}/gu) ?? []).length >= MACHINE_TOKEN_MIN_DIGITS;
}

/**
 * The merchant's identity key: `extractMerchant` with per-charge volatile
 * fragments removed, so every charge of one merchant keys the same however the
 * bank decorated that charge's descriptor.
 *
 * Two invariants make this safe to apply to already-stored merchants — both
 * pinned by tests:
 *  - idempotent: `merchantKey(merchantKey(x)) === merchantKey(x)`
 *  - stable under extraction: `merchantKey(extractMerchant(x)) === merchantKey(x)`
 *
 * Together they let the evidence matcher key a PERSISTED `merchant` (already an
 * `extractMerchant` output) and a raw description into the same bucket, so
 * existing rows heal without a migration.
 *
 * Splits on whitespace rather than reusing `tokenize`: internal punctuation is
 * load-bearing here (Hebrew abbreviations like `מש'` and `פ"ת` must survive),
 * while `tokenize` deliberately discards it.
 */
export function merchantKey(text: string): string {
  const extracted = extractMerchant(text);
  if (!extracted) return "";

  return extracted
    .replace(HOST_PREFIX, "")
    .replace(DATE_FRAGMENT, " ")
    .replace(GLUED_DIGIT_RUN, "")
    .split(/\s+/)
    .filter((token) => token && !isMachineToken(token))
    .map((token) => token.replace(DANGLING_SEPARATORS, ""))
    .filter(Boolean)
    .join(" ")
    .trim();
}

function tokensMatch(a: string, b: string): boolean {
  return a === b || jaroWinkler(a, b) >= TOKEN_SIMILARITY;
}

/** Each counterpart is consumed, so one token cannot absorb several. */
function tokenOverlap(shorter: string[], longer: string[]): number {
  const available = [...longer];
  let matched = 0;

  for (const token of shorter) {
    const i = available.findIndex((candidate) => tokensMatch(token, candidate));
    if (i !== -1) {
      available.splice(i, 1);
      matched++;
    }
  }

  return matched / shorter.length;
}

/**
 * Whether two descriptors denote the same merchant. Three ways to qualify:
 * identical identity keys; the same canonical brand (cross-script aliases, #85);
 * or near-total token overlap, which catches drift the key cannot normalize,
 * such as a branch rename that swaps one word.
 *
 * A descriptor with no merchant at all identifies nothing, so it matches
 * nothing — including another empty descriptor.
 */
export function sameMerchant(a: string, b: string): boolean {
  const keyA = merchantKey(a);
  const keyB = merchantKey(b);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;

  const canonA = canonicalizeMerchant(keyA);
  const canonB = canonicalizeMerchant(keyB);
  if (canonA === canonB) return true;

  const tokensA = tokenize(keyA);
  const tokensB = tokenize(keyB);
  if (!tokensA.length || !tokensB.length) return false;

  if (tokensA.length === 1 && tokensB.length === 1) {
    return tokensMatch(tokensA[0], tokensB[0]);
  }

  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  if (shorter.length < MIN_CONTAINMENT_TOKENS) return false;
  return tokenOverlap(shorter, longer) >= TOKEN_OVERLAP_RATIO;
}
