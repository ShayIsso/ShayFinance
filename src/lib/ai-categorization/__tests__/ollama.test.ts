import { describe, it, expect } from "vitest";
import { redactText } from "@/lib/redaction";
import { ProviderError } from "../provider-http";
import {
  buildOllamaRequestBody,
  ollamaGenerateUrl,
  parseOllamaChunk,
  accumulateOllamaResponse,
  OLLAMA_NUM_CTX,
  OLLAMA_SEED,
} from "../ollama";

const prompt = redactText("שווארמה");

describe("buildOllamaRequestBody", () => {
  it("always streams", () => {
    expect(buildOllamaRequestBody(prompt, {}, "m").stream).toBe(true);
  });

  it("sets format json only when json is requested", () => {
    expect(buildOllamaRequestBody(prompt, { json: true }, "m").format).toBe("json");
    expect(buildOllamaRequestBody(prompt, {}, "m").format).toBeUndefined();
  });

  it("defaults temperature to 0 and uses the deterministic benchmark seed", () => {
    const body = buildOllamaRequestBody(prompt, {}, "m");
    expect(body.options.temperature).toBe(0);
    expect(body.options.seed).toBe(OLLAMA_SEED);
  });

  it("sets an EXPLICIT num_ctx above Ollama's truncating 4096 default", () => {
    const body = buildOllamaRequestBody(prompt, {}, "m");
    expect(body.options.num_ctx).toBe(OLLAMA_NUM_CTX);
    expect(body.options.num_ctx).toBeGreaterThan(4096);
  });

  it("honours a caller-supplied num_ctx", () => {
    expect(buildOllamaRequestBody(prompt, {}, "m", 16384).options.num_ctx).toBe(16384);
  });
});

describe("ollamaGenerateUrl", () => {
  it("targets /api/generate on the endpoint", () => {
    expect(ollamaGenerateUrl("http://localhost:11434")).toBe("http://localhost:11434/api/generate");
  });

  it("strips a trailing slash on the endpoint", () => {
    expect(ollamaGenerateUrl("http://host:11434/")).toBe("http://host:11434/api/generate");
  });
});

describe("parseOllamaChunk", () => {
  it("returns null for a blank line", () => {
    expect(parseOllamaChunk("   ")).toBeNull();
  });

  it("extracts response text and the done flag", () => {
    expect(parseOllamaChunk('{"response":"ab","done":false}')).toEqual({
      response: "ab",
      done: false,
    });
    expect(parseOllamaChunk('{"response":"","done":true}')).toEqual({ response: "", done: true });
  });

  it("throws a body-free bad_response on malformed JSON", () => {
    expect(() => parseOllamaChunk("{not json")).toThrow(ProviderError);
    try {
      parseOllamaChunk("{not json");
    } catch (err) {
      expect((err as ProviderError).kind).toBe("bad_response");
    }
  });

  it("throws on an Ollama error line without echoing its text", () => {
    let thrown: unknown;
    try {
      parseOllamaChunk('{"error":"model \\"x\\" not found, pull it first"}');
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).message).not.toContain("not found");
    expect((thrown as ProviderError).message).not.toContain("model");
  });
});

describe("accumulateOllamaResponse", () => {
  it("concatenates response fields across NDJSON lines", () => {
    const body = [
      '{"response":"{\\"ans","done":false}',
      '{"response":"wers\\":[]}","done":false}',
      '{"response":"","done":true}',
    ].join("\n");
    expect(accumulateOllamaResponse(body)).toBe('{"answers":[]}');
  });

  it("ignores blank lines between chunks", () => {
    const body = '{"response":"a","done":false}\n\n{"response":"b","done":true}\n';
    expect(accumulateOllamaResponse(body)).toBe("ab");
  });
});
