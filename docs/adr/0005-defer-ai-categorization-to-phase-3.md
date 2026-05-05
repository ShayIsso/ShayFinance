# ADR-0005: Defer AI categorization to Phase 3 (70% accuracy threshold not met)

**Status:** Accepted (Phase 2). May be superseded if Phase 3 retest clears the same bar with new methodology.
**Date:** 2026-04-28 (spike conclusion, recorded 2026-05-05)
**Evidence:** [`docs/ai-categorization-spike.md`](../ai-categorization-spike.md), GitHub issues [#42](https://github.com/ShayIsso/ShayFinance/issues/42) (spike), [#52](https://github.com/ShayIsso/ShayFinance/issues/52) (deferred implementation)

## Context

Phase 2 considered adding LLM-based categorization for transactions the rule engine fails to match (`category_id IS NULL`). Privacy posture mandates a local-only model — no third-party APIs. The spike (issue #42) benchmarked two locally-runnable Ollama models against a 50-item Hebrew transaction fixture covering 13 of the 20 default categories.

**Go/no-go threshold set upfront:** ≥70% overall accuracy. Below this, the model produces enough wrong suggestions to erode user trust in the categorisation UX.

**Results:**

| Model                   | Accuracy | Verdict |
| ----------------------- | -------- | ------- |
| `qwen2.5-coder:7b`      | 26.0%    | NO-GO   |
| `llama3.1:8b`           | 50.0%    | NO-GO   |
| Worker (human baseline) | 84.0%    | —       |

The 84% human baseline using the same prompt confirmed the information was theoretically sufficient — the gap is model capability on Hebrew, not prompt design.

**Failure modes documented in the spike:**

- `qwen2.5-coder:7b` collapsed to outputting `אחר` for ~66% of inputs (prompt-following failure on RTL Hebrew + JSON instructions).
- `llama3.1:8b` confused restaurants with supermarkets (`[שם] גריל בר`, `המאפיה [רחוב]` → `מזון וסופר`), failed on Israeli-specific telecom/utility names (`[חברת סלולר]`, `[חברת גז]`, `[שירות טלוויזיה]`), and didn't recognise parking lots (`חניון רכב [שם]`) as `רכב ודלק`.
- 0% accuracy on `מסעדות וקפה` and `רכב ודלק` — two of the highest-volume everyday expense categories.

## Decision

**Defer AI categorization to Phase 3.** Do not build `src/lib/ai-categorization/` in Phase 2. The rule engine remains the primary categorisation mechanism. Retroactive rule application (Phase 2 Tier 2, see `ARCHITECTURE.md`) is the replacement for the workflow problem AI was meant to solve — when the user creates a category rule, applying it retroactively to existing uncategorized transactions reduces the manual labelling burden without model uncertainty.

## Consequences

- **Locks in for Phase 2:** uncategorized transactions surface in the UI for manual review. No model suggestions. No Ollama sidecar in the Docker compose.
- **Affects:** Reconciliation engine, recurring detection, and analytics all assume categorisation is rule-driven. None of them depend on ML signals.
- **Precludes:** any Phase 2 feature that would assume "AI will fill in the gaps" — those features must use rules + manual review only.
- **Phase 3 retest preconditions:** before reopening, at least one of these knobs must change (per spike §5):
  1. Larger or newer models — llama3.2, Mistral-7B, or a purpose-built multilingual model. The 7B–8B class has limited Hebrew cultural knowledge.
  2. Hebrew-specific embedding model — AlephBERT or HeBERT for similarity matching rather than open-ended generation.
  3. Structured output via Ollama JSON mode (`format: "json"` with a schema) — would have prevented the qwen prompt-following collapse.
  4. Chain-of-thought prompting.
  5. Confidence thresholding — only surface suggestions above a confidence score, accepting lower recall for higher precision.
- **Threshold stability:** Phase 3 must clear the same 70% bar, or the threshold must itself be re-justified in a new ADR. Don't ship at 65% on the grounds that "it's better than nothing".
- **Test fixture preservation:** the 50-item Hebrew fixture is gitignored to keep real transaction descriptions out of the public repo. Recreate it locally from the live DB if a Phase 3 retest is run; the methodology in `docs/ai-categorization-spike.md` is sufficient to reproduce.
