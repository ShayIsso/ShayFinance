import { sumMatches } from "@/lib/transaction-matching";
import type { ReconciliationTransaction } from "./types";

const EXACT_TOLERANCE = 0.02;
const LOOSE_TOLERANCE = 0.1;
const STRONG_MARKERS = ["ויזה", "מאסטרקארד"];
const CARD_LAST4_RE = /\b\d{4}\b/;

export function scoreP1Confidence(
  bankLump: ReconciliationTransaction,
  cardDetails: ReconciliationTransaction[],
): number {
  if (cardDetails.length === 0) return 0;

  const amounts = cardDetails.map((t) => t.chargedAmount);

  let sumScore: number;
  if (sumMatches(amounts, bankLump.chargedAmount, { amountTolerancePct: EXACT_TOLERANCE })) {
    sumScore = 1.0;
  } else if (sumMatches(amounts, bankLump.chargedAmount, { amountTolerancePct: LOOSE_TOLERANCE })) {
    sumScore = 0.78;
  } else {
    return 0;
  }

  const desc = bankLump.description;
  const hasStrongMarker = STRONG_MARKERS.some((m) => desc.includes(m));
  const hasCardLast4 = CARD_LAST4_RE.test(desc);

  if (hasStrongMarker || hasCardLast4) {
    return sumScore;
  }

  const hasWeakMarker = desc.includes("חיוב");
  if (hasWeakMarker) {
    return sumScore - 0.15;
  }

  return sumScore - 0.35;
}
