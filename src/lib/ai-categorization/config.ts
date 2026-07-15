import { getEnv } from "@/lib/env";
import type { CategorizationProvider } from "./provider";
import { createGeminiProvider, GEMINI_DEFAULT_MODEL } from "./gemini";
import { createOllamaProvider, OLLAMA_DEFAULT_ENDPOINT, OLLAMA_DEFAULT_MODEL } from "./ollama";

export type AiProviderKind = "gemini" | "ollama" | "off";

/**
 * The provider decision inputs, extracted from the env. Deliberately carries a
 * `hasGeminiKey` *flag* rather than the key itself — the secret never enters
 * this pure resolution path or any returned value, so a resolution result can be
 * logged without leaking (zero-leak policy).
 */
export interface AiCategorizationConfig {
  readonly provider?: AiProviderKind;
  readonly hasGeminiKey: boolean;
  readonly ollamaEndpoint?: string;
  readonly ollamaModel?: string;
}

export type ProviderResolution =
  | { readonly kind: "off"; readonly reason: "unset" | "explicit" | "missing_gemini_key" }
  | { readonly kind: "gemini"; readonly model: string }
  | { readonly kind: "ollama"; readonly endpoint: string; readonly model: string };

/**
 * Pure resolution of "which provider, if any" for the pipeline (#148). A fresh
 * install (nothing set) resolves to `off`, so it makes zero external calls;
 * `gemini` selected without a key also resolves to `off` (`missing_gemini_key`)
 * rather than failing at call time. No I/O, no env access — the caller supplies
 * the config, so this is fully testable without touching `process.env`.
 */
export function resolveCategorizationProvider(config: AiCategorizationConfig): ProviderResolution {
  const provider = config.provider ?? "off";
  switch (provider) {
    case "off":
      return { kind: "off", reason: config.provider === undefined ? "unset" : "explicit" };
    case "gemini":
      return config.hasGeminiKey
        ? { kind: "gemini", model: GEMINI_DEFAULT_MODEL }
        : { kind: "off", reason: "missing_gemini_key" };
    case "ollama":
      return {
        kind: "ollama",
        endpoint: config.ollamaEndpoint?.trim() || OLLAMA_DEFAULT_ENDPOINT,
        model: config.ollamaModel?.trim() || OLLAMA_DEFAULT_MODEL,
      };
  }
}

/**
 * Constructs the configured provider instance from the environment, or `null`
 * when AI categorization is off. Thin glue over the pure resolver: it reads the
 * env, passes only a key-presence flag into resolution, and injects the actual
 * `GEMINI_API_KEY` straight into the adapter — the key is never returned or
 * logged. Untested by design (it is the network-adapter wiring; the map rule
 * keeps the fetch glue out of the unit suite).
 */
export function createConfiguredProvider(): CategorizationProvider | null {
  const env = getEnv();
  const resolution = resolveCategorizationProvider({
    provider: env.AI_PROVIDER,
    hasGeminiKey: Boolean(env.GEMINI_API_KEY),
    ollamaEndpoint: env.OLLAMA_ENDPOINT,
    ollamaModel: env.OLLAMA_MODEL,
  });

  switch (resolution.kind) {
    case "off":
      return null;
    case "gemini":
      return createGeminiProvider({
        apiKey: env.GEMINI_API_KEY as string,
        model: resolution.model,
      });
    case "ollama":
      return createOllamaProvider({ endpoint: resolution.endpoint, model: resolution.model });
  }
}
