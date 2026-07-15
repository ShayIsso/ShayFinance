import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const REQUIRED = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  ENCRYPTION_KEY: "a".repeat(64),
  APP_PASSWORD: "hash",
};

describe("parseEnv — AI categorization variables", () => {
  it("treats blank optional AI vars as unset (verbatim .env.example copy)", () => {
    const env = parseEnv({
      ...REQUIRED,
      AI_PROVIDER: "",
      GEMINI_API_KEY: "",
      OLLAMA_ENDPOINT: "",
      OLLAMA_MODEL: "",
    });
    expect(env.AI_PROVIDER).toBeUndefined();
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.OLLAMA_ENDPOINT).toBeUndefined();
    expect(env.OLLAMA_MODEL).toBeUndefined();
  });

  it("parses with all AI vars absent", () => {
    const env = parseEnv({ ...REQUIRED });
    expect(env.AI_PROVIDER).toBeUndefined();
  });

  it("accepts the three provider values", () => {
    for (const provider of ["gemini", "ollama", "off"] as const) {
      expect(parseEnv({ ...REQUIRED, AI_PROVIDER: provider }).AI_PROVIDER).toBe(provider);
    }
  });

  it("rejects an unknown provider value", () => {
    expect(() => parseEnv({ ...REQUIRED, AI_PROVIDER: "openai" })).toThrow();
  });
});
