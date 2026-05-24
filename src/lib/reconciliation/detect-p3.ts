import { amountsMatch, datesWithin } from "@/lib/transaction-matching";
import type { P3InterAccountCandidate, ReconciliationTransaction } from "./types";

const EXACT_TOLERANCE = 0.02;
const DATE_WINDOW_DAYS = 2;
const OVERLAP_PENALTY = 0.25;
const MIN_CONFIDENCE = 0.7;
const BOTH_SIDES_CONFIDENCE = 0.9;
const ONE_SIDE_CONFIDENCE = 0.7;

// Hebrew and Latin transfer markers
const TRANSFER_MARKER_RE = /ביט|העברה|bit|transfer/i;

function hasMarker(description: string): boolean {
  return TRANSFER_MARKER_RE.test(description);
}

function parseDate(dateStr: string): Date {
  // Use noon UTC to avoid timezone boundary issues
  return new Date(`${dateStr}T12:00:00Z`);
}

export function detectP3InterAccount(
  transactions: ReconciliationTransaction[],
): P3InterAccountCandidate[] {
  const unreconciled = transactions.filter((tx) => tx.reconciliationGroupId === null);

  if (unreconciled.length === 0) return [];

  const rawCandidates: P3InterAccountCandidate[] = [];

  for (let i = 0; i < unreconciled.length; i++) {
    const a = unreconciled[i];
    const aDate = parseDate(a.date);

    for (let j = i + 1; j < unreconciled.length; j++) {
      const b = unreconciled[j];

      // Must be on different bank accounts
      if (a.bankAccountId === b.bankAccountId) continue;

      // Must have opposite signs (one positive incoming, one negative outgoing)
      if (a.chargedAmount === 0 || b.chargedAmount === 0) continue;
      if (Math.sign(a.chargedAmount) === Math.sign(b.chargedAmount)) continue;

      // Absolute amounts must match within exact tolerance
      if (
        !amountsMatch(Math.abs(a.chargedAmount), Math.abs(b.chargedAmount), {
          amountTolerancePct: EXACT_TOLERANCE,
        })
      ) {
        continue;
      }

      // Dates must be within ±2 days
      const bDate = parseDate(b.date);
      if (!datesWithin(aDate, bDate, DATE_WINDOW_DAYS)) {
        continue;
      }

      // At least both sides must have transfer markers to include at min confidence
      const aHasMarker = hasMarker(a.description);
      const bHasMarker = hasMarker(b.description);

      // Drop entirely if no markers on either side
      if (!aHasMarker && !bHasMarker) continue;

      // Confidence: 0.9 when both sides have marker, 0.7 when only one side does
      const confidence = aHasMarker && bHasMarker ? BOTH_SIDES_CONFIDENCE : ONE_SIDE_CONFIDENCE;

      // Assign outgoing/incoming by sign: negative = outgoing, positive = incoming
      const [outgoingSide, incomingSide] = a.chargedAmount < 0 ? [a, b] : [b, a];

      rawCandidates.push({ kind: "p3_inter_account", outgoingSide, incomingSide, confidence });
    }
  }

  if (rawCandidates.length === 0) return rawCandidates;

  // Ambiguity penalty: if a single row appears as outgoingSide in more than one candidate,
  // degrade every competing candidate by -0.25 per extra contender.
  const degraded = rawCandidates.map((candidate) => {
    const outgoingCompetitors = rawCandidates.filter(
      (other) => other !== candidate && other.outgoingSide.id === candidate.outgoingSide.id,
    );
    const incomingCompetitors = rawCandidates.filter(
      (other) => other !== candidate && other.incomingSide.id === candidate.incomingSide.id,
    );

    const totalCompetitors = outgoingCompetitors.length + incomingCompetitors.length;
    if (totalCompetitors === 0) return candidate;

    const newConfidence = candidate.confidence - OVERLAP_PENALTY * totalCompetitors;
    return { ...candidate, confidence: Math.max(0, newConfidence) };
  });

  return degraded.filter((c) => c.confidence >= MIN_CONFIDENCE);
}
