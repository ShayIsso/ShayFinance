import { describe, it, expect } from "vitest";
import { redactText } from "@/lib/redaction";
import { ProviderError } from "../provider-http";
import {
  buildGeminiRequestBody,
  geminiGenerateUrl,
  unwrapGeminiText,
  GEMINI_DEFAULT_MODEL,
} from "../gemini";

const prompt = redactText("שווארמה");

describe("buildGeminiRequestBody", () => {
  it("wraps the prompt as a single text part", () => {
    const body = buildGeminiRequestBody(prompt, {});
    expect(body.contents).toEqual([{ parts: [{ text: "שווארמה" }] }]);
  });

  it("defaults temperature to 0 (benchmark harness)", () => {
    expect(buildGeminiRequestBody(prompt, {}).generationConfig.temperature).toBe(0);
  });

  it("passes a caller-supplied temperature through", () => {
    expect(buildGeminiRequestBody(prompt, { temperature: 0.7 }).generationConfig.temperature).toBe(
      0.7,
    );
  });

  it("requests JSON via responseMimeType when json is set", () => {
    expect(buildGeminiRequestBody(prompt, { json: true }).generationConfig.responseMimeType).toBe(
      "application/json",
    );
  });

  it("omits responseMimeType when json is not requested", () => {
    expect(buildGeminiRequestBody(prompt, {}).generationConfig.responseMimeType).toBeUndefined();
  });
});

describe("geminiGenerateUrl", () => {
  it("targets the model's generateContent method", () => {
    const url = geminiGenerateUrl(GEMINI_DEFAULT_MODEL);
    expect(url).toContain(`/models/${GEMINI_DEFAULT_MODEL}:generateContent`);
  });

  it("never places the API key in the URL (key travels in a header)", () => {
    const url = geminiGenerateUrl(GEMINI_DEFAULT_MODEL);
    expect(url).not.toContain("key=");
    expect(url).not.toContain("?");
  });

  it("does not double a trailing slash on the base URL", () => {
    expect(geminiGenerateUrl("m", "https://example.test/v1/")).toBe(
      "https://example.test/v1/models/m:generateContent",
    );
  });
});

describe("unwrapGeminiText", () => {
  it("extracts the model text from the candidates envelope", () => {
    const payload = { candidates: [{ content: { parts: [{ text: '{"answers":[]}' }] } }] };
    expect(unwrapGeminiText(payload)).toBe('{"answers":[]}');
  });

  it("concatenates multiple parts in order", () => {
    const payload = { candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] };
    expect(unwrapGeminiText(payload)).toBe("ab");
  });

  it("throws a body-free bad_response when there is no candidate", () => {
    expect(() => unwrapGeminiText({ candidates: [] })).toThrow(ProviderError);
    try {
      unwrapGeminiText({ promptFeedback: { blockReason: "SAFETY" } });
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).kind).toBe("bad_response");
      expect((err as ProviderError).retryable).toBe(false);
    }
  });

  it("throws when the parts are present but carry no text", () => {
    const payload = { candidates: [{ content: { parts: [{ text: "" }] } }] };
    expect(() => unwrapGeminiText(payload)).toThrow(ProviderError);
  });
});
