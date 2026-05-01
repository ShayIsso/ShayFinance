const PREFIXES: RegExp[] = [
  /^תשלום\s+ב-?/,
  /^רכישה\s+ב/,
  /^קניה\s+ב/,
  /^חיוב\s+ב-?/,
  /^חיוב\s+/,
  /^ישיר\s+/,
];

export function extractMerchant(description: string): string {
  let s = description.normalize("NFC").trim();
  if (!s) return "";

  for (const prefix of PREFIXES) {
    const stripped = s.replace(prefix, "");
    if (stripped !== s) {
      s = stripped.trim();
      break;
    }
  }

  // Strip standalone digit tokens of 4+ chars (card numbers, account IDs)
  s = s.replace(/(^|\s)\d{4,}(?=\s|$)/g, "$1");

  // Strip domain suffixes: .com, .co.il, .net, etc.
  s = s.replace(/(\.[A-Za-z]{2,6})+(?=\s|$)/g, "");

  // Lowercase Latin only — Hebrew and other Unicode preserved
  s = s.replace(/[A-Za-z]+/g, (m) => m.toLowerCase());

  return s.replace(/\s+/g, " ").trim();
}
