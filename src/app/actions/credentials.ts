"use server";

import { revalidatePath } from "next/cache";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import { addCredential, updateCredential, removeCredential } from "@/lib/credentials";
// Imported from the dedicated errors module (not the mocked barrel) so
// instanceof keeps working in action-seam tests that mock "@/lib/credentials".
import { CredentialNotFoundError } from "@/lib/credentials/errors";
import {
  addCredentialSchema,
  updateCredentialSchema,
  credentialIdSchema,
} from "@/lib/credentials/schemas";

const NOT_FOUND_MESSAGE = "חשבון הבנק לא נמצא";

/**
 * Credentials drive the settings list, the sync page's bank list, and —
 * through the cascade to bank accounts and transactions — the dashboard's
 * per-account balances and the transactions table.
 */
function revalidateCredentialPages() {
  revalidatePath("/settings");
  revalidatePath("/sync");
  revalidatePath("/");
  revalidatePath("/transactions");
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function addCredentialAction(
  data: unknown,
): Promise<{ id?: string; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = addCredentialSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { bankType, displayName, credentials } = parsed.data;
  const id = await addCredential(bankType, displayName, credentials);
  revalidateCredentialPages();
  return { id };
}

export async function updateCredentialAction(
  data: unknown,
): Promise<{ updated?: boolean; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = updateCredentialSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { id, displayName, credentials } = parsed.data;

  try {
    // `credentials` is present only when the owner typed a replacement
    // password; otherwise only the display name changes.
    await updateCredential(id, { displayName, rawCredentials: credentials });
  } catch (err) {
    if (err instanceof CredentialNotFoundError) return { error: NOT_FOUND_MESSAGE };
    throw err;
  }

  revalidateCredentialPages();
  return { updated: true };
}

export async function deleteCredentialAction(
  data: unknown,
): Promise<{ deleted?: boolean; error?: string }> {
  const parsed = credentialIdSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }

  await removeCredential(parsed.data.id);
  revalidateCredentialPages();
  return { deleted: true };
}
