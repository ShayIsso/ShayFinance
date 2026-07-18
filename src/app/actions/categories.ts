"use server";

import { revalidatePath } from "next/cache";
import { formatZodError, formatZodFieldErrors, type FieldErrors } from "@/lib/api-utils";
import { createCategory, updateCategory, deleteCategory } from "@/lib/categories";
// Imported from the dedicated errors module (not the mocked barrel) so
// instanceof keeps working in action-seam tests that mock "@/lib/categories".
import {
  DefaultCategoryDeletionError,
  DuplicateCategoryNameError,
  CategoryTypeMismatchError,
  HierarchyDepthError,
  LinkedTypeChangeError,
  ParentNotFoundError,
  PopulatedCategoryError,
} from "@/lib/categories/errors";
import {
  createCategorySchema,
  updateCategoryActionSchema,
  categoryIdSchema,
} from "@/lib/categories/schemas";

const DUPLICATE_NAME_MESSAGE = "קטגוריה בשם זה כבר קיימת";
const DEFAULT_CATEGORY_DELETE_MESSAGE = "לא ניתן למחוק קטגוריית ברירת מחדל";

// Hierarchy write invariants (ADR-0011), surfaced as inline Hebrew form errors
// rather than thrown 500s — the guided-path copy on PopulatedCategoryError is
// the block + guided path required by issue #161: reshaping never silently
// moves data, so the fix offered is always "create an empty group, then move
// leaves into it", never a silent auto-split.
const POPULATED_PARENT_MESSAGE =
  "לא ניתן להפוך קטגוריה עם נתונים לקבוצה. יש ליצור קבוצה חדשה וריקה, ולאחר מכן להעביר אליה את הקטגוריות הרצויות.";
const TYPE_MISMATCH_MESSAGE = "קבוצת אב חייבת להיות מאותו סוג קטגוריה";
const DEPTH_CAP_MESSAGE =
  "המבנה ההיררכי מוגבל לרמה אחת — לא ניתן לקשר קבוצה כתת-קטגוריה של קבוצה אחרת";
const LINKED_TYPE_CHANGE_MESSAGE =
  "לא ניתן לשנות סוג של קטגוריה המקושרת להיררכיה (יש לה קבוצת אב או תתי-קטגוריות)";
const PARENT_NOT_FOUND_MESSAGE = "קבוצת האב שנבחרה לא נמצאה";

function hierarchyErrorResult(err: unknown): { error: string; fieldErrors: FieldErrors } | null {
  if (err instanceof PopulatedCategoryError) {
    return { error: POPULATED_PARENT_MESSAGE, fieldErrors: { parentId: POPULATED_PARENT_MESSAGE } };
  }
  if (err instanceof CategoryTypeMismatchError) {
    return { error: TYPE_MISMATCH_MESSAGE, fieldErrors: { parentId: TYPE_MISMATCH_MESSAGE } };
  }
  if (err instanceof HierarchyDepthError) {
    return { error: DEPTH_CAP_MESSAGE, fieldErrors: { parentId: DEPTH_CAP_MESSAGE } };
  }
  if (err instanceof LinkedTypeChangeError) {
    return { error: LINKED_TYPE_CHANGE_MESSAGE, fieldErrors: { type: LINKED_TYPE_CHANGE_MESSAGE } };
  }
  if (err instanceof ParentNotFoundError) {
    return { error: PARENT_NOT_FOUND_MESSAGE, fieldErrors: { parentId: PARENT_NOT_FOUND_MESSAGE } };
  }
  return null;
}

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
    const hierarchyResult = hierarchyErrorResult(err);
    if (hierarchyResult) return hierarchyResult;
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
    const hierarchyResult = hierarchyErrorResult(err);
    if (hierarchyResult) return hierarchyResult;
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
