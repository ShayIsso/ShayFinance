import type { RedactedString } from "@/lib/redaction";
import type { CategorizationProvider, GenerationOptions } from "./provider";
import type { PacingPolicy, PacingOutcome } from "./pacing";
import { planPacing } from "./pacing";
import { ProviderError, DEFAULT_PACING, httpStatusClass, isRetryableStatus } from "./provider-http";

/**
 * The benchmark GO model (docs/ai-categorization-benchmark-phase3.md §4):
 * `gemini-flash-latest` cleared the 70% gate at negligible cost.
 * `gemini-flash-lite` is precluded (failed the gate twice) and `gemini-pro`
 * stays reserved, so the model is fixed here rather than env-selectable — a
 * config knob could point production at a precluded tier.
 */
export const GEMINI_DEFAULT_MODEL = "gemini-flash-latest";

/** Google Generative Language REST base. The model + method are appended per call. */
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiRequestBody {
  readonly contents: readonly { readonly parts: readonly { readonly text: string }[] }[];
  readonly generationConfig: {
    readonly temperature: number;
    readonly responseMimeType?: string;
  };
}

/**
 * Shapes one `generateContent` request body from a redacted prompt. Mirrors the
 * benchmark harness (§1): `temperature: 0` default, and JSON mode expressed as
 * `responseMimeType: application/json`. Pure — no network, no key.
 */
export function buildGeminiRequestBody(
  prompt: RedactedString,
  options: GenerationOptions,
): GeminiRequestBody {
  return {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0,
      ...(options.json ? { responseMimeType: "application/json" } : {}),
    },
  };
}

/**
 * Builds the request URL. The API key is deliberately absent — it travels in the
 * `x-goog-api-key` header, never as a `?key=` query parameter, so it cannot land
 * in a URL that some layer might log (zero-leak policy).
 */
export function geminiGenerateUrl(model: string, baseUrl: string = GEMINI_BASE_URL): string {
  return `${baseUrl.replace(/\/$/, "")}/models/${model}:generateContent`;
}

/**
 * Response-envelope unwrapping (pure): pulls the model text out of the
 * `candidates[].content.parts[].text` shape and concatenates the parts. A
 * missing candidate, a safety block, or an empty text set is a structured
 * `bad_response` — the raw payload is never surfaced in the error.
 */
export function unwrapGeminiText(payload: unknown): string {
  const root = payload as {
    candidates?: { content?: { parts?: { text?: unknown }[] } }[];
  };
  const parts = root?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new ProviderError({ provider: "gemini", kind: "bad_response", retryable: false });
  }
  const text = parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
  if (text.length === 0) {
    throw new ProviderError({ provider: "gemini", kind: "bad_response", retryable: false });
  }
  return text;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Models sanctioned by the ADR-0005/ADR-0008 benchmark gate: flash-latest is
 * the GO model, pro stays reserved. flash-lite failed the gate twice and is
 * structurally precluded — not just absent from the env path.
 */
export type GeminiModel = "gemini-flash-latest" | "gemini-pro";

export interface GeminiProviderConfig {
  readonly apiKey: string;
  readonly model?: GeminiModel;
  readonly baseUrl?: string;
  readonly pacing?: PacingPolicy;
}

/**
 * The Gemini adapter (ADR-0008 §5). `generate` accepts only `RedactedString`, so
 * unredacted text cannot reach the API. The thin `fetch` glue follows the pure
 * pacing decisions: transient failures (429 / 5xx / network) retry with capped
 * backoff until the policy gives up; permanent failures throw a body-free
 * `ProviderError`. The key, prompt, and response body are never logged.
 */
export function createGeminiProvider(config: GeminiProviderConfig): CategorizationProvider {
  const model = config.model ?? GEMINI_DEFAULT_MODEL;
  const url = geminiGenerateUrl(model, config.baseUrl);
  const policy = config.pacing ?? DEFAULT_PACING;

  return {
    modelId: model,
    async generate(prompt: RedactedString, options: GenerationOptions): Promise<string> {
      const body = JSON.stringify(buildGeminiRequestBody(prompt, options));

      for (let attempt = 1; ; attempt++) {
        let outcome: PacingOutcome;
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": config.apiKey,
            },
            body,
          });
          if (res.ok) {
            const json = await res.json().catch(() => {
              throw new ProviderError({
                provider: "gemini",
                kind: "bad_response",
                retryable: false,
              });
            });
            return unwrapGeminiText(json);
          }
          if (!isRetryableStatus(res.status)) {
            throw new ProviderError({
              provider: "gemini",
              kind: "http_error",
              statusClass: httpStatusClass(res.status),
              retryable: false,
            });
          }
          outcome = res.status === 429 ? "rate_limited" : "error";
        } catch (err) {
          if (err instanceof ProviderError && !err.retryable) throw err;
          outcome = "error";
        }

        const decision = planPacing(policy, { attempt, outcome });
        if (decision.action === "give_up") {
          throw new ProviderError({
            provider: "gemini",
            kind: "retries_exhausted",
            retryable: false,
          });
        }
        await sleep(decision.delayMs);
      }
    },
  };
}
