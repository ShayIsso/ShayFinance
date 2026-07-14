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

**Post-taxonomy-v2 change to the runner (§7).** The category list is no longer built from a hard-coded English-hint map. The runner now `SELECT name, type, description FROM categories` and renders one bullet per category as `- <name> — <Hebrew description>`, where `description` is the taxonomy-v2 כולל/לא כולל guidance column (#133). This is the only prompt-shape change; few-shot construction, batch size, output contract, redaction rules (descriptions pass through the same `redact()` before egress — they are generic public text and are unaltered by it), and provider settings are unchanged. `build-fixture.ts` and `rescore.ts` are unchanged; the #100 `adjudications.json` (old taxonomy) does not apply to v2 and was replaced by the owner's 2026-07-14 v2 rulings (see §7), which `rescore.ts` applies as before.

### Anonymization

As in the spike, merchant names, person names, branch numbers, and neighborhoods in this report are replaced with bracketed placeholders while preserving the Hebrew word(s) that motivated each failure. The same rules bind §7.

---

## 7. Post-taxonomy re-run (v2 + prompt descriptions)

**Issue:** #139 (part of map #97). Ran 2026-07-14 against the migrated taxonomy-v2 dev DB.

### Method delta vs §1

Three things changed together; everything else in the harness is byte-for-byte §1:

1. **Taxonomy v2 (#133 / PR #140).** 21 categories → **17**. `אחר` and `חינוך` are gone; a dedicated **`מזומן ומשיכות`** (cash/ATM/generic-P2P) category exists; `רכב ודלק` + `תחבורה ציבורית` collapsed into **`תחבורה`**; `בריאות` → **`בריאות וטיפוח`** (now owns pharmacies + barbers/cosmetics); `השקעות` + `חיסכון` → **`השקעות וחיסכון`**; `ביטוח` folded into `חשבונות ושירותים`.
2. **Per-category descriptions in the prompt** — the measured variable. Each category now carries a Hebrew כולל / לא כולל description; the runner renders these in place of the old short English hints (see §6).
3. **Rebuilt fixture.** `build-fixture.ts` re-derived it from the migrated DB by the unchanged §1 rule (manually-labeled descriptions matching no active rule; few-shot from the disjoint rule-matched pool). Fixture size is still **50** (manual pool grew to 143 distinct descriptions across 15 categories; the stratified round-robin fills 50), so the headline percentages remain directly readable — but the _items_ differ from #100, so old-vs-new raw is a methodology comparison, not a like-for-like item delta.

Both files stay gitignored. 2 of 50 items were altered by redaction (digit runs), neither losing merchant signal.

### Results

| Model                    | #100 raw (old taxonomy) | #100 adjudicated | **v2 raw**         | v2 adjudicated (owner-ruled 2026-07-14) |
| ------------------------ | ----------------------- | ---------------- | ------------------ | --------------------------------------- |
| gemini-flash-latest      | 26/50 (52%)             | 39/50 (78%) GO   | **25/50 (50%)**    | **36/50 (72%) — GO**                    |
| gemini-flash-lite-latest | 19/50 (38%)             | 32/50 (64%)      | **23/50 (46%)**    | 31/50 (62%) — NO-GO                     |
| gemini-pro-latest        | 25/50 (50%)             | 38/50 (76%)      | not run (reserved) | —                                       |

#100's gate score was the _adjudicated_ score (§1: labels encoding private context or taxonomy ambiguity measure the fixture, not the model), and its adjudication was owner-signed. That adjudication did **not** carry over — it was authored against the old taxonomy and old items — so the owner re-adjudicated the v2 misses live (2026-07-14): each of flash's 25 raw misses was ruled either "model correct under v2, historical label stale" or "label stands". The 11 accepted rulings replace the #100 `adjudications.json` (gitignored, applied by `rescore.ts`). The adjudicated column above is the gate score, as in #100.

### Why raw barely moved (52% → 50%) — and why that understates the model

The descriptions did their job: on the re-run the model's answers track the **v2** semantics closely. The problem is that the fixture's ground truth is the owner's **pre-v2 manual labels**, and the migration deliberately did not rewrite historical manual assignments (`category_source` stays `user`; no corrections-log rows — taxonomy migration is not a learning signal). So on exactly the items where v2 moved a boundary, the model now answers the **v2-correct** category and is scored **wrong** against a label that predates the boundary. The raw metric penalises correct v2 behaviour. This shows up structurally in the miss analysis.

### Miss analysis — gemini-flash-latest (25 misses, anonymised)

**(b) Personal-context or stale-under-v2 — 13 items (pre-adjudication candidate list; the owner's final ruling is below).** The description provably does not carry the answer, or v2 reassigned the boundary and the historical label wasn't rewritten. In every one, the model's answer is defensible (often _more_ v2-correct than the label):

- ATM withdrawal dated by day, labelled by what the cash later bought — `מש' מכספומט [בנק] [תאריך]` (×2) → label `מתנות ואירועים`, model `מזומן ומשיכות`. Under v2 the model's answer is the literal home of a cash withdrawal.
- Self-transfer to own bank account (string carries the owner's own name) — `העברה [שם] ... משיכה לחשבון הבנק` (×2) → label `העברה פנימית`, model `מזומן ומשיכות`. Requires knowing the name is the owner's.
- Cloud-storage subscription — `[שירות ענן] ... US` (×2) → label `חשבונות ושירותים`, model `מנויים`. The v2 `מנויים` description explicitly names אחסון בענן; the model follows the description.
- Generic person-to-person transfer, labelled by purpose — `הע. ל[שם] בסניף [סניף]` (×2, labels `בילויים ופנאי` / `מתנות ואירועים`) → model `מזומן ומשיכות`, the v2 default for unidentifiable P2P.
- P2P via a payment app to a locality — `[אפליקציית תשלום] [יישוב]` → label `בריאות וטיפוח`, model `מזומן ומשיכות`. Purpose not in the string.
- Transfer from named family members marked refund — `העברה מ[שמות] חשבון [חשבון] החזר` → label `העברה פנימית`, model `הכנסה אחרת` (misled by החזר). Requires knowing the names are family.
- Transfer to a named non-profit (an internship-program fee, per owner) — `העברה ל[עמותה] (ע"ר)` → label `חשבונות ושירותים`, model `מזומן ומשיכות`. The purpose is owner knowledge.
- A named barbershop — `מספרה [שם]` → label `בילויים ופנאי` (pre-rename), model `בריאות וטיפוח`. v2 `בריאות וטיפוח` explicitly lists מספרות; the model is v2-correct and the label is stale.

**(c) Sibling near-misses — 8 items.** Defensible either way; a coin-flip between adjacent categories:

- discount grocery brand under a café name — `סופר [רשת]` → `מזון וסופר` vs label `מסעדות וקפה`.
- market food stall — `[שם] בשוק` → `מסעדות וקפה` vs label `בילויים ופנאי`.
- one-off receipt labelled income — `[שם]` → `משכורת` vs label `הכנסה אחרת` (income-vs-income).
- a hyper/variety discount store (brand reads as "value") — `[רשת]` → `קניות וביגוד` vs label `מזון וסופר`.
- a bar under a proper-noun name — `[שם]` → `מסעדות וקפה` vs label `בילויים ופנאי`.
- fuel-brand convenience store — `[רשת דלק] [יישוב]` → `תחבורה` vs label `מזון וסופר` (the §3 gas-station-shop pattern, now with a Cash/Transport split).
- food-supplements shop — `[שם] תוספי מזון` → `בריאות וטיפוח` vs label `מזון וסופר`.
- ice-cream parlour — `גלידריית [שם]` → `מסעדות וקפה` vs label `קניות וביגוד`.

**(a) Genuine model errors — 4 items.** No v2 rescue and no private context; the model was simply wrong:

- an opaque corporate holding name — `[שם] גרופ בע"מ` → `מזון וסופר` (label `תחבורה`). Unknowable from the string, but a genuine miss.
- a bank-mechanics reversal string — `זיכוי זמני ...` → read as `הכנסה אחרת` (label `הסדרה - כרטיס אשראי`).
- an opaque venue name → wrong retail category.
- an opaque Latin-script venue name → `מנויים`.

So of 25 raw misses, **21 are fixture/taxonomy artefacts or defensible ties (b+c)** and only **4 are genuine capability errors (a)** — an 8% genuine-error rate, materially better than the 50% raw score suggests and consistent with #100's finding that flash's true Hebrew-merchant capability sits in the high-70s once fixture noise is removed.

`gemini-flash-lite-latest` mirrors the same 13 (b) candidates, but adds genuine sibling errors flash got right (a butcher/meat-vendor trade name → `מסעדות וקפה` instead of `מזון וסופר`; a fuel-brand item → `מזון וסופר`; a card-fee string → `חשבונות ושירותים`), so it trails flash at every cut.

### Final adjudication (owner-ruled 2026-07-14)

The owner reviewed all 25 flash misses live and ruled **11** of them "model correct under v2, historical label stale": the two ATM-withdrawal items, the two P2P-to-person transfers labelled by remembered purpose, the barbershop item, the two cloud-storage subscription items, the payment-app merchant item, the venue the model called a subscription, the food-supplements item, and the ice-cream parlour item. The other **14 stand as real misses** — including, conservatively, the owner's own self-transfer descriptions, the family-account transfers, and the non-profit fee, plus the sibling near-misses and genuine errors.

The ruling is more conservative than this section's (b)-class estimate: 11 items accepted against the 13-candidate projection of ≈76%, keeping the personal-context transfers as label-stands while agreeing with the model on three items the pre-adjudication analysis had classed as near-misses or errors. **Final adjudicated score: flash-latest 36/50 = 72%.**

Applying the same 11 rulings to `gemini-flash-lite-latest` (it missed all 11 items, but on three of them gave a _different_ wrong answer than the accepted one, so it gains only 8) yields **31/50 = 62% adjudicated** — below the gate on every cut; it stays out either way.

One process outcome: the adjudication surfaced a rule/description inconsistency for the cloud-storage subscription merchant — an existing rule pointed it at `חשבונות ושירותים` while the v2 `מנויים` description explicitly claims cloud storage. The owner ruled with the model, and the rule was re-pointed to `מנויים` post-apply.

### Verdict vs the ≥70% gate (ADR-0005 / ADR-0008)

- **Raw does not clear the gate** (flash 50%, lite 46%) — but per §1 the gate has always been measured on the adjudicated score, because raw holds the model to labels that encode private context. This re-run reproduces that gap: #100 was 52% raw → 78% adjudicated; v2 is 50% raw → **72% owner-adjudicated**.
- **`gemini-flash-latest` clears the gate at 72% — GO reaffirmed.** The descriptions made the model's answers _more_ v2-aligned; the residual genuine-error rate is ~8%. The taxonomy-v2 prompt is a net improvement in model behaviour even though the raw number, measured against un-migrated historical labels, does not show it. Note the owner adjudicated more conservatively than #100's basis (11 rulings vs the 13-candidate ≈76% projection above), and the gate still clears with margin.
- **`gemini-flash-lite-latest`'s position is unchanged — stays out.** Its raw improved (38% → 46%) but its adjudicated score (62%) is still below the gate, it trails flash on both raw and genuine-error count, and it makes exactly the restaurant/grocery-confusion errors that disqualified the cheap tier in #100. The cheap tier did not improve enough to reconsider; flash remains the GO model at negligible cost.
- Separately from the model decision, the stale-under-v2 labels the adjudication confirmed (barbershop → `בריאות וטיפוח`, cloud storage → `מנויים`) are historical manual labels the migration left untouched and are candidates for a one-time relabel.

Cost: the two-provider sweep (flash + flash-lite, 50 items × 3 batches each, one transient flash retry) consumed a negligible slice of the #99 credit — well under ₪0.1 total. Pro was not run (reserved).
