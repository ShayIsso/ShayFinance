/**
 * Shared tokenization for the module's curated-table matchers
 * (`canonicalizeMerchant`, the transfer-descriptor bank). One pipeline keeps
 * whole-token discipline uniform: NFC normalization, lowercasing, and a split
 * on any run of non-letter/non-digit characters.
 */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
