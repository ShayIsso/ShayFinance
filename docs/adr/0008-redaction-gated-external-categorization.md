# ADR-0008: Redaction-gated external AI categorization

**Status:** Accepted (Phase 3). Supersedes the local-only clause of [ADR-0005](./0005-defer-ai-categorization-to-phase-3.md).
**Date:** 2026-07-12 (locked during Phase 3 charting, GitHub issue [#97](https://github.com/ShayIsso/ShayFinance/issues/97); recorded via [#98](https://github.com/ShayIsso/ShayFinance/issues/98))
**Evidence:** [`docs/ai-categorization-spike.md`](../ai-categorization-spike.md) (benchmark methodology and NO-GO results), ADR-0005 (Phase 3 retest preconditions)

## Context

ADR-0005 deferred AI categorization after two locally-runnable 7B–8B models scored 26% and 50% against the 70% accuracy bar, while a human baseline with the same prompt scored 84%. The gap is model capability on Hebrew merchant strings, not prompt design — and the local-model class small enough to self-host has not closed it. Frontier hosted models plausibly can, but ADR-0005's context mandated "local-only, no third-party APIs", which blocks even trying.

The "no data leaves the host" invariant was always a proxy for the real requirement: **secrets, identifiers, and account data must never leave the host.** Merchant descriptors (`description` strings like `שווארמה [עסק] [עיר]`) are not in that class once identifying fragments are stripped — and they are exactly the input a categorization model needs. Phase 3 charting therefore replaced the blanket local-only invariant with a redaction boundary: a precisely defined, mechanically enforced line between what may and may never cross the host boundary.

This ADR turns that locked posture into the binding document **before any egress code exists.** No external call ships until the machinery below is in place.

## Decision

External AI categorization is permitted, gated by a redaction boundary enforced in the type system, behind a pluggable provider interface that keeps a zero-egress local mode selectable, and blocked from production by the same 70% benchmark bar ADR-0005 set.

### 1. Forbidden classes — never cross the host boundary

Credentials, secrets, national IDs, account numbers, and **any digit string of 5 or more consecutive digits**. No exceptions, no per-call overrides. The 5+ digit rule is deliberately over-broad: it catches account numbers, card fragments, national IDs, and phone numbers without needing to classify them.

### 2. Permitted classes — after redaction only

- **Merchant descriptors** — the transaction `description` field, post-redaction. This is the payload.
- **Existing rules and categories** — the category list and rule/example context feed the prompt, as in the spike methodology.
- **Amounts and dates** — a permitted class under this ADR, but **not sent by default.** Enabling them requires demonstrated accuracy gaps that descriptor-only prompts cannot close, not speculation.

### 3. The redaction rule set

Redaction strips, in order:

1. **Digit runs of 5+** — replaced with a placeholder token.
2. **Keyword-secret patterns** — `password` / `token` / `key` / `OTP` (and Hebrew equivalents) plus the adjacent value.
3. **Email addresses.**
4. **Credentialed URLs** — any URL carrying userinfo or query-string credentials.
5. **Home directory paths** — filesystem paths under a user home.

The rule set is implemented as a **pure, TDD'd module** (data in, data out, no I/O) and is **shared with the log sanitizer** — one implementation of "what must never leak", exercised by both the logging path and the egress path, so the two can never drift.

### 4. Branded `RedactedString` enforcement

The redaction module is the only producer of a branded `RedactedString` type. Provider adapters accept **only** `RedactedString` — plain `string` does not type-check. Unredacted text therefore structurally cannot reach a provider; the boundary is enforced at compile time, not by reviewer vigilance.

### 5. Pluggable provider boundary

The external model (Gemini) and local Ollama sit behind the **same adapter interface**, with the same anchored-confidence output (1–7 rubric, each level behaviourally anchored) and the same review flow. **Zero-egress mode via Ollama remains selectable** — switching providers changes where inference runs, never what data may leave the host or how suggestions are trusted.

### 6. Benchmark gate

**≥70% accuracy on the 50-item Hebrew fixture** (recreated locally per the spike methodology; the fixture stays gitignored) is required before the accounting-intelligence epic builds on AI categorization. Same bar as ADR-0005 — the provider changed, the threshold did not. Below 70%, the epic does not proceed on AI signals.

### 7. Trust posture — tiered auto-apply

| Signal              | Behaviour                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Merchant-memory hit | Always applies — a previously confirmed merchant-to-category mapping outranks any model output.          |
| AI confidence 6–7   | Auto-applies, visibly marked as AI-assigned, with one-click undo. User overrides feed a corrections log. |
| AI confidence 3–5   | Queued as review suggestions — nothing applied without user action.                                      |
| AI confidence 1–2   | Transaction stays uncategorized. Low-confidence guesses are noise, not help.                             |

## Clarification 2026-07-14

The trust table's "Merchant-memory hit — always applies" row is refined by [ADR-0010](./0010-categorization-precedence-and-merchant-memory.md): memory entries carry a trust tier. **User-tier** hits (from manual assignment, correction, or explicit approval) apply as trusted and outrank any model output, as written. **Ai-tier** hits (written by confidence 6–7 auto-apply) also apply and skip the model call, but the resulting assignment stays marked AI-assigned with one-click undo — a cached AI guess does not gain trusted status by passing through the cache.

## Consequences

- **Supersedes:** the local-only / "no third-party APIs" clause of ADR-0005. The deferral decision itself and the 70% threshold stand; only the local-only constraint is replaced by the redaction boundary.
- **Locks in:** the forbidden/permitted classes, the five redaction rules, the shared-sanitizer requirement, and the `RedactedString` adapter contract. Changing any of these requires a new ADR, not a code review.
- **Locks in:** build order — the redaction module (pure, TDD'd) and branded-type boundary exist and are tested before the first provider adapter makes a network call.
- **Precludes:** sending amounts, dates, account identifiers, or any raw transaction row to a provider by default; provider adapters with `string` parameters; per-feature ad-hoc redaction implementations.
- **Preserves:** the zero-leak logging policy (unchanged and strengthened — the log sanitizer now shares the egress rule set) and a fully local operating mode for users who opt out of egress entirely.
- **Implies:** a corrections log (user overrides of AI assignments) as a first-class data source for future accuracy work, and a merchant-memory store consulted before any model call.
- **Risk accepted:** redacted merchant descriptors still reveal spending-venue names to the external provider. That is the deliberate trade: venue names in exchange for frontier-model Hebrew accuracy, with the Ollama mode as the opt-out.
