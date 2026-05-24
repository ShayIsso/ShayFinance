import { amountsMatch, datesWithin } from "@/lib/transaction-matching";
import type { P2MirrorCandidate, ReconciliationTransaction } from "./types";

const EXACT_TOLERANCE = 0.02;
const DATE_WINDOW_DAYS = 1;
const OVERLAP_PENALTY = 0.25;
const MIN_CONFIDENCE = 0.7;
const HIGH_CONFIDENCE = 0.95;

// Hebrew and Latin Bit/debit markers (case-insensitive for Latin)
const BIT_MARKER_RE = /ביט|חיוב ישיר|bit/i;

function hasMarker(description: string): boolean {
  return BIT_MARKER_RE.test(description);
}

function parseDate(dateStr: string): Date {
  // Use noon UTC to avoid timezone boundary issues
  return new Date(`${dateStr}T12:00:00Z`);
}

export function detectP2Mirror(transactions: ReconciliationTransaction[]): P2MirrorCandidate[] {
  const unreconciled = transactions.filter((tx) => tx.reconciliationGroupId === null);

  if (unreconciled.length === 0) return [];

  // Build candidates considering only ordered pairs (i < j) to avoid duplicates.
  // The "bankSide" label is applied to whichever carries a marker; if both or neither do,
  // we use array order. The detector is permissive about bankType — the only constraint is
  // different bankAccountIds.
  const rawCandidates: P2MirrorCandidate[] = [];

  for (let i = 0; i < unreconciled.length; i++) {
    const a = unreconciled[i];
    const aDate = parseDate(a.date);

    for (let j = i + 1; j < unreconciled.length; j++) {
      const b = unreconciled[j];

      // Must be on different bank accounts
      if (a.bankAccountId === b.bankAccountId) continue;

      // Amounts must match within exact tolerance
      if (
        !amountsMatch(a.chargedAmount, b.chargedAmount, { amountTolerancePct: EXACT_TOLERANCE })
      ) {
        continue;
      }

      // Dates must be within ±1 day
      const bDate = parseDate(b.date);
      if (!datesWithin(aDate, bDate, DATE_WINDOW_DAYS)) {
        continue;
      }

      // At least one side must have a Bit/debit marker (otherwise drop)
      const aHasMarker = hasMarker(a.description);
      const bHasMarker = hasMarker(b.description);
      if (!aHasMarker && !bHasMarker) continue;

      // Confidence: 0.95 if both sides have marker, 0.70 if only one side does
      const confidence = aHasMarker && bHasMarker ? HIGH_CONFIDENCE : MIN_CONFIDENCE;

      // Assign bankSide / cardSide: prefer side without marker as bankSide (artifact).
      // If both or neither have marker, use array order (a = bankSide, b = cardSide).
      const [bankSide, cardSide] = aHasMarker && !bHasMarker ? [b, a] : [a, b];

      rawCandidates.push({ kind: "p2_mirror", bankSide, cardSide, confidence });
    }
  }

  if (rawCandidates.length === 0) return rawCandidates;

  // Ambiguity penalty: if a single row appears as bankSide in more than one candidate,
  // degrade every competing candidate by -0.25 per extra contender.
  // We track by the canonical pair key (sorted ids) to count competitors per pair.
  const degraded = rawCandidates.map((candidate) => {
    const competitors = rawCandidates.filter(
      (other) => other !== candidate && other.bankSide.id === candidate.bankSide.id,
    );

    if (competitors.length === 0) return candidate;

    const newConfidence = candidate.confidence - OVERLAP_PENALTY * competitors.length;
    return { ...candidate, confidence: Math.max(0, newConfidence) };
  });

  return degraded.filter((c) => c.confidence >= MIN_CONFIDENCE);
}
