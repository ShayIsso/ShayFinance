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

const displayNameSchema = z.string().trim().min(1, "שם תצוגה חובה");

/**
 * Add form / action schema. Discriminated on bankType so only the selected
 * bank's fields are validated: Discount uses national ID + account number,
 * Max and Cal use an internet username. The nested `credentials` object keeps
 * Discount's national-ID field (`id`) from colliding with the row UUID, and
 * reuses the exact per-bank schemas the module itself validates with.
 */
export const addCredentialSchema = z.discriminatedUnion("bankType", [
  z.object({
    bankType: z.literal("discount"),
    displayName: displayNameSchema,
    credentials: discountSchema,
  }),
  z.object({
    bankType: z.literal("max"),
    displayName: displayNameSchema,
    credentials: maxCalSchema,
  }),
  z.object({
    bankType: z.literal("visaCal"),
    displayName: displayNameSchema,
    credentials: maxCalSchema,
  }),
]);

// Edit-mode per-bank fields: the password may stay blank (= keep the stored
// one); the other fields remain required so a prefilled value can't be cleared.
const editDiscountSchema = discountSchema.extend({ password: z.string() });
const editMaxCalSchema = maxCalSchema.extend({ password: z.string() });

/**
 * Client-side edit form schema. A blank password means "no replacement" —
 * the client then omits `credentials` from the update payload entirely, so a
 * password is only ever transmitted when the owner typed a new one.
 */
export const editCredentialSchema = z.discriminatedUnion("bankType", [
  z.object({
    bankType: z.literal("discount"),
    displayName: displayNameSchema,
    credentials: editDiscountSchema,
  }),
  z.object({
    bankType: z.literal("max"),
    displayName: displayNameSchema,
    credentials: editMaxCalSchema,
  }),
  z.object({
    bankType: z.literal("visaCal"),
    displayName: displayNameSchema,
    credentials: editMaxCalSchema,
  }),
]);

const credentialRowId = z.string().uuid("מזהה חשבון לא תקין");

/**
 * Update action schema. `credentials` is optional: absent means the password
 * was not replaced and only the display name changes; present means a full
 * credential replacement, validated with the same per-bank schemas as add.
 */
export const updateCredentialSchema = z.discriminatedUnion("bankType", [
  z.object({
    id: credentialRowId,
    bankType: z.literal("discount"),
    displayName: displayNameSchema,
    credentials: discountSchema.optional(),
  }),
  z.object({
    id: credentialRowId,
    bankType: z.literal("max"),
    displayName: displayNameSchema,
    credentials: maxCalSchema.optional(),
  }),
  z.object({
    id: credentialRowId,
    bankType: z.literal("visaCal"),
    displayName: displayNameSchema,
    credentials: maxCalSchema.optional(),
  }),
]);

export const credentialIdSchema = z.object({ id: credentialRowId });
