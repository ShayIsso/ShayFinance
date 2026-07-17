"use server";

import { revalidatePath } from "next/cache";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import { createCategory, updateCategory, deleteCategory } from "@/lib/categories";
// Imported from the dedicated errors module (not the mocked barrel) so
// instanceof keeps working in action-seam tests that mock "@/lib/categories".
import { DefaultCategoryDeletionError, DuplicateCategoryNameError } from "@/lib/categories/errors";
import {
  createCategorySchema,
  updateCategoryActionSchema,
  categoryIdSchema,
} from "@/lib/categories/schemas";

const DUPLICATE_NAME_MESSAGE = "קטגוריה בשם זה כבר קיימת";
const DEFAULT_CATEGORY_DELETE_MESSAGE = "לא ניתן למחוק קטגוריית ברירת מחדל";

/**
 * A duplicate name is caught two ways: the categories module's pure validator
 * throws DuplicateCategoryNameError before the write, and postgres.js still
 * surfaces the unique-constraint violation (SQLSTATE 23505) as a race backstop.
 * Drizzle wraps the PostgresError in a DrizzleQueryError, so walk the `cause`
 * chain rather than only inspecting the top-level error.
 */
function isDuplicateName(err: unknown): boolean {
  if (err instanceof DuplicateCategoryNameError) return true;
  let current: unknown = err;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function duplicateNameResult() {
  return { error: DUPLICATE_NAME_MESSAGE, fieldErrors: { name: DUPLICATE_NAME_MESSAGE } };
}

/**
 * Category names and types render on settings, transactions, the dashboard
 * (spending-by-category chart), the reconciliation inbox and the
 * subscriptions naming dialog.
 */
function revalidateCategoryPages() {
  revalidatePath("/settings");
  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/reconciliation");
  revalidatePath("/subscriptions");
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function createCategoryAction(
  data: unknown,
): Promise<{ id?: string; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = createCategorySchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  try {
    const id = await createCategory(parsed.data);
    revalidateCategoryPages();
    return { id };
  } catch (err) {
    if (isDuplicateName(err)) return duplicateNameResult();
    throw err;
  }
}

export async function updateCategoryAction(
  data: unknown,
): Promise<{ updated?: boolean; error?: string; fieldErrors?: FieldErrors }> {
  const parsed = updateCategoryActionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: formatZodFieldErrors(parsed.error) };
  }

  const { id, ...changes } = parsed.data;

  try {
    await updateCategory(id, changes);
    revalidateCategoryPages();
    return { updated: true };
  } catch (err) {
    if (isDuplicateName(err)) return duplicateNameResult();
    throw err;
  }
}

export async function deleteCategoryAction(
  data: unknown,
): Promise<{ deleted?: boolean; error?: string }> {
  const parsed = categoryIdSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) };
  }

  try {
    await deleteCategory(parsed.data.id);
  } catch (err) {
    if (err instanceof DefaultCategoryDeletionError) {
      return { error: DEFAULT_CATEGORY_DELETE_MESSAGE };
    }
    throw err;
  }

  revalidateCategoryPages();
  return { deleted: true };
}
