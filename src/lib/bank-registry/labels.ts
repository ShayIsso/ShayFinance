import { findBankEntry } from "./entries";

export type BankLocale = "he" | "en";

/**
 * Shown for an id that is no longer registered. Institution ids are stored as
 * text with no database constraint (ADR-0013 §5), so such a row stays readable
 * and must render as an honest unknown rather than a blank or a crash.
 */
const UNKNOWN_LABEL: Record<BankLocale, string> = {
  he: "מוסד לא ידוע",
  en: "Unknown institution",
};

/** Total: every id resolves to a label, registered or not. */
export function bankLabel(id: string, locale: BankLocale = "he"): string {
  const entry = findBankEntry(id);
  if (!entry) return UNKNOWN_LABEL[locale];
  return locale === "he" ? entry.nameHe : entry.nameEn;
}
