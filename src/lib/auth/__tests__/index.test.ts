import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * `getEnv` memoizes, so each case re-imports the module against a fresh
 * `process.env` rather than sharing a cached parse.
 */
async function loadAuth(appPassword: string | undefined) {
  vi.resetModules();
  if (appPassword === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = appPassword;
  return import("../index");
}

const ORIGINAL_APP_PASSWORD = process.env.APP_PASSWORD;

afterEach(() => {
  if (ORIGINAL_APP_PASSWORD === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = ORIGINAL_APP_PASSWORD;
});

describe("verifyPassword — legacy APP_PASSWORD override (ADR-0014 §2)", () => {
  it("fails closed when no override is set", async () => {
    const { verifyPassword } = await loadAuth(undefined);
    // Resolving false rather than rejecting is the point: without the guard,
    // bcrypt.compare receives undefined and throws a 500 out of the login route.
    await expect(verifyPassword("any-password")).resolves.toBe(false);
  });

  it("fails closed when the override is blank", async () => {
    const { verifyPassword } = await loadAuth("");
    await expect(verifyPassword("any-password")).resolves.toBe(false);
  });

  it("accepts the password matching the override hash", async () => {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.hash("correct-horse", 4);
    const { verifyPassword } = await loadAuth(hash);
    await expect(verifyPassword("correct-horse")).resolves.toBe(true);
  });

  it("rejects a password not matching the override hash", async () => {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.hash("correct-horse", 4);
    const { verifyPassword } = await loadAuth(hash);
    await expect(verifyPassword("wrong-password")).resolves.toBe(false);
  });
});

describe("session tokens", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("validates a token it just created", async () => {
    const { createSession, validateSession } = await import("../index");
    expect(validateSession(createSession())).toBe(true);
  });

  it("rejects a token whose signature was tampered with", async () => {
    const { createSession, validateSession } = await import("../index");
    const token = createSession();
    const [data] = token.split(".");
    expect(validateSession(`${data}.${"0".repeat(64)}`)).toBe(false);
  });

  it("rejects a token with no signature separator", async () => {
    const { validateSession } = await import("../index");
    expect(validateSession("no-separator-here")).toBe(false);
  });
});
