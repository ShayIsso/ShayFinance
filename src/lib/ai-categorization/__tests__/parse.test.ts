import { describe, it, expect } from "vitest";
import { parseCategorizationResponse, type ParseContext } from "../parse";

const ctx: ParseContext = {
  validCategoryNames: ["מזון וסופר", "מסעדות וקפה", "תחבורה"],
  batchSize: 3,
};

describe("parseCategorizationResponse", () => {
  it("parses a well-formed response into answers", () => {
    const raw = JSON.stringify({
      answers: [
        { index: 1, category: "מזון וסופר", confidence: 7 },
        { index: 2, category: "מסעדות וקפה", confidence: 4 },
      ],
    });
    const { answers, failures } = parseCategorizationResponse(raw, ctx);
    expect(failures).toEqual([]);
    expect(answers).toEqual([
      { index: 1, categoryName: "מזון וסופר", confidence: 7 },
      { index: 2, categoryName: "מסעדות וקפה", confidence: 4 },
    ]);
  });

  it("extracts the object from prose and code-fence wrapping", () => {
    const raw =
      "Here you go:\n```json\n" +
      JSON.stringify({ answers: [{ index: 1, category: "תחבורה", confidence: 6 }] }) +
      "\n```\nThanks!";
    const { answers, failures } = parseCategorizationResponse(raw, ctx);
    expect(failures).toEqual([]);
    expect(answers).toEqual([{ index: 1, categoryName: "תחבורה", confidence: 6 }]);
  });

  it("reports malformed JSON without throwing", () => {
    const { answers, failures } = parseCategorizationResponse("not json at all", ctx);
    expect(answers).toEqual([]);
    expect(failures).toEqual([{ index: null, reason: "malformed_json" }]);
  });

  it("reports a non-object / missing answers array", () => {
    const { failures } = parseCategorizationResponse(JSON.stringify({ foo: 1 }), ctx);
    expect(failures).toEqual([{ index: null, reason: "not_an_object" }]);
  });

  it("flags an unknown category name but keeps good answers", () => {
    const raw = JSON.stringify({
      answers: [
        { index: 1, category: "לא קיים", confidence: 6 },
        { index: 2, category: "תחבורה", confidence: 5 },
      ],
    });
    const { answers, failures } = parseCategorizationResponse(raw, ctx);
    expect(answers).toEqual([{ index: 2, categoryName: "תחבורה", confidence: 5 }]);
    expect(failures).toEqual([{ index: 1, reason: "unknown_category", detail: "לא קיים" }]);
  });

  it("flags out-of-range confidence (below 1, above 7, non-integer)", () => {
    const raw = JSON.stringify({
      answers: [
        { index: 1, category: "מזון וסופר", confidence: 0 },
        { index: 2, category: "תחבורה", confidence: 8 },
        { index: 3, category: "מסעדות וקפה", confidence: 4.5 },
      ],
    });
    const { answers, failures } = parseCategorizationResponse(raw, ctx);
    expect(answers).toEqual([]);
    expect(failures.map((f) => f.reason)).toEqual([
      "out_of_range_confidence",
      "out_of_range_confidence",
      "out_of_range_confidence",
    ]);
  });

  it("flags an index outside the batch range", () => {
    const raw = JSON.stringify({ answers: [{ index: 9, category: "תחבורה", confidence: 6 }] });
    const { answers, failures } = parseCategorizationResponse(raw, ctx);
    expect(answers).toEqual([]);
    expect(failures).toEqual([{ index: 9, reason: "unknown_index" }]);
  });

  it("flags a duplicate index, keeping the first", () => {
    const raw = JSON.stringify({
      answers: [
        { index: 1, category: "תחבורה", confidence: 6 },
        { index: 1, category: "מזון וסופר", confidence: 7 },
      ],
    });
    const { answers, failures } = parseCategorizationResponse(raw, ctx);
    expect(answers).toEqual([{ index: 1, categoryName: "תחבורה", confidence: 6 }]);
    expect(failures).toEqual([{ index: 1, reason: "duplicate_index" }]);
  });

  it("flags a structurally invalid answer entry", () => {
    const raw = JSON.stringify({ answers: [42, { index: 2, category: "תחבורה", confidence: 6 }] });
    const { answers, failures } = parseCategorizationResponse(raw, ctx);
    expect(answers).toEqual([{ index: 2, categoryName: "תחבורה", confidence: 6 }]);
    expect(failures).toEqual([{ index: null, reason: "invalid_answer" }]);
  });
});
