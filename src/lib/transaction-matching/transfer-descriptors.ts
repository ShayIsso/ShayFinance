/**
 * Curated transfer/settlement descriptor bank.
 *
 * Classifies a raw transaction `description` as transfer-shaped and, if so,
 * which shape it takes. This is pure description vocabulary — it reports what a
 * description LOOKS like, never what it MEANS. Reconciliation (see
 * `src/lib/reconciliation`) remains the only writer of transfer semantics; it
 * pairs the description shape with amount/date/side evidence before grouping.
 *
 * Three kinds:
 * - `inter_account`  — a transfer between the owner's own accounts (העברה, transfer).
 * - `bit_mirror`     — a Bit / direct-debit charge mirrored across accounts
 *                      (ביט, bit, and the two-word phrase חיוב ישיר).
 * - `card_settlement`— a bank lump that settles a credit-card cycle
 *                      (ויזה, מאסטרקארד, חיוב, plus a standalone 4-digit run
 *                      such as a masked card number).
 *
 * Matching is whole-token, never substring — same rejection rationale as
 * `canonicalizeMerchant`: a short token like ביט must not match inside ביטוח,
 * and Latin `bit` must not match inside "debit"/"habit". Latin is
 * case-insensitive; multi-word phrases match only as consecutive tokens.
 *
 * Precedence, when one description matches more than one kind:
 * `inter_account` > `bit_mirror` > `card_settlement`. This only disambiguates
 * the returned `kind`/`token` for the unscoped classifier — e.g. "חיוב ישיר"
 * resolves to the more specific `bit_mirror` phrase rather than the bare `חיוב`
 * card_settlement token. Each reconciliation phase scopes to its own kind set,
 * so precedence never changes which phase treats a description as a marker.
 */

import { tokenize } from "./tokenize";

export type TransferDescriptorKind = "inter_account" | "bit_mirror" | "card_settlement";

export interface TransferDescriptorMatch {
  kind: TransferDescriptorKind;
  token: string;
}

const KIND_PRECEDENCE: readonly TransferDescriptorKind[] = [
  "inter_account",
  "bit_mirror",
  "card_settlement",
];

/**
 * Lowercased token phrases per kind. Each entry is a run of one or more
 * consecutive tokens; a single-token entry is a length-1 array. Latin entries
 * are lowercased so matching is case-insensitive after normalization.
 */
const PHRASE_TABLE: Record<TransferDescriptorKind, ReadonlyArray<readonly string[]>> = {
  inter_account: [["העברה"], ["transfer"]],
  bit_mirror: [["ביט"], ["bit"], ["חיוב", "ישיר"]],
  card_settlement: [["ויזה"], ["מאסטרקארד"], ["חיוב"]],
};

// Standalone 4-digit run (masked card number). Kept as the exact regex the P1
// detector used so its boundary semantics are preserved byte-for-byte: 4-digit
// runs embedded in a longer digit or alphanumeric sequence do not match.
const CARD_LAST4_RE = /\b\d{4}\b/;

function containsPhrase(tokens: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 1) return tokens.includes(phrase[0]);
  for (let i = 0; i + phrase.length <= tokens.length; i++) {
    let matched = true;
    for (let k = 0; k < phrase.length; k++) {
      if (tokens[i + k] !== phrase[k]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Classifies a description as transfer-shaped, or returns `null` when nothing
 * matches. Pass `kinds` to restrict the considered shapes (e.g. a single phase's
 * scope); the match still respects the documented precedence among them.
 */
export function classifyTransferDescriptor(
  description: string,
  kinds: Iterable<TransferDescriptorKind> = KIND_PRECEDENCE,
): TransferDescriptorMatch | null {
  const considered = new Set(kinds);
  const tokens = tokenize(description);

  for (const kind of KIND_PRECEDENCE) {
    if (!considered.has(kind)) continue;

    for (const phrase of PHRASE_TABLE[kind]) {
      if (containsPhrase(tokens, phrase)) {
        return { kind, token: phrase.join(" ") };
      }
    }

    if (kind === "card_settlement") {
      const digits = CARD_LAST4_RE.exec(description);
      if (digits) return { kind, token: digits[0] };
    }
  }

  return null;
}

/** Whether the description matches any of the considered transfer shapes. */
export function matchesTransferDescriptor(
  description: string,
  kinds: Iterable<TransferDescriptorKind> = KIND_PRECEDENCE,
): boolean {
  return classifyTransferDescriptor(description, kinds) !== null;
}
