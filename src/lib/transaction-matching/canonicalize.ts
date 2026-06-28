/**
 * Cross-script merchant aliasing.
 *
 * `canonicalizeMerchant` maps known Hebrew<->Latin brand aliases (e.g.
 * "נטפליקס ישראל", "NETFLIX.COM", "Netflix IL") to a single canonical brand key.
 * Input that matches no known alias is returned UNCHANGED.
 *
 * This is additive: it operates on an ALREADY-extracted merchant string
 * (post-`extractMerchant`) and never mutates the extracted display name. It is
 * used only as an equality short-circuit inside `scoreSimilarity`.
 */

/**
 * Curated alias table. Each entry maps a canonical brand key to the set of
 * lowercased tokens (Hebrew and Latin) that identify that brand. Matching is by
 * substring containment so trailing words like "ישראל" do not break the match.
 *
 * Keep entries precise enough that distinct brands never collide.
 */
const ALIAS_TABLE: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["netflix", ["netflix", "נטפליקס"]],
  ["spotify", ["spotify", "ספוטיפיי"]],
  ["google", ["google", "גוגל"]],
  ["apple", ["apple", "אפל"]],
  ["youtube", ["youtube", "יוטיוב"]],
];

/**
 * Maps an already-extracted merchant string to a canonical brand key, or returns
 * the input unchanged when no known alias matches.
 */
export function canonicalizeMerchant(extracted: string): string {
  const normalized = extracted.normalize("NFC").trim();
  if (!normalized) return normalized;

  const haystack = normalized.toLowerCase();

  for (const [canonicalKey, aliases] of ALIAS_TABLE) {
    for (const alias of aliases) {
      if (haystack.includes(alias)) {
        return canonicalKey;
      }
    }
  }

  return extracted;
}
