import type { RedactedString } from "@/lib/redaction";
import type { CategorizationProvider, GenerationOptions } from "./provider";
import type { PacingPolicy, PacingOutcome } from "./pacing";
import { planPacing } from "./pacing";
import { ProviderError, DEFAULT_PACING, httpStatusClass, isRetryableStatus } from "./provider-http";

/**
 * Zero-egress mode (ADR-0008 §5, CONTEXT.md "zero-egress mode"). The mode stays
 * selectable, but the benchmark (§4) records it as currently un-backed: no local
 * model in the runnable class cleared the 70% gate — `llama3.2:3b` returned zero
 * parseable answers and larger tiers are too slow on the dev machine. This
 * default is a valid tag to point the adapter at, not an endorsement.
 */
export const OLLAMA_DEFAULT_MODEL = "llama3.2:3b";
export const OLLAMA_DEFAULT_ENDPOINT = "http://localhost:11434";

/** Deterministic seed — matches the benchmark harness (§1) so runs reproduce. */
export const OLLAMA_SEED = 42;

/**
 * Explicit context window. Ollama's default `num_ctx` is 4096, which silently
 * truncates the *head* of this prompt (the category list + few-shot examples
 * come first) and was a confirmed benchmark defect (§4 trajectory audit). The
 * assembled batch prompt — full category list with כולל/לא כולל guidance,
 * few-shot + anti-examples, the rubric, and a 20-item batch — plus the JSON
 * answer set fits comfortably under 8192 tokens with headroom for Hebrew's
 * higher token-per-character ratio; this is the value the §1 harness ran and
 * validated for the identical prompt shape.
 */
export const OLLAMA_NUM_CTX = 8192;

export interface OllamaRequestBody {
  readonly model: string;
  readonly prompt: string;
  /** Always true — the response is read as a stream (see createOllamaProvider). */
  readonly stream: boolean;
  readonly format?: "json";
  readonly options: {
    readonly temperature: number;
    readonly seed: number;
    readonly num_ctx: number;
  };
}

/**
 * Shapes one `/api/generate` request body from a redacted prompt (pure). JSON
 * mode is Ollama's `format: "json"`; the deterministic seed and the explicit
 * `num_ctx` mirror the benchmark harness.
 */
export function buildOllamaRequestBody(
  prompt: RedactedString,
  options: GenerationOptions,
  model: string,
  numCtx: number = OLLAMA_NUM_CTX,
): OllamaRequestBody {
  return {
    model,
    prompt,
    stream: true,
    ...(options.json ? { format: "json" as const } : {}),
    options: {
      temperature: options.temperature ?? 0,
      seed: OLLAMA_SEED,
      num_ctx: numCtx,
    },
  };
}

export function ollamaGenerateUrl(baseUrl: string = OLLAMA_DEFAULT_ENDPOINT): string {
  return `${baseUrl.replace(/\/$/, "")}/api/generate`;
}

export interface OllamaChunk {
  readonly response: string;
  readonly done: boolean;
}

/**
 * Parses one NDJSON line of a streamed `/api/generate` response (pure). Blank
 * lines yield null; malformed JSON or an Ollama `{"error": ...}` line becomes a
 * structured `bad_response` — the error text (which may echo the request) is
 * never surfaced.
 */
export function parseOllamaChunk(line: string): OllamaChunk | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new ProviderError({ provider: "ollama", kind: "bad_response", retryable: false });
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ProviderError({ provider: "ollama", kind: "bad_response", retryable: false });
  }
  const obj = parsed as { response?: unknown; done?: unknown; error?: unknown };
  if (obj.error !== undefined) {
    throw new ProviderError({ provider: "ollama", kind: "bad_response", retryable: false });
  }
  return {
    response: typeof obj.response === "string" ? obj.response : "",
    done: obj.done === true,
  };
}

/**
 * Response-envelope unwrapping (pure): concatenates the `response` field of
 * every NDJSON line of a full streamed body into the model's text. This is the
 * semantic spec the streaming glue follows line-by-line.
 */
export function accumulateOllamaResponse(body: string): string {
  return body.split("\n").reduce((acc, line) => {
    const chunk = parseOllamaChunk(line);
    return chunk ? acc + chunk.response : acc;
  }, "");
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface OllamaProviderConfig {
  readonly model?: string;
  readonly endpoint?: string;
  readonly numCtx?: number;
  readonly pacing?: PacingPolicy;
}

/**
 * The Ollama adapter (ADR-0008 §5), same `CategorizationProvider` contract and
 * anchored-confidence output as Gemini — switching providers changes only where
 * inference runs. `generate` accepts only `RedactedString`. The response is read
 * as a *stream*: with `stream: true` Ollama sends headers immediately, so a long
 * local generation is not killed by Node `fetch`'s header timeout (the third
 * benchmark defect, §4). Transient failures follow the pure pacing decisions;
 * no prompt or response body is ever logged.
 */
export function createOllamaProvider(config: OllamaProviderConfig = {}): CategorizationProvider {
  const model = config.model ?? OLLAMA_DEFAULT_MODEL;
  const numCtx = config.numCtx ?? OLLAMA_NUM_CTX;
  const url = ollamaGenerateUrl(config.endpoint);
  const policy = config.pacing ?? DEFAULT_PACING;

  return {
    modelId: model,
    async generate(prompt: RedactedString, options: GenerationOptions): Promise<string> {
      const body = JSON.stringify(buildOllamaRequestBody(prompt, options, model, numCtx));

      for (let attempt = 1; ; attempt++) {
        let outcome: PacingOutcome;
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          });
          if (res.ok) {
            return await readOllamaStream(res.body);
          }
          if (!isRetryableStatus(res.status)) {
            throw new ProviderError({
              provider: "ollama",
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
            provider: "ollama",
            kind: "retries_exhausted",
            retryable: false,
          });
        }
        await sleep(decision.delayMs);
      }
    },
  };
}

/** Streaming read: consume the NDJSON body incrementally, unwrapping each complete line. */
async function readOllamaStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) {
    throw new ProviderError({ provider: "ollama", kind: "bad_response", retryable: false });
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const chunk = parseOllamaChunk(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      if (chunk) out += chunk.response;
    }
  }
  const tail = parseOllamaChunk(buffer);
  if (tail) out += tail.response;
  return out;
}
