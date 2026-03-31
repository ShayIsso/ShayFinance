import { z } from "zod";

const discountSchema = z.object({
  id: z.string().min(1, "תעודת זהות חובה"),
  password: z.string().min(1, "סיסמה חובה"),
  num: z.string().min(1, "מספר חשבון חובה"),
});

const maxCalSchema = z.object({
  username: z.string().min(1, "שם משתמש חובה"),
  password: z.string().min(1, "סיסמה חובה"),
});

export const credentialSchemas = {
  discount: discountSchema,
  max: maxCalSchema,
  visaCal: maxCalSchema,
} as const;

export const addCredentialSchema = z.object({
  bankType: z.enum(["discount", "max", "visaCal"]),
  displayName: z.string().min(1, "שם תצוגה חובה"),
  credentials: z.record(z.string(), z.string()),
});
