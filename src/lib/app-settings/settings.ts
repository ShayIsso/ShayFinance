import type { AiProviderKind } from "@/lib/ai-categorization";

/**
 * An AES-256-GCM ciphertext as it sits in the settings row — the same triple
 * `bank_credentials` stores (ADR-0002: unique IV per record, GCM auth tag). All
 * three parts are null on an install that has configured no key.
 */
export type StoredSecret = {
  readonly encrypted: Buffer | null;
  readonly iv: Buffer | null;
  readonly authTag: Buffer | null;
};

/** The singleton `app_settings` row as stored, before projection. */
export type AppSettingsRow = {
  readonly onboardingCompletedAt: Date | null;
  readonly appPasswordHash: string | null;
  readonly categorizationProvider: string | null;
  readonly categorizationKey: StoredSecret;
};

/**
 * App settings as the rest of the app sees them. Both stored secrets appear
 * only as presence flags, and each has its own dedicated read on the store:
 * ADR-0008's provider resolution takes a flag rather than the key, so a
 * resolution input can be logged without leaking, and the password hash has no
 * business in a projection a settings screen renders. What consumers need is
 * whether a password is set, not the hash that proves it.
 */
export type AppSettings = {
  readonly onboardingCompletedAt: Date | null;
  readonly hasAppPassword: boolean;
  readonly categorizationProvider: AiProviderKind | null;
  readonly hasCategorizationApiKey: boolean;
};

export const EMPTY_APP_SETTINGS: AppSettings = {
  onboardingCompletedAt: null,
  hasAppPassword: false,
  categorizationProvider: null,
  hasCategorizationApiKey: false,
};

/**
 * Every provider kind must appear here: a `Record` over the union fails to
 * compile the day `ai-categorization` gains a kind, which is what keeps this
 * runtime list from drifting away from the type it mirrors.
 */
const PROVIDER_KINDS: Record<AiProviderKind, true> = { gemini: true, ollama: true, off: true };

/**
 * The provider column is `text`, not a database enum, so any string can arrive
 * — including a kind the app no longer supports. Projection is therefore total:
 * an unrecognised value reads as unset rather than propagating an unusable kind.
 */
function toProviderKind(stored: string | null): AiProviderKind | null {
  if (stored === null) return null;
  return Object.prototype.hasOwnProperty.call(PROVIDER_KINDS, stored)
    ? (stored as AiProviderKind)
    : null;
}

/**
 * Decryption needs all three parts, so a half-written triple reads as no key at
 * all rather than as a key that cannot be decrypted.
 */
function isStoredSecretComplete(secret: StoredSecret): boolean {
  return secret.encrypted !== null && secret.iv !== null && secret.authTag !== null;
}

export function projectAppSettings(row: AppSettingsRow | null): AppSettings {
  if (!row) return EMPTY_APP_SETTINGS;

  return {
    onboardingCompletedAt: row.onboardingCompletedAt,
    hasAppPassword: row.appPasswordHash !== null,
    categorizationProvider: toProviderKind(row.categorizationProvider),
    hasCategorizationApiKey: isStoredSecretComplete(row.categorizationKey),
  };
}
