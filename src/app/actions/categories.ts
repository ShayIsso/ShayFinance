"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { formatZodError } from "@/lib/api-utils";
import { createCategory, updateCategory, deleteCategory } from "@/lib/categories";
import {
  createCategorySchema,
  updateCategoryActionSchema,
  categoryIdSchema,
} from "@/lib/categories/schemas";

// ── Result shape ──────────────────────────────────────────────────────────────

export type CategoryFieldErrors = Record<string, string>;

const DUPLICATE_NAME_MESSAGE = "קטגוריה בשם זה כבר קיימת";
const DEFAULT_CATEGORY_DELETE_MESSAGE = "לא ניתן למחוק קטגוריית ברירת מחדל";

function fieldErrorsOf(error: ZodError): CategoryFieldErrors {
  const out: CategoryFieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "root";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/**
 * postgres.js surfaces unique-constraint violations with SQLSTATE 23505.
 * Drizzle wraps the PostgresError in a DrizzleQueryError, so walk the
 * `cause` chain rather than only inspecting the top-level error.
 */
function isUniqueViolation(err: unknown): boolean {
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
): Promise<{ id?: string; error?: string; fieldErrors?: CategoryFieldErrors }> {
  const parsed = createCategorySchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: fieldErrorsOf(parsed.error) };
  }

  try {
    const id = await createCategory(parsed.data);
    revalidateCategoryPages();
    return { id };
  } catch (err) {
    if (isUniqueViolation(err)) return duplicateNameResult();
    throw err;
  }
}

export async function updateCategoryAction(
  data: unknown,
): Promise<{ updated?: boolean; error?: string; fieldErrors?: CategoryFieldErrors }> {
  const parsed = updateCategoryActionSchema.safeParse(data);
  if (!parsed.success) {
    return { error: formatZodError(parsed.error), fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const { id, ...changes } = parsed.data;

  try {
    await updateCategory(id, changes);
    revalidateCategoryPages();
    return { updated: true };
  } catch (err) {
    if (isUniqueViolation(err)) return duplicateNameResult();
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
    if (err instanceof Error && err.message === "Cannot delete a default category") {
      return { error: DEFAULT_CATEGORY_DELETE_MESSAGE };
    }
    throw err;
  }

  revalidateCategoryPages();
  return { deleted: true };
}
