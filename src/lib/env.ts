import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "Must be 64 hex chars (32 bytes)"),
  APP_PASSWORD: z.string().min(1),
  CHROMIUM_PATH: z.string().min(1).optional(),
  SCHEDULER_ENABLED: z.enum(["true", "false"]).optional().default("false"),
  // AI categorization (ADR-0008). Unset AI_PROVIDER resolves to off — a fresh
  // install makes zero external calls. `gemini` needs GEMINI_API_KEY or it too
  // resolves to off; `ollama` is the zero-egress mode. Resolution lives in the
  // pure `resolveCategorizationProvider` (src/lib/ai-categorization/config.ts).
  AI_PROVIDER: z.enum(["gemini", "ollama", "off"]).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  OLLAMA_ENDPOINT: z.string().url().optional(),
  OLLAMA_MODEL: z.string().min(1).optional(),
});

let _env: z.infer<typeof envSchema> | undefined;

export function getEnv(): z.infer<typeof envSchema> {
  if (!_env) _env = envSchema.parse(process.env);
  return _env;
}

/** Returns true when SCHEDULER_ENABLED=true in the environment. */
export function isSchedulerEnabled(): boolean {
  return getEnv().SCHEDULER_ENABLED === "true";
}
