import { describe, it, expect } from "vitest";
import { redactText, type RedactedString } from "@/lib/redaction";
import {
  assemblePrompt,
  chunkIntoBatches,
  CONFIDENCE_RUBRIC,
  BATCH_SIZE,
  type PromptInput,
} from "../prompt";

// Tests build RedactedString payloads only through redactText, mirroring how the
// run function feeds the prompt at the boundary.
function r(s: string): RedactedString {
  return redactText(s);
}

function baseInput(overrides: Partial<PromptInput> = {}): PromptInput {
  return {
    categories: [
      { name: "מזון וסופר", description: "כולל סופרמרקטים. לא כולל מסעדות." },
      { name: "מסעדות וקפה", description: "כולל בתי קפה ומסעדות." },
      { name: "אחר", description: null },
    ],
    fewShot: [{ categoryName: "מזון וסופר", description: r("שופרסל") }],
    antiExamples: [{ description: r("זיכוי זמני"), correctedToCategoryName: "הכנסה אחרת" }],
    batch: [r("שווארמה הזהב"), r("קפה ביט")],
    ...overrides,
  };
}

describe("chunkIntoBatches", () => {
  it("defaults to batches of 20", () => {
    expect(BATCH_SIZE).toBe(20);
    const items = Array.from({ length: 45 }, (_, i) => i);
    const batches = chunkIntoBatches(items);
    expect(batches.map((b) => b.length)).toEqual([20, 20, 5]);
  });

  it("preserves order deterministically", () => {
    const items = ["a", "b", "c", "d", "e"];
    expect(chunkIntoBatches(items, 2)).toEqual([["a", "b"], ["c", "d"], ["e"]]);
  });

  it("returns no batches for an empty input", () => {
    expect(chunkIntoBatches([])).toEqual([]);
  });

  it("rejects a non-positive batch size", () => {
    expect(() => chunkIntoBatches([1], 0)).toThrow(RangeError);
  });
});

describe("assemblePrompt", () => {
  it("renders one bullet per category, name — Hebrew description", () => {
    const prompt = assemblePrompt(baseInput());
    expect(prompt).toContain("- מזון וסופר — כולל סופרמרקטים. לא כולל מסעדות.");
    expect(prompt).toContain("- מסעדות וקפה — כולל בתי קפה ומסעדות.");
  });

  it("renders a name-only bullet when the description is null", () => {
    const prompt = assemblePrompt(baseInput());
    expect(prompt).toContain("- אחר\n");
    expect(prompt).not.toContain("- אחר —");
  });

  it("numbers the batch 1-based in input order", () => {
    const prompt = assemblePrompt(baseInput());
    expect(prompt).toContain("1. שווארמה הזהב");
    expect(prompt).toContain("2. קפה ביט");
  });

  it("is deterministic — identical input yields identical output", () => {
    expect(assemblePrompt(baseInput())).toBe(assemblePrompt(baseInput()));
  });

  it("embeds the full anchored 1–7 confidence rubric", () => {
    const prompt = assemblePrompt(baseInput());
    for (const line of CONFIDENCE_RUBRIC) {
      expect(prompt).toContain(line);
    }
    expect(CONFIDENCE_RUBRIC).toHaveLength(7);
  });

  it("includes few-shot examples and correction anti-examples", () => {
    const prompt = assemblePrompt(baseInput());
    expect(prompt).toContain('"שופרסל" → מזון וסופר');
    expect(prompt).toContain('"זיכוי זמני" is NOT הכנסה אחרת');
  });

  it("instructs JSON-object output", () => {
    const prompt = assemblePrompt(baseInput());
    expect(prompt).toContain('{"answers"');
  });

  it("never contains an unredacted 5+ digit run from a description", () => {
    const prompt = assemblePrompt(baseInput({ batch: [r("חשבון 123456789 שופרסל")] }));
    expect(prompt).not.toContain("123456789");
    expect(prompt).toContain("[REDACTED_DIGITS]");
  });

  it("renders empty few-shot / anti-example blocks without throwing", () => {
    const prompt = assemblePrompt(baseInput({ fewShot: [], antiExamples: [] }));
    expect(prompt).toContain("(none)");
  });
});
