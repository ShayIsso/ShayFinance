import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "Must be 64 hex chars (32 bytes)"),
  APP_PASSWORD: z.string().min(1),
});

export const env = envSchema.parse(process.env);
