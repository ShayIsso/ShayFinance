# Phase 3 AI Categorization Benchmark — Clearing the 70% Gate

**Status:** Complete — **GO (external, `gemini-flash-latest`)** / **NO-GO (local)**
**Issue:** Closes #100 (part of map #97)
**Predecessor:** [`ai-categorization-spike.md`](./ai-categorization-spike.md) (Phase 2, NO-GO at 26–50%)
**Gate:** ≥70% accuracy on a 50-item Hebrew fixture, per [ADR-0005](./adr/0005-defer-ai-categorization-to-phase-3.md) / [ADR-0008](./adr/0008-redaction-gated-external-categorization.md)

---

## 1. Methodology

### Fixture rebuild — population change vs the spike

The spike sampled the uncategorized pool (`category_id IS NULL`). That pool now holds ~6 rows, so it can no longer seed a fixture. Instead, the fixture samples **categorized transactions whose `description` matches no active rule** — labels that cannot have come from the rule engine and are therefore the owner's manual assignments. This is the same production population AI categorization serves (descriptions rules can't handle), with authoritative ground truth instead of the spike's worker-labeled-then-corrected process.

- **Pool:** 89 distinct manually-labeled descriptions (of 299 distinct categorized; 200 rule-matched, 8 excluded for conflicting labels, 2 excluded where rule and label disagreed).
- **Sample:** 50 items, stratified round-robin across 14 categories, capped at 9 per category, seeded shuffle (deterministic).
- **Few-shot examples:** drawn exclusively from the **rule-matched** pool — disjoint from the fixture by construction (rule matching is deterministic on `description`), eliminating the spike's 14/50 few-shot-overlap caveat.
- Both files are gitignored; `scripts/spike/build-fixture.ts` regenerates them from the live DB.

### Redaction at the boundary

Every description passed through a throwaway implementation of ADR-0008's five redaction rules (digit runs ≥5, keyword-secret patterns, emails, credentialed URLs, home paths) **before reaching any provider — local included**, mirroring the production contract where adapters accept only `RedactedString`. 3 of 50 fixture items were altered by redaction (digit runs in branch/account fragments); none lost the merchant signal.

### Prompt

Same shape as the spike: full category list (21 categories, with type + short English hint), few-shot examples per category (≤6), batch of 20 numbered descriptions, JSON-object output instruction (`{"answers": [...]}`). `temperature: 0`; Gemini via `responseMimeType: application/json`; Ollama via `format: "json"`, `seed: 42`, `num_ctx: 8192` (the 4096 default silently truncates the prompt head).

### Trajectory audit

Every raw model response (including failed attempts) is captured per batch in the gitignored `benchmark-results-*.json` files, so any scoring anomaly can be traced to what the model actually emitted rather than inferred from the score. This caught three harness defects during the run — Gemini Pro emitting several concatenated JSON objects (parser fixed to merge balanced JSON values), the Ollama context-window truncation above, and Node `fetch`'s 5-minute header timeout killing slow non-streaming local generations (fixed by streaming).

### Scoring — raw and adjudicated

Two scores per model:

- **Raw:** exact string match against the owner's DB label.
- **Adjudicated:** 13 items were missed by _all three_ Gemini tiers with the _identical_ prediction. Owner review (2026-07-14) confirmed every one as either a one-time manual label (personal context a model cannot see — e.g. what an ATM withdrawal was spent on, who a person-to-person transfer paid), or a double-meaning-category judgment call (e.g. a drugstore split between קניות וביגוד and בריאות, municipal parking between חשבונות ושירותים and רכב ודלק). For these 13, the consensus answer is also accepted. The adjudication list is gitignored alongside the fixture; `scripts/spike/rescore.ts` applies it.

The adjudicated score is the gate score: the gate measures model capability on Hebrew merchant descriptors, and holding models to labels that encode private context (or taxonomy ambiguity — see §5) measures the fixture, not the model.

---

## 2. Results

| Model                          | Raw                 | Adjudicated     | Gate (≥70%)        |
| ------------------------------ | ------------------- | --------------- | ------------------ |
| gemini-flash-latest            | 26/50 (52%)         | **39/50 (78%)** | **GO**             |
| gemini-pro-latest              | 25/50 (50%)         | **38/50 (76%)** | **GO**             |
| gemini-flash-lite-latest       | 19/50 (38%)         | 32/50 (64%)     | NO-GO              |
| ollama llama3.2:3b             | 0 parseable answers | —               | NO-GO (structural) |
| ollama qwen3:8b                | not run (see §4)    | —               | —                  |
| ollama gemma3:12b              | not run (see §4)    | —               | —                  |
| _Spike reference: llama3.1:8b_ | _50%_               | _—_             | _NO-GO (Phase 2)_  |

Cost note (#99 budget): the full Gemini sweep — three tiers, several reruns — consumed a negligible slice of the ₪38 credit; at 50 items × 3 batches the per-run cost is well under ₪0.1 even on pro.

`llama3.2:3b` failed the way `qwen2.5-coder:7b` failed in the spike: a prompt-following collapse, not a semantic one. Each attempt generated for 10+ minutes at `temperature: 0` and returned JSON containing zero usable answers; with deterministic settings, retries reproduce the same output byte-for-byte, so the run was stopped after the failure mode was confirmed.

---

## 3. Per-category and failure patterns (gemini-flash-latest, adjudicated)

| Category                       | n   | Adjudicated |
| ------------------------------ | --- | ----------- |
| אחר                            | 7   | 7/7         |
| מסעדות וקפה                    | 7   | 7/7         |
| קניות וביגוד                   | 7   | 6/7         |
| מזון וסופר                     | 6   | 3/6         |
| בילויים ופנאי                  | 6   | 5/6         |
| מתנות ואירועים                 | 4   | 1/4         |
| העברה פנימית                   | 4   | 3/4         |
| מנויים                         | 2   | 2/2         |
| חשבונות ושירותים               | 2   | 2/2         |
| תשלום כ. אשראי, השקעות, בריאות | 3   | 3/3         |
| חינוך, הסדרה - כרטיס אשראי     | 2   | 0/2         |

The spike's worst categories are fixed: מסעדות וקפה went 0% → 100% (the spike's restaurants-become-supermarkets failure is gone), חשבונות ושירותים 17% → 100%, and the collapse-to-אחר failure mode did not appear on any Gemini tier. The 11 remaining misses split into two patterns:

**1. Personal-context items (5) — unresolvable by any model.** ATM withdrawals labeled by what the cash bought (`מש' מכספומט [תאריך]` → מתנות ואירועים), person-to-person transfers labeled by what they paid for (`הע. ל[שם] בסניף [סניף]` → בילויים ופנאי / מתנות ואירועים), and a transfer to a nonprofit labeled חינוך. The description provably does not contain the answer. These cap the fixture ceiling at ~90% and are a taxonomy problem (#133), not a model problem.

**2. Genuine knowledge/semantics misses (6).** A discount chain routed to the wrong retail category (`[רשת דיסקאונט]` → קניות instead of מזון), a gas-station convenience store routed to fuel (`[חנות נוחות] [ישוב]` → רכב ודלק), a plumbing-supplies store (`[שם] אינסטלציה`) routed to services, a butcher-style trade name unrecognized, and two bank-mechanics strings (`זיכוי זמני`, a keying-error check reversal `טעות בהקלד`) misread as income. Half of these would be fixed by the per-category descriptions with anti-examples proposed in #133.

---

## 4. Resolution — GO/NO-GO per provider

**External — GO on `gemini-flash-latest` (78% adjudicated).** Consistent with #99's cheap-first policy: flash outperformed pro (76%) at a fraction of the cost, so pro stays reserved; flash-lite fails the gate (64%) and is out. The accounting-intelligence epic may build on AI signals from this provider, behind ADR-0008's redaction boundary and confidence tiers.

**Local / zero-egress — NO-GO for now; mode stays selectable.** The decision to stop after `llama3.2:3b` (rather than run `qwen3:8b` / `gemma3:12b`, both already pulled) was made deliberately with the owner:

- **Latency disqualifies the class that might pass.** One 20-item batch on the _smallest_ 3B model exceeded 10 minutes per attempt on the 16 GB dev machine; the 12B class — the only one with plausible accuracy headroom — is several times slower. A post-sync backfill of ~100 transactions would take hours. Zero-egress inference on current hardware fails on operational grounds before accuracy is even measured.
- **Accuracy evidence points the same way.** The spike's best local (8B) scored 50% raw; nothing in the 3–12B class since has gained the Israeli-merchant knowledge that separates 50% from 70% — the frontier hosted model only clears the bar at 78% with adjudication.
- Per ADR-0008, zero-egress via Ollama **remains selectable** — the provider interface requirement stands. What changes is only the claim: no local model currently _backs_ the mode. Revisit after the #133 taxonomy work lands (category descriptions + fewer double-meaning categories lift all providers) or when hardware changes.

---

## 5. The category-taxonomy problem (separate track — #133)

The adjudication review surfaced a real product issue independent of model choice: several categories overlap or double-book meaning, and some labels exist only because no honest category fits. Filed as #133 with the patterns a comparable reference project used:

- **Drop the "Other" catch-all** — it teaches the model to shrug ambiguous items into it.
- **A dedicated Cash/ATM category** — stop guessing what withdrawn cash was spent on; the description provably cannot say.
- **One Transport category** — fuel, parking, tolls, public transport, taxis; removes the רכב ודלק / תחבורה ציבורית / municipal-parking triple-booking. חשבונות ושירותים itself stays; parking fines (דוח חנייה) are an open sub-decision.
- **Personal-care category** — barbers, cosmetics; currently homeless (goes to בילויים ופנאי / אחר).
- **Per-category descriptions with positive and anti-examples**, rendered into the AI prompt — the highest-leverage accuracy fix available without touching models.
- **`category_source` (`ai` | `user`) + corrections log** — already implied by ADR-0008's trust posture.

Owner is thinking through the taxonomy in UX terms before any implementation ticket.

---

## 6. Reproduction

All data files are gitignored (real transaction descriptions never enter the repo): `scripts/spike/fixture.json`, `few-shot.json`, `adjudications.json`, `benchmark-results-*.json`, and the runner `benchmark.ts`. Committed tooling: `scripts/spike/build-fixture.ts` (rebuilds fixture + few-shot from the live DB) and `scripts/spike/rescore.ts` (raw + adjudicated scoring over result files). The runner is reconstructible from §1 (prompt shape, providers, settings, redaction rules).

### Anonymization

As in the spike, merchant names, person names, branch numbers, and neighborhoods in this report are replaced with bracketed placeholders while preserving the Hebrew word(s) that motivated each failure.
