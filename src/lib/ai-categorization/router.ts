/**
 * Where a parsed answer goes, by anchored confidence (ADR-0008 §7, CONTEXT.md
 * "tiered auto-apply"):
 * - `auto_apply` (6–7): applied marked-as-AI with one-click undo.
 * - `review` (3–5): queued as a suggestion; nothing applied without the user.
 * - `discard` (1–2): noise — the transaction stays uncategorized.
 */
export type ConfidenceTier = "auto_apply" | "review" | "discard";

/**
 * Routes an anchored 1–7 confidence to its trust tier.
 *
 * The input is the integer rubric score, NEVER reconciliation's 0–1 float — the
 * two confidence scales are structurally different and must never be
 * cross-wired. A value outside 1–7 is a programming error (parsing rejects such
 * values upstream as a structured failure), so it throws rather than guessing a
 * tier.
 */
export function routeConfidence(confidence: number): ConfidenceTier {
  if (!Number.isInteger(confidence) || confidence < 1 || confidence > 7) {
    throw new RangeError(`anchored confidence must be an integer 1–7, got ${confidence}`);
  }
  if (confidence >= 6) return "auto_apply";
  if (confidence >= 3) return "review";
  return "discard";
}
