# AI Categorization Spike — Hebrew Transaction Benchmark

**Status:** Phase B complete — NO-GO  
**Branch:** `feature/ai-categorization-spike`  
**Issue:** Closes #42  
**Go threshold:** ≥70% overall accuracy

---

## 1. Methodology

### What we measured

Accuracy of local Ollama models at categorizing Hebrew bank transaction descriptions into the app's 20 default categories (19 original + `תחבורה ציבורית` added during the spike). Accuracy is defined as: `correct_predictions / 50`.

No amounts, dates, or account numbers are used — descriptions only. This is both a privacy requirement and a realistic test of what the production system would receive (the `ai-categorization` module will receive stripped descriptions).

### Models tested

| Model              | Parameters | Size   |
| ------------------ | ---------- | ------ |
| `qwen2.5-coder:7b` | 7B         | 4.7 GB |
| `llama3.1:8b`      | 8B         | 4.9 GB |

Both run locally via Ollama on `localhost:11434`. No network egress. No third-party APIs.

### Category set

The app has 20 categories across 4 types after the spike (`תחבורה ציבורית` was added to the DB by Shay mid-spike based on uncovered transactions):

| Category         | Type       |
| ---------------- | ---------- |
| משכורת           | income     |
| הכנסה אחרת       | income     |
| מזון וסופר       | expense    |
| מסעדות וקפה      | expense    |
| רכב ודלק         | expense    |
| תחבורה ציבורית   | expense    |
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

### Category coverage gap

7 categories have zero representation in the 50-item test fixture because the rule engine already handles them reliably — they do not appear in the uncategorized pool (`category_id IS NULL`):

**ביטוח, חינוך, חיסכון, השקעות, מנויים, משכורת, הכנסה אחרת**

This gap reflects production reality: AI categorization will mainly operate on expense categories, which are well-represented. Results for these 7 categories cannot be inferred from this benchmark.

### Prompt design

Each model receives a structured prompt containing:

1. **Category list** — all 20 categories with type and a short English hint
2. **Few-shot examples** — 3–9 real descriptions from the DB per category (from `WHERE category_id IS NOT NULL`; descriptions only, no PII). `תחבורה ציבורית` examples were drawn from the fixture since no categorized rows existed yet.
3. **Batch of descriptions to classify** — 20 items at a time, numbered
4. **Output format instruction** — JSON array of category names, one per input, in order

Inference settings: `temperature: 0`, `seed: 42` for determinism. Batch size: 20.

### Train/test split and contamination

Both the few-shot (train) examples and the test fixture are sourced from the same dev DB — but they are **disjoint by design**:

- **Few-shot (train):** `WHERE category_id IS NOT NULL` — transactions the rule engine or user already categorized.
- **Test fixture:** `WHERE category_id IS NULL` — transactions the rule engine could not match, i.e., the exact population that AI categorization will see in production.

This split is methodologically clean. The same merchant name can appear in both sets (multiple visits to the same store), but that reflects real production behavior: a new uncategorized transaction from a known merchant is exactly the use case AI categorization is intended to solve.

Items whose description appears verbatim in the few-shot examples are flagged `few_shot_overlap: true` in the local fixture file (gitignored to keep real transaction descriptions out of the public repo). The fixture intentionally retains these (14 of 50 items) because production realism requires testing on the full uncategorized pool, not a sanitized subset.

### Evaluation

Each description is scored as correct if the model's prediction exactly matches the ground-truth category name (string equality on the Hebrew name). No partial credit. Per-category accuracy is computed for all categories with ≥1 test sample.

### Worker first-pass baseline

Before running either model, the worker pre-labeled all 50 items using the same category list and few-shot examples (human reasoning, not Ollama). Shay's corrections after review:

| Correction type                                            | Count |
| ---------------------------------------------------------- | ----- |
| New category (תחבורה ציבורית — didn't exist at label time) | 3     |
| Semantic correction (wrong category)                       | 5     |
| Total wrong                                                | 8     |

**Worker first-pass accuracy: 42/50 = 84%**

This is the human upper bound given the same prompt context. Model results should be read against this reference.

---

## 2. Results

### Overall accuracy

| Model                   | Correct | Total | Accuracy  | Verdict |
| ----------------------- | ------- | ----- | --------- | ------- |
| `qwen2.5-coder:7b`      | 13      | 50    | **26.0%** | NO-GO   |
| `llama3.1:8b`           | 25      | 50    | **50.0%** | NO-GO   |
| Worker (human baseline) | 42      | 50    | **84.0%** | —       |

**Both models fall below the 70% threshold.** The best result (llama3.1:8b at 50%) is 20 percentage points below the minimum bar.

### Overlap vs non-overlap breakdown

| Model              | Overlap items (n=14) | Non-overlap items (n=36) |
| ------------------ | -------------------- | ------------------------ |
| `qwen2.5-coder:7b` | 28.6%                | 25.0%                    |
| `llama3.1:8b`      | 57.1%                | 47.2%                    |

For llama3.1:8b, the ~10% gap between overlap and non-overlap shows some benefit from having seen the exact string in the few-shot, but the model also generalizes reasonably to novel descriptions. The difference is not dramatic enough to consider removing overlap items — both subsets are well below 70%.

For qwen2.5-coder:7b, there is essentially no difference — the model mostly outputs "אחר" regardless of input.

---

## 3. Per-Category Accuracy

| Category         | Type     | n   | qwen2.5-coder:7b | llama3.1:8b    |
| ---------------- | -------- | --- | ---------------- | -------------- |
| מזון וסופר       | expense  | 9   | 11% (1/9)        | **78%** (7/9)  |
| אחר              | expense  | 7   | **100%** (7/7)   | 71% (5/7)      |
| חשבונות ושירותים | expense  | 6   | 0% (0/6)         | 17% (1/6)      |
| מסעדות וקפה      | expense  | 5   | 0% (0/5)         | 0% (0/5)       |
| בילויים ופנאי    | expense  | 5   | 0% (0/5)         | 20% (1/5)      |
| רכב ודלק         | expense  | 3   | 0% (0/3)         | 0% (0/3)       |
| תחבורה ציבורית   | expense  | 3   | 33% (1/3)        | **100%** (3/3) |
| בריאות           | expense  | 3   | 0% (0/3)         | 33% (1/3)      |
| תשלום כ. אשראי   | ignore   | 3   | 33% (1/3)        | 67% (2/3)      |
| דיור ושכירות     | expense  | 2   | 50% (1/2)        | **100%** (2/2) |
| קניות וביגוד     | expense  | 2   | 0% (0/2)         | 50% (1/2)      |
| העברה פנימית     | transfer | 1   | **100%** (1/1)   | **100%** (1/1) |
| מתנות ואירועים   | expense  | 1   | **100%** (1/1)   | **100%** (1/1) |

**Notable patterns:**

- `llama3.1:8b` has 100% on `תחבורה ציבורית`, `דיור ושכירות`, `העברה פנימית`, `מתנות ואירועים` — structural/pattern categories it handles well.
- Both models score 0% on `מסעדות וקפה` and `רכב ודלק` — high-value everyday categories that AI categorization would need to get right.
- `חשבונות ושירותים` (17% for the best model) is the single most damaging weakness by volume: it has 6 test items and represents common standing-order merchants.
- `qwen2.5-coder:7b` scores 100% on `אחר` exclusively because it predicts "אחר" for almost every input in batches 1–2, then shifts behaviour in batch 3. This is a prompt-following failure mode, not semantic understanding.

---

## 4. Representative Failures

> **Anonymization note:** Specific merchant names, neighborhoods, branch numbers, and street names below have been replaced with bracketed placeholders (`[חברת סלולר]`, `[רשת קולנוע]`, `[שכונה]`, etc.) to keep the public report free of personal-routine signals. The Hebrew word(s) that motivated each model failure (`מאפיה`, `שווארמה`, `אצטדיון`, `הו"ק`, etc.) are preserved so the analysis remains valid.

### qwen2.5-coder:7b — Collapse-to-אחר failure mode

The model predicted "אחר" for 33 of 50 items. This is not a semantic error but a prompt-following failure: the model apparently fails to parse the Hebrew category list or ignores the JSON format instruction, defaulting to the fallback category. The model is a code-optimized variant; its generation behaviour on right-to-left Hebrew prompts with mixed Latin/Hebrew content is unreliable.

| Description (anonymized)    | Expected         | Predicted    | Analysis                                                           |
| --------------------------- | ---------------- | ------------ | ------------------------------------------------------------------ |
| `מינימרקט [מ]`              | מזון וסופר       | אחר          | In few-shot; model ignores example                                 |
| `[חברת מים] בע"מ הו"ק`      | חשבונות ושירותים | אחר          | In few-shot; model ignores example                                 |
| `שרותי בריאות [קופ"ח] הו"ק` | בריאות           | אחר          | In few-shot; model ignores example                                 |
| `עמלת סמס חבילה בסיסית`     | תשלום כ. אשראי   | אחר          | In few-shot; model ignores example                                 |
| `פרשמרקט [שכונה]`           | מזון וסופר       | קניות וביגוד | Batch 3 outlier — neighborhood word triggered shopping association |

### llama3.1:8b — Four systematic failure patterns

**1. Restaurants categorized as food markets (מסעדות וקפה → מזון וסופר)**

| Description (anonymized) | Expected    | Predicted  |
| ------------------------ | ----------- | ---------- |
| `[שם] גריל בר`           | מסעדות וקפה | מזון וסופר |
| `המאפיה [רחוב]`          | מסעדות וקפה | מזון וסופר |
| `שווארמה [עסק] [עיר]`    | מסעדות וקפה | מזון וסופר |
| `[רשת דלק] [עיר]`        | רכב ודלק    | מזון וסופר |

_Root cause:_ The model associates Hebrew food-related words with supermarkets. "מאפיה" (bakery), "שווארמה", "גריל" are all food-adjacent — the model maps them to מזון וסופר rather than מסעדות וקפה. Without a clear chain-brand signal (like "WOLT" or "קפה 5") the restaurant/cafe distinction fails.

**2. Utilities/services not recognized (חשבונות ושירותים → various)**

| Description (anonymized) | Expected         | Predicted      |
| ------------------------ | ---------------- | -------------- |
| `[חברת סלולר] הו"ק`      | חשבונות ושירותים | מזון וסופר     |
| `[חברת גז] בע"מ`         | חשבונות ושירותים | אחר            |
| `[שירות טלוויזיה]`       | חשבונות ושירותים | אחר            |
| `[חברת תקשורת] בע"מ (ה`  | חשבונות ושירותים | תחבורה ציבורית |

_Root cause:_ Israeli telecom/utility/satellite-TV brand names are opaque to a general-purpose model — they require Israel-specific knowledge that the 7B–8B class doesn't carry. The `הו"ק` suffix (standing order, signals recurring utility billing) is also not understood.

**3. Parking lots not recognized as רכב ודלק**

| Description (anonymized)           | Expected | Predicted |
| ---------------------------------- | -------- | --------- |
| `[חברת חניונים]-חניון [מרכז] בע"מ` | רכב ודלק | אחר       |
| `חניון רכב [שם] בע"מ`              | רכב ודלק | אחר       |

_Root cause:_ "חניון" (parking lot) and "חניון רכב" (car park) should map to רכב ודלק but the model has no signal that parking belongs with fuel and car maintenance. The category hint ("Fuel, car maintenance, parking lots") was present but the model didn't apply it.

**4. Entertainment venues mapped inconsistently**

| Description (anonymized)    | Expected      | Predicted |
| --------------------------- | ------------- | --------- |
| `[קבוצה] אצטדיון`           | בילויים ופנאי | בריאות    |
| `[רשת קולנוע] [עיר]- מזנון` | בילויים ופנאי | אחר       |
| `[מסעדה]`                   | מסעדות וקפה   | אחר       |

_Root cause:_ "אצטדיון" (stadium) triggered a health association (a popular Israeli sports-team prefix is also a health-fund brand name). Cinema-chain names require Israel-specific knowledge. Restaurant names without chain recognition fall to "אחר".

---

## 5. Recommendation

**NO-GO. AI categorization is deferred to Phase 3.**

Neither model meets the 70% go threshold:

- `qwen2.5-coder:7b` at **26%** is unusable — a prompt-following failure causes it to output "אחר" for the vast majority of inputs regardless of content.
- `llama3.1:8b` at **50%** shows genuine semantic understanding in some areas but fails catastrophically on the most common everyday categories (restaurants, utilities, parking).

The worker human baseline of **84%** using the same prompt confirms the information is theoretically sufficient — the gap between 84% and 50% is a model capability problem, not a prompt design problem.

### Overlap vs non-overlap implication

The 57.1% vs 47.2% split for llama3.1:8b shows the model does benefit modestly from few-shot examples but isn't simply memorizing them. A model that only works on descriptions it has "seen" before would not be useful in production — the value of AI categorization is precisely on novel merchants.

### What carries the load in Phase 2

Retroactive rule application (Tier 2) is the correct replacement. When a user creates a category rule today, applying it retroactively to existing uncategorized transactions addresses the same workflow problem (reducing manual labeling burden) without model uncertainty.

### Phase 3 considerations before retesting

If AI categorization is revisited in Phase 3, the following changes would give better odds:

1. **Larger or newer models** — llama3.2, Mistral-7B, or a purpose-built multilingual model. The 7B–8B class has limited Hebrew cultural knowledge.
2. **Hebrew-specific embedding model** — AlephBERT or HeBERT for semantic similarity matching rather than generation.
3. **Structured output with `ollama` JSON mode** — `format: "json"` with a schema would eliminate the JSON parsing failure that destroyed qwen2.5-coder:7b's results.
4. **Chain-of-thought prompt** — asking the model to reason before answering improved accuracy in similar benchmarks.
5. **Confidence thresholding** — only surface AI suggestions above a confidence score, accepting lower recall in exchange for higher precision.

---

## 6. Test Fixture

The 50-item Hebrew test fixture and the spike's benchmark runner contained real (anonymized in this report) transaction descriptions from the dev DB. They are **gitignored** — only `scripts/spike/fixture.template.json` (a placeholder template) is committed to the public repo. Reproducing the benchmark requires re-creating the fixture locally from the live DB; the methodology above is sufficient to do so.

### Category coverage in the 50-item fixture

| Category         | n   |
| ---------------- | --- |
| מזון וסופר       | 9   |
| אחר              | 7   |
| חשבונות ושירותים | 6   |
| מסעדות וקפה      | 5   |
| בילויים ופנאי    | 5   |
| רכב ודלק         | 3   |
| תחבורה ציבורית   | 3   |
| בריאות           | 3   |
| תשלום כ. אשראי   | 3   |
| דיור ושכירות     | 2   |
| קניות וביגוד     | 2   |
| העברה פנימית     | 1   |
| מתנות ואירועים   | 1   |

### Categories not represented (rule engine handles reliably)

ביטוח, חינוך, חיסכון, השקעות, מנויים, משכורת, הכנסה אחרת

### Anonymization

Section 4 ("Representative Failures") substitutes specific merchant names, neighborhoods, branch numbers, and street names with bracketed placeholders (e.g. `[חברת סלולר]`, `[רשת קולנוע]`, `[שכונה]`) to keep linguistic patterns analyzable without exposing personal routine. The anonymization preserves the Hebrew word(s) that motivated each model failure (`מאפיה`, `שווארמה`, `אצטדיון`, `הו"ק`, etc.) so the analysis remains valid. One additional name `עאיישה` (ambiguous: both a given name and a restaurant brand) was already replaced with `[NAME]` in the original fixture during the spike.

### Few-shot overlap

14 of 50 fixture items (28%) had descriptions appearing verbatim in the benchmark prompt's few-shot examples. They are retained intentionally (see methodology). Tracked in the local fixture file via a `few_shot_overlap: true` flag.
