# ADR-0010: Categorization precedence, merchant memory, and the single overwrite law

**Status:** Accepted (Phase 3). Refines the merchant-memory row of [ADR-0008](./0008-redaction-gated-external-categorization.md)'s trust table.
**Date:** 2026-07-14 (decided in grilling session, GitHub issue [#101](https://github.com/ShayIsso/ShayFinance/issues/101))
**Evidence:** [`docs/ai-categorization-benchmark-phase3.md`](../ai-categorization-benchmark-phase3.md) (#100 GO on `gemini-flash-latest`), ADR-0008 (trust posture), issue #133 (category-taxonomy problem)

## Context

#100 cleared ADR-0008's 70% benchmark gate, so AI becomes the third categorization layer. Before any pipeline code exists, the layers need a composition law: what runs in what order, who may overwrite whom, and how the system learns.

Two findings shaped the design. First, the rule engine was the pre-AI learning path — `suggestRule` mints a `contains` rule from the full description on every accepted "Create rule?" prompt, so the rule set is mostly one-off merchant→category mappings (merchant memory avant la lettre) rather than deliberate patterns, and the Settings rules list grew unboundedly. Second, #100's adjudication showed that some merchants legitimately flip categories over time (same store, different purchases) — a taxonomy defect (#133), which memory must tolerate gracefully rather than solve.

## Decision

Three layers, one overwrite law, tiered memory.

### 1. Precedence: rules → merchant memory → AI

First layer to answer wins at assignment time; AI only sees what neither resolved (bulk memory lookup before any AI batch). Rules stay the top layer as deliberately-authored law — they generalize by pattern where memory is exact-key, and they encode bank-mechanics semantics the benchmark showed AI misreads (`זיכוי זמני`, `טעות בהקלד`). But rules stop growing by default: the "Create rule?" suggestion on manual assignment is removed, memory is the default learning path, and approving a memory write does not suggest creating a rule.

### 2. Provenance: `category_source`

`transactions.category_source` enum `rule | memory | ai | user`, NULL = uncategorized. The value records the **trust tier, not the mechanism**: a user-tier memory hit writes `memory`; an ai-tier memory hit writes `ai` — otherwise an unreviewed auto-apply would launder itself into protected status by round-tripping through the cache.

### 3. The single overwrite law

Automated processes (retroactive rule application, memory fan-out, future AI runs) may overwrite only `NULL` and `ai`-sourced assignments. `user`, `rule`, and `memory`-sourced assignments are never overwritten by automation. One sentence explains the system: user decisions are never overwritten; AI guesses yield to everything. Retroactive rule application extends from fill-NULL-only to this law.

### 4. Merchant memory: exact-key, two tiers, last-write-wins

- **Key** = `extractMerchant(description)` — imported from `transaction-matching`, computed on raw `description`, never `custom_description`. `canonicalizeMerchant` stays a similarity-only concern per its own contract: keying on the curated alias table would change the key function on every alias addition and orphan existing rows.
- **Every assignment event writes memory**, tiered: manual categorization, corrections, and explicit approval of a queued suggestion write **user-tier** (hits always apply, outrank any model output). AI confidence 6–7 auto-applies write **ai-tier** — a hit skips the model call (cached, deterministic, free) but the assignment stays marked AI-assigned with one-click undo. Any user touch on the merchant promotes the entry to user-tier.
- **Conflicts are last-write-wins.** A correction that contradicts an existing entry overwrites it (and promotes it). Oscillating merchants are a taxonomy defect — the corrections log surfaces them as evidence for #133; no abstain state or multi-mapping machinery.
- **Fan-out:** a user-tier write auto-applies to existing same-key transactions under the overwrite law (NULL and `ai` only), surfaced as a count with undo — not a confirmation modal.

### 5. Corrections log

Append-only `category_corrections`: any user recategorization of an already-categorized transaction, recording merchant key, **pre-redacted** description snapshot (the redaction module runs at write time so the prompt path can consume rows directly and raw text can never leak through this side channel), from/to **category-name snapshots** (immutable history that survives #133's merges/renames; nullable FKs ride along), `from_source`, timestamp. First-time labeling is a memory write, not a correction. Future prompts consume `from_source = 'ai'` rows as anti-examples; the whole log is oscillation evidence for #133.

### 6. Module home and schema

New deep module `src/lib/merchant-memory` owns both tables (pure core + Store pattern per ADR-0007). The correction — overwrite entry, promote tier, append log row, fan out — is one atomic operation there, so no caller can update memory and forget the log. `categories` keeps taxonomy + rules; precedence is composed at the existing import seam (`importTransaction`'s categorizer parameter).

### 7. Backfill: detect rules, memory starts empty

`category_source` for existing rows is backfilled by an owner-run script (migration stays pure DDL): rows whose `description` matches an active rule pointing at their current category get `rule`; the rest get `user`. **Merchant memory is not pre-seeded from history** — historical manual labels include personal-context assignments (#100 §3: ATM withdrawals, person-to-person transfers) that must not fossilize into always-apply mappings. Memory earns entries from live actions only.

### 8. Sequencing

Memory + provenance first → #133 taxonomy decision (informed by real corrections data) → AI pipeline (prompting against the fixed category set).

## Consequences

- **Locks in:** the precedence order, the single overwrite law, the two memory tiers, exact-key normalization via `extractMerchant`, last-write-wins conflicts, and the corrections-log scoping. Changing any of these requires a new ADR.
- **Refines ADR-0008:** the trust table's "merchant-memory hit always applies" now reads per-tier — user-tier applies as trusted; ai-tier applies as a cached AI guess, still marked and undoable (clarification recorded in ADR-0008).
- **Precludes:** pre-seeding memory from historical labels; auto-migrating one-off rules into memory (a `contains`-full-description rule matches description variants; an exact memory key does not — conversion is not behavior-preserving); pagination or browsing investment in the Settings rules UI (growth is frozen; a later HITL pruning pass shrinks the list to genuine patterns).
- **Implies:** the `merchant-memory` module + migration + import wiring + correction flow + backfill script as one implementation slice (#135); removal of `suggestRule` and its UI; a follow-up HITL pass to prune one-off rules once memory is live (#136); #133 consumes the corrections log as evidence.
- **Risk accepted:** double-meaning merchants get the "wrong half" of their purchases auto-applied until #133 fixes the taxonomy — each flip is logged, visible, and one click to undo.
