/**
 * One accepted per-item categorization: a batch index (1-based), an exact
 * category name from the live list, and an anchored 1–7 confidence.
 */
export interface ParsedAnswer {
  readonly index: number;
  readonly categoryName: string;
  readonly confidence: number;
}

export type ParseFailureReason =
  | "malformed_json"
  | "not_an_object"
  | "invalid_answer"
  | "unknown_index"
  | "duplicate_index"
  | "unknown_category"
  | "out_of_range_confidence";

/** A structured, non-throwing report of one thing the parser could not accept. */
export interface ParseFailure {
  /** The batch index the failure concerns, or null when it is document-level. */
  readonly index: number | null;
  readonly reason: ParseFailureReason;
  readonly detail?: string;
}

export interface ParseResult {
  readonly answers: ParsedAnswer[];
  readonly failures: ParseFailure[];
}

export interface ParseContext {
  readonly validCategoryNames: Iterable<string>;
  /** Number of numbered items the batch prompt asked about (indices 1..batchSize). */
  readonly batchSize: number;
}

/**
 * Extracts the first balanced JSON object from arbitrary model text — tolerates
 * code fences, prose preambles, and trailing chatter around the object. Returns
 * the object substring or null. String-literal aware so a brace inside a value
 * does not unbalance the scan.
 */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/**
 * Parses a model response into per-item answers and structured failures. Never
 * throws across the module boundary (ADR-0008): malformed JSON, non-object
 * payloads, out-of-range confidence, unknown category names, and unknown or
 * duplicate indices each become a `ParseFailure`, so a single bad item never
 * discards a batch's good answers.
 */
export function parseCategorizationResponse(raw: string, ctx: ParseContext): ParseResult {
  const validNames = new Set(ctx.validCategoryNames);
  const answers: ParsedAnswer[] = [];
  const failures: ParseFailure[] = [];

  const jsonText = extractJsonObject(raw);
  if (jsonText === null) {
    return { answers, failures: [{ index: null, reason: "malformed_json" }] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { answers, failures: [{ index: null, reason: "malformed_json" }] };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { answers?: unknown }).answers)
  ) {
    return { answers, failures: [{ index: null, reason: "not_an_object" }] };
  }

  const seen = new Set<number>();
  for (const item of (parsed as { answers: unknown[] }).answers) {
    if (typeof item !== "object" || item === null) {
      failures.push({ index: null, reason: "invalid_answer" });
      continue;
    }
    const { index, category, confidence } = item as {
      index?: unknown;
      category?: unknown;
      confidence?: unknown;
    };

    if (!isInteger(index) || index < 1 || index > ctx.batchSize) {
      failures.push({
        index: isInteger(index) ? index : null,
        reason: "unknown_index",
      });
      continue;
    }
    if (seen.has(index)) {
      failures.push({ index, reason: "duplicate_index" });
      continue;
    }
    seen.add(index);

    if (typeof category !== "string" || !validNames.has(category)) {
      failures.push({
        index,
        reason: "unknown_category",
        detail: typeof category === "string" ? category : undefined,
      });
      continue;
    }
    if (!isInteger(confidence) || confidence < 1 || confidence > 7) {
      failures.push({ index, reason: "out_of_range_confidence" });
      continue;
    }

    answers.push({ index, categoryName: category, confidence });
  }

  return { answers, failures };
}
