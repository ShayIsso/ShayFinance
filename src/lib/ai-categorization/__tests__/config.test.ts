import { describe, it, expect } from "vitest";
import { resolveCategorizationProvider } from "../config";
import { GEMINI_DEFAULT_MODEL } from "../gemini";
import { OLLAMA_DEFAULT_ENDPOINT, OLLAMA_DEFAULT_MODEL } from "../ollama";

describe("resolveCategorizationProvider", () => {
  it("resolves to off when nothing is set (fresh install makes zero external calls)", () => {
    expect(resolveCategorizationProvider({ hasGeminiKey: false })).toEqual({
      kind: "off",
      reason: "unset",
    });
  });

  it("resolves to off when explicitly disabled", () => {
    expect(resolveCategorizationProvider({ provider: "off", hasGeminiKey: true })).toEqual({
      kind: "off",
      reason: "explicit",
    });
  });

  it("resolves gemini to off when the key is missing", () => {
    expect(resolveCategorizationProvider({ provider: "gemini", hasGeminiKey: false })).toEqual({
      kind: "off",
      reason: "missing_gemini_key",
    });
  });

  it("resolves gemini to the fixed GO model when keyed", () => {
    expect(resolveCategorizationProvider({ provider: "gemini", hasGeminiKey: true })).toEqual({
      kind: "gemini",
      model: GEMINI_DEFAULT_MODEL,
    });
  });

  it("resolves ollama with sensible defaults when endpoint/model are unset", () => {
    expect(resolveCategorizationProvider({ provider: "ollama", hasGeminiKey: false })).toEqual({
      kind: "ollama",
      endpoint: OLLAMA_DEFAULT_ENDPOINT,
      model: OLLAMA_DEFAULT_MODEL,
    });
  });

  it("resolves ollama with a caller-supplied endpoint and model", () => {
    expect(
      resolveCategorizationProvider({
        provider: "ollama",
        hasGeminiKey: false,
        ollamaEndpoint: "http://gpu:11434",
        ollamaModel: "gemma3:12b",
      }),
    ).toEqual({ kind: "ollama", endpoint: "http://gpu:11434", model: "gemma3:12b" });
  });

  it("falls back to defaults when ollama endpoint/model are blank", () => {
    expect(
      resolveCategorizationProvider({
        provider: "ollama",
        hasGeminiKey: false,
        ollamaEndpoint: "   ",
        ollamaModel: "   ",
      }),
    ).toEqual({ kind: "ollama", endpoint: OLLAMA_DEFAULT_ENDPOINT, model: OLLAMA_DEFAULT_MODEL });
  });

  it("never selects ollama for a keyless gemini config (independent knobs)", () => {
    const resolution = resolveCategorizationProvider({
      provider: "gemini",
      hasGeminiKey: false,
      ollamaEndpoint: "http://gpu:11434",
    });
    expect(resolution.kind).toBe("off");
  });
});
