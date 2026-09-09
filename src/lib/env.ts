import { z } from "zod";

// dotenv loads a bare `KEY=` line as "" — treat blank as unset so a verbatim
// .env.example copy resolves the optional AI vars to off instead of failing
// the whole schema parse (which would crash every getEnv() caller).
const blankAsUnset = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema);

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "Must be 64 hex chars (32 bytes)"),
  // ADR-0014 §2 demotes APP_PASSWORD to a legacy override that wins when set;
  // the hash now lives in app settings. It must stay optional: required here,
  // a fresh install threw out of the first getEnv() — including the scheduler's
  // at boot — before any page, the diagnostic one included, could render.
  APP_PASSWORD: blankAsUnset(z.string().min(1).optional()),
  CHROMIUM_PATH: z.string().min(1).optional(),
  SCHEDULER_ENABLED: z.enum(["true", "false"]).optional().default("false"),
  // AI categorization (ADR-0008). Unset AI_PROVIDER resolves to off — a fresh
  // install makes zero external calls. `gemini` needs GEMINI_API_KEY or it too
  // resolves to off; `ollama` is the zero-egress mode. Resolution lives in the
  // pure `resolveCategorizationProvider` (src/lib/ai-categorization/config.ts).
  AI_PROVIDER: blankAsUnset(z.enum(["gemini", "ollama", "off"]).optional()),
  GEMINI_API_KEY: blankAsUnset(z.string().min(1).optional()),
  OLLAMA_ENDPOINT: blankAsUnset(z.string().url().optional()),
  OLLAMA_MODEL: blankAsUnset(z.string().min(1).optional()),
});

let _env: z.infer<typeof envSchema> | undefined;

/** Pure parse over an env-shaped source; the seam that makes the schema testable. */
export function parseEnv(source: Record<string, string | undefined>): z.infer<typeof envSchema> {
  return envSchema.parse(source);
}

export function getEnv(): z.infer<typeof envSchema> {
  if (!_env) _env = parseEnv(process.env);
  return _env;
}

/** Returns true when SCHEDULER_ENABLED=true in the environment. */
export function isSchedulerEnabled(): boolean {
  return getEnv().SCHEDULER_ENABLED === "true";
}

// ── Boot preflight (ADR-0014 §1) ──────────────────────────────────────────────

/**
 * The variables that must be valid before the app can serve anything: one
 * reaches the store, the other encrypts the rows inside it and therefore can
 * never live there. Picked from `envSchema` rather than declared again, so the
 * preflight and the full parse cannot disagree about what "valid" means.
 */
const bootEnvSchema = envSchema.pick({ DATABASE_URL: true, ENCRYPTION_KEY: true });

export type BootEnvVariable = keyof z.infer<typeof bootEnvSchema>;

/**
 * The command to run to obtain each value — for the key, one that prints a
 * fresh one; for the database, one that brings the local instance up so its
 * connection string exists to copy. Nothing read from the environment is ever
 * interpolated into these: they feed a page rendered to the browser, where no
 * part of a secret may appear (zero-leak policy).
 */
const GENERATE_COMMAND: Record<BootEnvVariable, string> = {
  DATABASE_URL: "docker compose up db -d",
  ENCRYPTION_KEY: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
};

export type BootEnvProblem = {
  readonly variable: BootEnvVariable;
  readonly generateCommand: string;
};

export type BootEnvCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly problems: readonly BootEnvProblem[] };

/**
 * Pure preflight over an env-shaped source. Reports which boot-critical
 * variables are unusable and how to produce each one — never why, and never any
 * part of the offending value.
 */
export function checkBootEnv(source: Record<string, string | undefined>): BootEnvCheck {
  const result = bootEnvSchema.safeParse(source);
  if (result.success) return { ok: true };

  const failed = new Set(result.error.issues.map((issue) => String(issue.path[0])));
  const problems = (Object.keys(bootEnvSchema.shape) as BootEnvVariable[])
    .filter((variable) => failed.has(variable))
    .map((variable) => ({ variable, generateCommand: GENERATE_COMMAND[variable] }));

  return { ok: false, problems };
}
