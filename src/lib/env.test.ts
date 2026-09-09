import { describe, it, expect } from "vitest";
import { parseEnv, checkBootEnv } from "./env";

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

describe("parseEnv — APP_PASSWORD as a legacy override", () => {
  const BOOT_CRITICAL = {
    DATABASE_URL: REQUIRED.DATABASE_URL,
    ENCRYPTION_KEY: REQUIRED.ENCRYPTION_KEY,
  };

  it("parses with APP_PASSWORD absent", () => {
    expect(parseEnv(BOOT_CRITICAL).APP_PASSWORD).toBeUndefined();
  });

  it("treats a blank APP_PASSWORD as unset", () => {
    expect(parseEnv({ ...BOOT_CRITICAL, APP_PASSWORD: "" }).APP_PASSWORD).toBeUndefined();
  });

  it("keeps the value when the override is set", () => {
    expect(parseEnv({ ...BOOT_CRITICAL, APP_PASSWORD: "stored-hash" }).APP_PASSWORD).toBe(
      "stored-hash",
    );
  });
});

describe("checkBootEnv", () => {
  it("reports ok when both boot-critical variables are valid", () => {
    expect(checkBootEnv({ ...REQUIRED })).toEqual({ ok: true });
  });

  it("names the generate command for an absent ENCRYPTION_KEY", () => {
    const check = checkBootEnv({ DATABASE_URL: REQUIRED.DATABASE_URL });
    expect(check).toEqual({
      ok: false,
      problems: [
        {
          variable: "ENCRYPTION_KEY",
          generateCommand: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
        },
      ],
    });
  });

  it("lists both variables in declaration order when the environment is empty", () => {
    const check = checkBootEnv({});
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.problems.map((p) => p.variable)).toEqual(["DATABASE_URL", "ENCRYPTION_KEY"]);
  });

  it("treats a blank value as unusable (a .env.example copy leaves the key empty)", () => {
    const check = checkBootEnv({ ...REQUIRED, ENCRYPTION_KEY: "" });
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.problems.map((p) => p.variable)).toEqual(["ENCRYPTION_KEY"]);
  });

  it("ignores variables that are not boot-critical", () => {
    expect(checkBootEnv({ ...REQUIRED, APP_PASSWORD: undefined, AI_PROVIDER: "openai" })).toEqual({
      ok: true,
    });
  });

  it("leaks no part of an offending value into the reported problems", () => {
    const check = checkBootEnv({
      DATABASE_URL: "not-a-url-secret-part",
      ENCRYPTION_KEY: "zz-not-hex-secret-part",
    });
    expect(JSON.stringify(check)).not.toContain("secret-part");
  });
});
