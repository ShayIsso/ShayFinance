import { redactText, type RedactedString } from "@/lib/redaction";

/**
 * A category rendered into the prompt's live category list. `description` is the
 * taxonomy-v2 Hebrew כולל/לא כולל guidance column (#133), nullable for
 * user-created categories — a null renders as a name-only bullet.
 */
export interface PromptCategory {
  readonly name: string;
  readonly description: string | null;
}

/**
 * A rule-matched description used as a positive few-shot example. Drawn from the
 * rule-matched pool, which is disjoint by construction from the descriptions AI
 * categorization serves (rule matching is deterministic on `description`), so
 * examples never leak the answer for a batch item.
 */
export interface FewShotExample {
  readonly categoryName: string;
  readonly description: RedactedString;
}

/**
 * A past AI assignment the user corrected (corrections log, `from_source='ai'`),
 * fed as an anti-example. The snapshot is pre-redacted at write time (ADR-0010
 * §5), so it is consumed as a RedactedString directly.
 */
export interface AntiExample {
  readonly description: RedactedString;
  readonly correctedToCategoryName: string;
}

export interface PromptInput {
  readonly categories: readonly PromptCategory[];
  readonly fewShot: readonly FewShotExample[];
  readonly antiExamples: readonly AntiExample[];
  /** Descriptions to categorize, already redacted at the boundary. */
  readonly batch: readonly RedactedString[];
}

export const BATCH_SIZE = 20;

/**
 * The anchored 1–7 confidence rubric (ADR-0008 §5, CONTEXT.md "anchored
 * confidence"). Each level carries a behavioural anchor so the score is a
 * calibrated judgement, not a free-floating number. This is NOT reconciliation's
 * 0–1 float — the two confidence scales are never interchanged.
 */
export const CONFIDENCE_RUBRIC: readonly string[] = Object.freeze([
  "7 — Certain: the merchant is unmistakable and maps to exactly one category.",
  "6 — High: a strong, clear signal with only trivial ambiguity.",
  "5 — Probable: leans clearly to one category, with a plausible alternative.",
  "4 — Even: two categories are about equally defensible.",
  "3 — Weak: a low-conviction guess with only a slight lean.",
  "2 — Very weak: barely any categorizable signal in the description.",
  "1 — None: the description carries no signal a category can be drawn from.",
]);

/**
 * Splits items into deterministic fixed-size batches, preserving input order.
 * Numbering downstream is 1-based within each batch and depends only on this
 * order, so an identical input always yields an identical prompt.
 */
export function chunkIntoBatches<T>(items: readonly T[], size: number = BATCH_SIZE): T[][] {
  if (size < 1) throw new RangeError("batch size must be >= 1");
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function renderCategoryBullet(category: PromptCategory): string {
  return category.description
    ? `- ${category.name} — ${category.description}`
    : `- ${category.name}`;
}

/**
 * Assembles one batch prompt in the benchmark harness shape
 * (docs/ai-categorization-benchmark-phase3.md §6–§7): live category list (one
 * bullet per category), few-shot examples, correction anti-examples, the
 * anchored confidence rubric, and the numbered batch, with a JSON-object output
 * instruction. Amounts and dates are never included (ADR-0008 §2).
 *
 * The whole assembled text is passed through `redactText` before it is returned
 * — the mint of `RedactedString` IS the egress guarantee: every character that
 * reaches a provider has crossed the redaction boundary. Descriptions arrive
 * already redacted; the final pass is idempotent on them and leaves the public
 * category guidance untouched.
 */
export function assemblePrompt(input: PromptInput): RedactedString {
  const categoryList = input.categories.map(renderCategoryBullet).join("\n");

  const fewShotBlock =
    input.fewShot.length > 0
      ? input.fewShot.map((ex) => `- "${ex.description}" → ${ex.categoryName}`).join("\n")
      : "(none)";

  const antiBlock =
    input.antiExamples.length > 0
      ? input.antiExamples
          .map((ex) => `- "${ex.description}" is NOT ${ex.correctedToCategoryName}`)
          .join("\n")
      : "(none)";

  const numbered = input.batch.map((desc, i) => `${i + 1}. ${desc}`).join("\n");

  const text = [
    "You categorize Israeli bank transaction descriptions into exactly one of the categories below.",
    "",
    "Categories (name — guidance on what it does and does not include):",
    categoryList,
    "",
    "Examples of correct categorizations:",
    fewShotBlock,
    "",
    "Past mistakes to avoid (these were corrected by the user):",
    antiBlock,
    "",
    "Confidence is an integer on this anchored 1–7 scale:",
    CONFIDENCE_RUBRIC.join("\n"),
    "",
    "Categorize each numbered description below:",
    numbered,
    "",
    'Respond with a single JSON object of the form {"answers": [{"index": <number>, "category": "<exact category name>", "confidence": <1-7>}]}.',
    "Use the exact category names given above. Include every numbered item exactly once. Do not include amounts, dates, or any other text.",
  ].join("\n");

  return redactText(text);
}
