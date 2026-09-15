import { describe, it, expect } from "vitest";
import { EMPTY_APP_SETTINGS, projectAppSettings, type AppSettingsRow } from "../settings";

const NO_KEY = { encrypted: null, iv: null, authTag: null };

function row(overrides: Partial<AppSettingsRow> = {}): AppSettingsRow {
  return {
    onboardingCompletedAt: null,
    appPasswordHash: null,
    categorizationProvider: null,
    categorizationKey: NO_KEY,
    ...overrides,
  };
}

describe("projectAppSettings", () => {
  it("projects a missing row as an unconfigured install", () => {
    expect(projectAppSettings(null)).toEqual(EMPTY_APP_SETTINGS);
  });

  it("reduces a stored password hash to a presence flag", () => {
    const projected = projectAppSettings(row({ appPasswordHash: "bcrypt-hash-placeholder" }));
    expect(projected.hasAppPassword).toBe(true);
    expect(JSON.stringify(projected)).not.toContain("bcrypt-hash-placeholder");
  });

  it("reports no app password when none is stored", () => {
    expect(projectAppSettings(row()).hasAppPassword).toBe(false);
  });

  it("reports a key as present when all three ciphertext parts are stored", () => {
    const projected = projectAppSettings(
      row({
        categorizationKey: {
          encrypted: Buffer.from("ciphertext"),
          iv: Buffer.from("iv"),
          authTag: Buffer.from("tag"),
        },
      }),
    );
    expect(projected.hasCategorizationApiKey).toBe(true);
  });

  it.each([
    ["without an iv", { encrypted: Buffer.from("ciphertext"), iv: null, authTag: null }],
    [
      "without an auth tag",
      { encrypted: Buffer.from("ciphertext"), iv: Buffer.from("iv"), authTag: null },
    ],
    [
      "without a ciphertext",
      { encrypted: null, iv: Buffer.from("iv"), authTag: Buffer.from("tag") },
    ],
  ])("reports no key when the triple is incomplete %s", (_case, categorizationKey) => {
    expect(projectAppSettings(row({ categorizationKey })).hasCategorizationApiKey).toBe(false);
  });

  it.each(["gemini", "ollama", "off"] as const)("passes through the stored provider %s", (kind) => {
    expect(projectAppSettings(row({ categorizationProvider: kind })).categorizationProvider).toBe(
      kind,
    );
  });

  it("reads an unrecognised provider value as unset", () => {
    expect(
      projectAppSettings(row({ categorizationProvider: "retired-provider" }))
        .categorizationProvider,
    ).toBeNull();
  });

  it("never carries the stored ciphertext into the projection", () => {
    const projected = projectAppSettings(
      row({
        categorizationKey: {
          encrypted: Buffer.from("ciphertext"),
          iv: Buffer.from("iv"),
          authTag: Buffer.from("tag"),
        },
      }),
    );
    expect(JSON.stringify(projected)).not.toContain("ciphertext");
  });
});
