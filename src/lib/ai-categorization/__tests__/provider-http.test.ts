import { describe, it, expect } from "vitest";
import {
  ProviderError,
  httpStatusClass,
  isRetryableStatus,
  DEFAULT_PACING,
} from "../provider-http";

describe("isRetryableStatus", () => {
  it("treats 429 as retryable", () => {
    expect(isRetryableStatus(429)).toBe(true);
  });

  it("treats all 5xx as retryable", () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(599)).toBe(true);
  });

  it("treats other 4xx (auth, bad request, not found) as permanent", () => {
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
  });

  it("treats a 2xx as non-retryable", () => {
    expect(isRetryableStatus(200)).toBe(false);
  });
});

describe("httpStatusClass", () => {
  it("collapses a status to its class token", () => {
    expect(httpStatusClass(503)).toBe("5xx");
    expect(httpStatusClass(429)).toBe("4xx");
    expect(httpStatusClass(200)).toBe("2xx");
  });
});

describe("ProviderError", () => {
  it("builds a body-free message from shape only", () => {
    const err = new ProviderError({
      provider: "gemini",
      kind: "http_error",
      statusClass: "5xx",
      retryable: true,
    });
    expect(err.message).toBe("gemini http_error (5xx) [retryable]");
    expect(err.provider).toBe("gemini");
    expect(err.kind).toBe("http_error");
    expect(err.statusClass).toBe("5xx");
    expect(err.retryable).toBe(true);
  });

  it("omits the status class when absent", () => {
    const err = new ProviderError({ provider: "ollama", kind: "network_error", retryable: true });
    expect(err.message).toBe("ollama network_error [retryable]");
  });

  it("marks a non-retryable error without the retryable tag", () => {
    const err = new ProviderError({ provider: "gemini", kind: "bad_response", retryable: false });
    expect(err.message).toBe("gemini bad_response");
    expect(err.retryable).toBe(false);
  });

  it("is a real Error subclass so instanceof narrows in catch", () => {
    const err = new ProviderError({
      provider: "ollama",
      kind: "retries_exhausted",
      retryable: false,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProviderError");
  });
});

describe("DEFAULT_PACING", () => {
  it("allows at least one retry and is frozen", () => {
    expect(DEFAULT_PACING.maxAttempts).toBeGreaterThanOrEqual(2);
    expect(Object.isFrozen(DEFAULT_PACING)).toBe(true);
  });
});
