import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * A throw out of `register()` fails server preparation, so *every* route 500s —
 * the diagnostic page included. That makes "never throws" the property the boot
 * preflight's promise rests on, and it has to hold for environments the
 * preflight deliberately does not police: it validates two variables, while
 * `startScheduler` parses the whole schema.
 */
const KEYS = [
  "DATABASE_URL",
  "ENCRYPTION_KEY",
  "APP_PASSWORD",
  "CHROMIUM_PATH",
  "SCHEDULER_ENABLED",
  "AI_PROVIDER",
  "NEXT_RUNTIME",
] as const;

const ORIGINAL = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

const BOOT_OK = {
  DATABASE_URL: "postgresql://synthetic:synthetic@localhost:5432/synthetic",
  ENCRYPTION_KEY: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
};

async function register(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of KEYS) delete process.env[key];
  process.env.NEXT_RUNTIME = "nodejs";
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
  const mod = await import("../instrumentation");
  return mod.register();
}

afterEach(() => {
  for (const key of KEYS) {
    const value = ORIGINAL[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("register — boot hook", () => {
  it("resolves on a minimal usable environment", async () => {
    await expect(register(BOOT_OK)).resolves.toBeUndefined();
  });

  it("resolves when the boot-critical variables are unusable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(register({})).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it.each([
    ["a blank CHROMIUM_PATH", { CHROMIUM_PATH: "" }],
    ["a blank SCHEDULER_ENABLED", { SCHEDULER_ENABLED: "" }],
    ["a blank APP_PASSWORD", { APP_PASSWORD: "" }],
    ["a blank AI_PROVIDER", { AI_PROVIDER: "" }],
    ["an out-of-range SCHEDULER_ENABLED", { SCHEDULER_ENABLED: "yes" }],
    ["an unknown AI_PROVIDER", { AI_PROVIDER: "not-a-provider" }],
  ])("resolves on a usable boot environment with %s", async (_case, extra) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(register({ ...BOOT_OK, ...extra })).resolves.toBeUndefined();
    error.mockRestore();
  });

  it("does nothing outside the node runtime", async () => {
    vi.resetModules();
    process.env.NEXT_RUNTIME = "edge";
    const { register: edgeRegister } = await import("../instrumentation");
    await expect(edgeRegister()).resolves.toBeUndefined();
  });
});
