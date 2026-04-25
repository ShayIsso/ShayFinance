# AI Categorization Spike — Hebrew Transaction Benchmark

**Status:** Phase A.5 complete — awaiting Shay's label corrections on fixture-draft.json to run Phase B  
**Branch:** `feature/ai-categorization-spike`  
**Issue:** Closes #42  
**Go threshold:** ≥70% overall accuracy

---

## 1. Methodology

### What we measured

Accuracy of local Ollama models at categorizing Hebrew bank transaction descriptions into the app's 19 default categories. Accuracy is defined as: `correct_predictions / 50`.

No amounts, dates, or account numbers are used — descriptions only. This is both a privacy requirement and a realistic test of what the production system would receive (the `ai-categorization` module will receive stripped descriptions).

### Models tested

| Model              | Parameters | Size   |
| ------------------ | ---------- | ------ |
| `qwen2.5-coder:7b` | 7B         | 4.7 GB |
| `llama3.1:8b`      | 8B         | 4.9 GB |

Both run locally via Ollama on `localhost:11434`. No network egress. No third-party APIs.

### Category set

The app has 19 default categories across 4 types:

| Category         | Type       |
| ---------------- | ---------- |
| משכורת           | income     |
| הכנסה אחרת       | income     |
| מזון וסופר       | expense    |
| מסעדות וקפה      | expense    |
| רכב ודלק         | expense    |
| דיור ושכירות     | expense    |
| חשבונות ושירותים | expense    |
| בריאות           | expense    |
| בילויים ופנאי    | expense    |
| קניות וביגוד     | expense    |
| חינוך            | expense    |
| ביטוח            | expense    |
| מנויים           | expense    |
| מתנות ואירועים   | expense    |
| השקעות           | investment |
| חיסכון           | investment |
| העברה פנימית     | transfer   |
| תשלום כ. אשראי   | ignore     |
| אחר              | expense    |

### Prompt design

Each model receives a structured prompt containing:

1. **Category list** — all 19 categories with type and a short English hint
2. **Few-shot examples** — 3–7 real descriptions from the production DB per category (pulled from transactions with existing `category_id` assignments; descriptions only, no PII)
3. **Batch of descriptions to classify** — 20 items at a time, numbered
4. **Output format instruction** — JSON array of category names, one per input, in order

Inference settings: `temperature: 0`, `seed: 42` for determinism. Batch size: 20.

### Few-shot examples source

Examples were pulled from `transactions` joined to `categories` where `category_id IS NOT NULL`, read-only query against the dev DB. Only the `description` column was used. No amounts, dates, or account numbers were included.

Categories with no existing DB examples (ביטוח, חיסכון, רכב ודלק partially) received plausible illustrative examples to keep the prompt balanced.

### Train/test split and contamination

Both the few-shot (train) examples and the test fixture are sourced from the same dev DB — but they are **disjoint by design**:

- **Few-shot (train):** `WHERE category_id IS NOT NULL` — transactions the rule engine or user already categorized.
- **Test fixture:** `WHERE category_id IS NULL` — transactions the rule engine could not match, i.e., the exact population that AI categorization will see in production.

This split is methodologically clean. The same merchant name can appear in both sets (multiple visits to the same store), but that reflects real production behavior: a new uncategorized transaction arriving from a known merchant is exactly the use case AI categorization is intended to solve.

Note: Some descriptions in the fixture are exact string matches of few-shot examples. These are flagged with `"few_shot_overlap": true` in `fixture-draft.json`. Shay may choose to exclude them from the final 50 for a harder test, or keep them to measure whether models reliably follow their own examples (also useful). Both are valid benchmark choices.

### Test fixture

80 candidate transactions were queried (`SELECT ... WHERE category_id IS NULL ORDER BY RANDOM() LIMIT 80`) and pre-labeled by the worker as a first-pass draft. Shay reviews `scripts/spike/fixture-draft.json`, corrects any wrong labels, and saves the final 50 as `scripts/spike/fixture.json`.

Privacy: one description (`עאיישה`) was anonymized to `[NAME]` because the token is both a common Hebrew given name and a restaurant name — ambiguous under policy. Shay should decide whether to restore or keep the anonymized form. All other descriptions are merchant/business names.

Fixture file (final): `scripts/spike/fixture.json` (embedded below in section 6).

### Worker first-pass baseline

The worker's pre-labeling of the 80-item pool using the same category list and few-shot examples (reasoned from context, not Ollama) serves as a human-readable baseline. Once Shay's corrections are applied, the worker first-pass accuracy is:

**`correct_before_shay_corrections / 80`** — to be computed after Shay's review.

This provides a useful upper bound: if the worker (reading the prompt carefully) achieves X%, a model that matches X% is doing comparably well.

### Evaluation

Each description is scored as correct if the model's prediction exactly matches the ground-truth category name (string equality on the Hebrew name). No partial credit. Per-category accuracy is computed for categories with ≥2 test samples.

---

## 2. Results

> **STATUS: BLOCKED — waiting for Shay to correct `fixture-draft.json` labels and save as `fixture.json`**

To run the benchmark once fixture.json is ready:

```bash
npx tsx scripts/spike/benchmark.ts
```

### Overall accuracy

| Model              | Correct | Total | Accuracy | Verdict |
| ------------------ | ------- | ----- | -------- | ------- |
| `qwen2.5-coder:7b` | —       | 50    | —        | —       |
| `llama3.1:8b`      | —       | 50    | —        | —       |

---

## 3. Per-Category Accuracy

> Results will be populated after Phase B.

| Category         | Type       | qwen2.5-coder:7b | llama3.1:8b |
| ---------------- | ---------- | ---------------- | ----------- |
| משכורת           | income     | —                | —           |
| הכנסה אחרת       | income     | —                | —           |
| מזון וסופר       | expense    | —                | —           |
| מסעדות וקפה      | expense    | —                | —           |
| רכב ודלק         | expense    | —                | —           |
| דיור ושכירות     | expense    | —                | —           |
| חשבונות ושירותים | expense    | —                | —           |
| בריאות           | expense    | —                | —           |
| בילויים ופנאי    | expense    | —                | —           |
| קניות וביגוד     | expense    | —                | —           |
| חינוך            | expense    | —                | —           |
| ביטוח            | expense    | —                | —           |
| מנויים           | expense    | —                | —           |
| מתנות ואירועים   | expense    | —                | —           |
| השקעות           | investment | —                | —           |
| חיסכון           | investment | —                | —           |
| העברה פנימית     | transfer   | —                | —           |
| תשלום כ. אשראי   | ignore     | —                | —           |
| אחר              | expense    | —                | —           |

---

## 4. Representative Failures

> Results will be populated after Phase B.

---

## 5. Recommendation

> Will be filled in after Phase B results are in. Decision: **go** (≥70% with winning model) or **no-go** (<70% on both models — defer AI to Phase 3, rely on retroactive rules).

---

## 6. Test Fixture

**Draft (80 items, worker-labeled):** `scripts/spike/fixture-draft.json`  
**Final (50 items, Shay-corrected):** `scripts/spike/fixture.json` — to be produced by Shay from the draft.

### Category coverage in the 80-item draft

The uncategorized pool is naturally skewed toward expenses (the rule engine already handles income, savings, and investments well). Categories with zero representation in the draft:

- **ביטוח, חינוך, חיסכון, השקעות, מנויים, משכורת, הכנסה אחרת** — not present in the uncategorized pool.

This reflects real production: the rule engine reliably catches these. The AI will mainly operate on the expense categories, which are well-represented in the fixture.

### Anonymization applied

| Original | Replaced with | Reason                                                    |
| -------- | ------------- | --------------------------------------------------------- |
| `עאיישה` | `[NAME]`      | Ambiguous: both a common given name and a restaurant name |

### Draft field reference

Each item in `fixture-draft.json` includes:

- `id` — sequential integer (1–80)
- `source_id` — UUID from the `transactions` table (for DB lookup)
- `description` — Hebrew text, PII-free
- `ground_truth` — worker's first-pass category label
- `confidence` — `"high"` / `"medium"` / `"low"`
- `few_shot_overlap` — `true` if the exact string appears in the benchmark prompt's few-shot examples
- `notes` — reasoning and caveats

### Format for fixture.json

```json
[
  { "id": 1, "description": "מינימרקט [מ]", "ground_truth": "מזון וסופר" },
  ...
]
```

Extra fields (`source_id`, `notes`, etc.) are ignored by the benchmark script — Shay can strip or retain them.
