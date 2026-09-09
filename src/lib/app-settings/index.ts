/**
 * App settings — the singleton row holding the secrets and the one flag that
 * ADR-0014 keeps in the database rather than the environment: the app-password
 * hash, the categorization provider selection with its encrypted key, and the
 * onboarding completion timestamp that is the sole first-run signal.
 *
 * Only `DATABASE_URL` and `ENCRYPTION_KEY` remain environment-required, since
 * the key encrypts the very rows this module reads. Their boot preflight lives
 * in `src/lib/env.ts` (`checkBootEnv`).
 */
export type { AppSettings, AppSettingsRow, StoredSecret } from "./settings";
export { EMPTY_APP_SETTINGS, projectAppSettings } from "./settings";
export type { AppSettingsStore, CategorizationSelection } from "./store";
export { makeDrizzleAppSettingsStore, drizzleAppSettingsStore } from "./store";
