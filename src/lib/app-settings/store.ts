import { isNull } from "drizzle-orm";
import type { AiProviderKind } from "@/lib/ai-categorization";
import { decrypt, encrypt } from "@/lib/crypto";
import { projectAppSettings, type AppSettings } from "./settings";

/** A provider choice and the key it needs; `null` clears any stored key. */
export type CategorizationSelection = {
  readonly provider: AiProviderKind;
  readonly apiKey: string | null;
};

export type AppSettingsStore = {
  read(): Promise<AppSettings>;
  setAppPasswordHash(hash: string): Promise<void>;
  /**
   * Records first-run completion, and reports whether this call is the one that
   * did it. `false` means onboarding was already complete — the write is
   * conditioned on the timestamp still being null, so a double submit or a
   * replayed request is rejected by construction rather than by check-then-act
   * (ADR-0014 §4).
   */
  completeOnboarding(completedAt: Date): Promise<boolean>;
  setCategorization(selection: CategorizationSelection): Promise<void>;
  /** Decrypts the stored key. The only path by which it leaves the store. */
  readCategorizationApiKey(): Promise<string | null>;
};

const SINGLETON_ID = 1;

export function makeDrizzleAppSettingsStore(): AppSettingsStore {
  return {
    async read(): Promise<AppSettings> {
      const { db } = await import("@/db");
      const { appSettings } = await import("@/db/schema");

      const row = await db.query.appSettings.findFirst();
      if (!row) {
        await db.insert(appSettings).values({ id: SINGLETON_ID }).onConflictDoNothing();
        return projectAppSettings(null);
      }
      return projectAppSettings({
        onboardingCompletedAt: row.onboardingCompletedAt,
        appPasswordHash: row.appPasswordHash,
        categorizationProvider: row.categorizationProvider,
        categorizationKey: {
          encrypted: row.categorizationApiKeyEncrypted,
          iv: row.categorizationApiKeyIv,
          authTag: row.categorizationApiKeyAuthTag,
        },
      });
    },

    async setAppPasswordHash(hash: string): Promise<void> {
      const { db } = await import("@/db");
      const { appSettings } = await import("@/db/schema");

      await db
        .insert(appSettings)
        .values({ id: SINGLETON_ID, appPasswordHash: hash, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: appSettings.id,
          set: { appPasswordHash: hash, updatedAt: new Date() },
        });
    },

    async completeOnboarding(completedAt: Date): Promise<boolean> {
      const { db } = await import("@/db");
      const { appSettings } = await import("@/db/schema");

      const written = await db
        .insert(appSettings)
        .values({ id: SINGLETON_ID, onboardingCompletedAt: completedAt, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: appSettings.id,
          set: { onboardingCompletedAt: completedAt, updatedAt: new Date() },
          setWhere: isNull(appSettings.onboardingCompletedAt),
        })
        .returning({ id: appSettings.id });

      return written.length > 0;
    },

    async setCategorization(selection: CategorizationSelection): Promise<void> {
      const { db } = await import("@/db");
      const { appSettings } = await import("@/db/schema");

      const key =
        selection.apiKey === null
          ? { encrypted: null, iv: null, authTag: null }
          : encrypt(selection.apiKey);
      const columns = {
        categorizationProvider: selection.provider,
        categorizationApiKeyEncrypted: key.encrypted,
        categorizationApiKeyIv: key.iv,
        categorizationApiKeyAuthTag: key.authTag,
        updatedAt: new Date(),
      };

      await db
        .insert(appSettings)
        .values({ id: SINGLETON_ID, ...columns })
        .onConflictDoUpdate({ target: appSettings.id, set: columns });
    },

    async readCategorizationApiKey(): Promise<string | null> {
      const { db } = await import("@/db");

      const row = await db.query.appSettings.findFirst();
      const encrypted = row?.categorizationApiKeyEncrypted;
      const iv = row?.categorizationApiKeyIv;
      const authTag = row?.categorizationApiKeyAuthTag;
      if (!encrypted || !iv || !authTag) return null;

      return decrypt({ encrypted, iv, authTag });
    },
  };
}

export const drizzleAppSettingsStore: AppSettingsStore = makeDrizzleAppSettingsStore();
