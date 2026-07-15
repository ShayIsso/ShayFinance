import type { RedactedString } from "@/lib/redaction";

/**
 * Generation knobs a provider adapter needs. Deliberately provider-agnostic:
 * the Gemini and Ollama adapters (ticket #147) translate these into their own
 * request shapes. `temperature: 0` and JSON-mode are the benchmark defaults
 * (docs/ai-categorization-benchmark-phase3.md §1), but stay caller-controlled.
 */
export interface GenerationOptions {
  readonly temperature?: number;
  /** Request structured JSON output (Gemini responseMimeType / Ollama format). */
  readonly json?: boolean;
}

/**
 * The egress seam (ADR-0008 §4–5). Every model call crosses here.
 *
 * `generate` accepts ONLY `RedactedString` — a plain `string` does not
 * type-check, so unredacted text structurally cannot reach a provider (the
 * redaction boundary is enforced at compile time, not by review). The external
 * Gemini adapter and the local Ollama adapter both implement this one
 * interface; switching providers changes where inference runs, never what data
 * may leave the host. Returns raw model output for the pure parser — no
 * provider owns response semantics.
 */
export interface CategorizationProvider {
  /** Model identifier stamped onto suggestion rows (e.g. "gemini-flash-latest"). */
  readonly modelId: string;
  generate(prompt: RedactedString, options: GenerationOptions): Promise<string>;
}
