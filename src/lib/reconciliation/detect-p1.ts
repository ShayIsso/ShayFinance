import { datesWithin } from "@/lib/transaction-matching";
import { scoreP1Confidence } from "./confidence";
import type { ReconciliationCandidate, ReconciliationTransaction } from "./types";

const CYCLE_WINDOW_DAYS = 35;
const LUMP_MARKERS = ["ויזה", "מאסטרקארד", "חיוב"];
const CARD_LAST4_RE = /\b\d{4}\b/;
const CARD_BANK_TYPES: ReadonlySet<string> = new Set(["max", "visaCal"]);
const BANK_TYPES: ReadonlySet<string> = new Set(["discount"]);
const OVERLAP_PENALTY = 0.25;
const MIN_CONFIDENCE = 0.7;

function isBankLumpCandidate(tx: ReconciliationTransaction): boolean {
  if (!BANK_TYPES.has(tx.bankType)) return false;
  return LUMP_MARKERS.some((m) => tx.description.includes(m)) || CARD_LAST4_RE.test(tx.description);
}

function parseDate(dateStr: string): Date {
  // Use noon UTC to avoid timezone boundary issues
  return new Date(`${dateStr}T12:00:00Z`);
}

export function detectP1Settlement(
  transactions: ReconciliationTransaction[],
): ReconciliationCandidate[] {
  const unreconciled = transactions.filter((tx) => tx.reconciliationGroupId === null);

  const bankLumps = unreconciled.filter(isBankLumpCandidate);
  const cardTxns = unreconciled.filter((tx) => CARD_BANK_TYPES.has(tx.bankType));

  if (bankLumps.length === 0 || cardTxns.length === 0) return [];

  const rawCandidates: ReconciliationCandidate[] = [];

  for (const lump of bankLumps) {
    const lumpDate = parseDate(lump.date);
    const cycleCardTxns = cardTxns.filter((card) =>
      datesWithin(lumpDate, parseDate(card.date), CYCLE_WINDOW_DAYS),
    );

    if (cycleCardTxns.length === 0) continue;

    const confidence = scoreP1Confidence(lump, cycleCardTxns);
    if (confidence < MIN_CONFIDENCE) continue;

    rawCandidates.push({ bankLump: lump, cardDetails: cycleCardTxns, confidence });
  }

  if (rawCandidates.length <= 1) return rawCandidates;

  // Degrade confidence when multiple lumps compete for the same card transactions
  return rawCandidates
    .map((candidate) => {
      const cardIds = new Set(candidate.cardDetails.map((c) => c.id));
      const overlapCount = rawCandidates.filter(
        (other) => other !== candidate && other.cardDetails.some((c) => cardIds.has(c.id)),
      ).length;

      if (overlapCount === 0) return candidate;

      const degraded = candidate.confidence - OVERLAP_PENALTY * overlapCount;
      return { ...candidate, confidence: Math.max(0, degraded) };
    })
    .filter((c) => c.confidence >= MIN_CONFIDENCE);
}
