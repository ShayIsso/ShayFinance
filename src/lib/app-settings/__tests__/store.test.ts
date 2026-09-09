import { describe, it, expect } from "vitest";
import {
  EMPTY_APP_SETTINGS,
  projectAppSettings,
  type AppSettingsRow,
  type AppSettingsStore,
} from "..";

/**
 * In-memory `AppSettingsStore` — the seam is the interface, so these tests pin
 * the contract its consumers (#258, #261) code against without mocking Drizzle.
 * The fake projects through the same pure `projectAppSettings` the Drizzle
 * implementation uses, so a projection change cannot pass here and fail there.
 */
function makeInMemoryStore(seed: AppSettingsRow | null = null) {
  let row: AppSettingsRow | null = seed;
  let plaintextKey: string | null = null;

  const store: AppSettingsStore = {
    async read() {
      return projectAppSettings(row);
    },
    async setAppPasswordHash(hash) {
      row = { ...blank(), ...row, appPasswordHash: hash };
    },
    async completeOnboarding(completedAt) {
      if (row?.onboardingCompletedAt) return false;
      row = { ...blank(), ...row, onboardingCompletedAt: completedAt };
      return true;
    },
    async setCategorization({ provider, apiKey }) {
      plaintextKey = apiKey;
      row = {
        ...blank(),
        ...row,
        categorizationProvider: provider,
        categorizationKey:
          apiKey === null
            ? { encrypted: null, iv: null, authTag: null }
            : {
                encrypted: Buffer.from("stored-ciphertext"),
                iv: Buffer.from("stored-iv"),
                authTag: Buffer.from("stored-tag"),
              },
      };
    },
    async readCategorizationApiKey() {
      return row?.categorizationKey.encrypted ? plaintextKey : null;
    },
  };

  return { store, currentRow: () => row };
}

function blank(): AppSettingsRow {
  return {
    onboardingCompletedAt: null,
    appPasswordHash: null,
    categorizationProvider: null,
    categorizationKey: { encrypted: null, iv: null, authTag: null },
  };
}

describe("AppSettingsStore contract", () => {
  it("reads an unconfigured install before anything is written", async () => {
    const { store } = makeInMemoryStore();
    expect(await store.read()).toEqual(EMPTY_APP_SETTINGS);
  });

  it("reads back a written app-password hash", async () => {
    const { store } = makeInMemoryStore();
    await store.setAppPasswordHash("bcrypt-hash-placeholder");
    expect((await store.read()).appPasswordHash).toBe("bcrypt-hash-placeholder");
  });

  it("replaces the app-password hash rather than accumulating rows", async () => {
    const { store, currentRow } = makeInMemoryStore();
    await store.setAppPasswordHash("first-hash-placeholder");
    await store.setAppPasswordHash("second-hash-placeholder");
    expect(currentRow()?.appPasswordHash).toBe("second-hash-placeholder");
  });

  it("records the onboarding completion timestamp on the first call", async () => {
    const { store } = makeInMemoryStore();
    const completedAt = new Date("2026-03-04T00:00:00.000Z");
    expect(await store.completeOnboarding(completedAt)).toBe(true);
    expect((await store.read()).onboardingCompletedAt).toEqual(completedAt);
  });

  it("rejects a second completion and keeps the original timestamp", async () => {
    const { store } = makeInMemoryStore();
    const first = new Date("2026-03-04T00:00:00.000Z");
    await store.completeOnboarding(first);

    expect(await store.completeOnboarding(new Date("2026-05-06T00:00:00.000Z"))).toBe(false);
    expect((await store.read()).onboardingCompletedAt).toEqual(first);
  });

  it("keeps the password hash when onboarding completion is recorded", async () => {
    const { store } = makeInMemoryStore();
    await store.setAppPasswordHash("bcrypt-hash-placeholder");
    await store.completeOnboarding(new Date("2026-03-04T00:00:00.000Z"));
    expect((await store.read()).appPasswordHash).toBe("bcrypt-hash-placeholder");
  });

  it("reports a stored provider and key presence without exposing the key", async () => {
    const { store } = makeInMemoryStore();
    await store.setCategorization({ provider: "gemini", apiKey: "synthetic-key-value" });

    const settings = await store.read();
    expect(settings.categorizationProvider).toBe("gemini");
    expect(settings.hasCategorizationApiKey).toBe(true);
    expect(JSON.stringify(settings)).not.toContain("synthetic-key-value");
  });

  it("returns the stored key only through the dedicated read", async () => {
    const { store } = makeInMemoryStore();
    await store.setCategorization({ provider: "gemini", apiKey: "synthetic-key-value" });
    expect(await store.readCategorizationApiKey()).toBe("synthetic-key-value");
  });

  it("clears the stored key when the selection carries none", async () => {
    const { store } = makeInMemoryStore();
    await store.setCategorization({ provider: "gemini", apiKey: "synthetic-key-value" });
    await store.setCategorization({ provider: "off", apiKey: null });

    expect((await store.read()).hasCategorizationApiKey).toBe(false);
    expect(await store.readCategorizationApiKey()).toBeNull();
  });
});
