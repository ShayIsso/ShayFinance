import { describe, it, expect, vi, beforeEach } from "vitest";

// Action-seam tests: the module and Next's cache are mocked, so these verify
// the boundary itself — invalid input never reaches the module; valid input
// delegates and reports success (reconciliation actions suite is prior art).

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/categories", () => ({
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { createCategory, updateCategory, deleteCategory } from "@/lib/categories";
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "@/app/actions/categories";
import { createCategorySchema } from "@/lib/categories/schemas";
import { DefaultCategoryDeletionError } from "@/lib/categories/errors";
import { zodResolver } from "@hookform/resolvers/zod";

const VALID_INPUT = {
  name: "אוכל בחוץ",
  type: "expense" as const,
  icon: "Utensils",
  color: "#6366f1",
};

const VALID_ID = "3f8a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";

function uniqueViolation(): Error & { code: string } {
  const err = new Error(
    'duplicate key value violates unique constraint "uq_category_name"',
  ) as Error & { code: string };
  err.code = "23505";
  return err;
}

/** Drizzle wraps the PostgresError — the SQLSTATE lives on error.cause. */
function wrappedUniqueViolation(): Error {
  return new Error("Failed query: insert into categories ...", { cause: uniqueViolation() });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── createCategoryAction ──────────────────────────────────────────────────────

describe("createCategoryAction", () => {
  it("rejects invalid input with a formatted Hebrew error without touching the module", async () => {
    const result = await createCategoryAction({ ...VALID_INPUT, name: "" });

    expect(result.error).toContain("שם חובה");
    expect(result.fieldErrors?.name).toBe("שם חובה");
    expect(createCategory).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects non-object input without touching the module", async () => {
    const result = await createCategoryAction("not an object");

    expect(result.error).toBeTruthy();
    expect(createCategory).not.toHaveBeenCalled();
  });

  it("maps every invalid field into fieldErrors", async () => {
    const result = await createCategoryAction({ name: "", type: "bogus", icon: "", color: "red" });

    expect(result.fieldErrors).toMatchObject({
      name: "שם חובה",
      type: "יש לבחור סוג קטגוריה",
      icon: "יש לבחור אייקון",
      color: "צבע חייב להיות בפורמט hex",
    });
    expect(createCategory).not.toHaveBeenCalled();
  });

  it("delegates valid input to the module and revalidates the affected pages", async () => {
    vi.mocked(createCategory).mockResolvedValue("new-id");

    const result = await createCategoryAction(VALID_INPUT);

    expect(result).toEqual({ id: "new-id" });
    expect(createCategory).toHaveBeenCalledWith(VALID_INPUT);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("trims the name before delegating", async () => {
    vi.mocked(createCategory).mockResolvedValue("new-id");

    await createCategoryAction({ ...VALID_INPUT, name: "  אוכל בחוץ  " });

    expect(createCategory).toHaveBeenCalledWith(VALID_INPUT);
  });

  it("surfaces a duplicate-name violation as an inline field error", async () => {
    vi.mocked(createCategory).mockRejectedValue(uniqueViolation());

    const result = await createCategoryAction(VALID_INPUT);

    expect(result.fieldErrors?.name).toBe("קטגוריה בשם זה כבר קיימת");
    expect(result.error).toBe("קטגוריה בשם זה כבר קיימת");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a Drizzle-wrapped duplicate-name violation (code on error.cause)", async () => {
    vi.mocked(createCategory).mockRejectedValue(wrappedUniqueViolation());

    const result = await createCategoryAction(VALID_INPUT);

    expect(result.fieldErrors?.name).toBe("קטגוריה בשם זה כבר קיימת");
  });

  it("rethrows unexpected module failures", async () => {
    vi.mocked(createCategory).mockRejectedValue(new Error("connection refused"));

    await expect(createCategoryAction(VALID_INPUT)).rejects.toThrow("connection refused");
  });
});

// ── updateCategoryAction ──────────────────────────────────────────────────────

describe("updateCategoryAction", () => {
  it("rejects a malformed id without touching the module", async () => {
    const result = await updateCategoryAction({ id: "not-a-uuid", ...VALID_INPUT });

    expect(result.error).toContain("מזהה קטגוריה לא תקין");
    expect(updateCategory).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects invalid field values without touching the module", async () => {
    const result = await updateCategoryAction({ id: VALID_ID, color: "not-a-color" });

    expect(result.fieldErrors?.color).toBe("צבע חייב להיות בפורמט hex");
    expect(updateCategory).not.toHaveBeenCalled();
  });

  it("delegates valid input to the module and revalidates", async () => {
    const result = await updateCategoryAction({ id: VALID_ID, ...VALID_INPUT });

    expect(result).toEqual({ updated: true });
    expect(updateCategory).toHaveBeenCalledWith(VALID_ID, VALID_INPUT);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("accepts partial changes", async () => {
    const result = await updateCategoryAction({ id: VALID_ID, name: "שם חדש" });

    expect(result).toEqual({ updated: true });
    expect(updateCategory).toHaveBeenCalledWith(VALID_ID, { name: "שם חדש" });
  });

  it("rejects an update with no fields to change without touching the module", async () => {
    const result = await updateCategoryAction({ id: VALID_ID });

    expect(result.error).toBe("לא סופקו שדות לעדכון");
    expect(updateCategory).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate-name violation as an inline field error", async () => {
    vi.mocked(updateCategory).mockRejectedValue(uniqueViolation());

    const result = await updateCategoryAction({ id: VALID_ID, name: "כפול" });

    expect(result.fieldErrors?.name).toBe("קטגוריה בשם זה כבר קיימת");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ── deleteCategoryAction ──────────────────────────────────────────────────────

describe("deleteCategoryAction", () => {
  it("rejects a malformed id without touching the module", async () => {
    const result = await deleteCategoryAction({ id: "42" });

    expect(result.error).toContain("מזהה קטגוריה לא תקין");
    expect(deleteCategory).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("delegates valid input to the module and revalidates", async () => {
    const result = await deleteCategoryAction({ id: VALID_ID });

    expect(result).toEqual({ deleted: true });
    expect(deleteCategory).toHaveBeenCalledWith(VALID_ID);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("returns a Hebrew error for default-category deletion without revalidating", async () => {
    // Typed sentinel from the module's public error surface — not a string match.
    vi.mocked(deleteCategory).mockRejectedValue(new DefaultCategoryDeletionError());

    const result = await deleteCategoryAction({ id: VALID_ID });

    expect(result.error).toBe("לא ניתן למחוק קטגוריית ברירת מחדל");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

// ── client/server schema parity ───────────────────────────────────────────────
//
// The RHF resolver runs the SAME module-owned schema the action boundary runs,
// so the client can never accept what the server rejects. Exercised (not
// assumed) because zod v4 support in @hookform/resolvers is load-bearing here.

describe("zodResolver runs the module-owned schema (zod v4 compatibility)", () => {
  const resolver = zodResolver(createCategorySchema);
  const resolverOptions = { fields: {}, shouldUseNativeValidation: false };

  it("produces the same Hebrew message the server action produces", async () => {
    const clientSide = await resolver(
      { ...VALID_INPUT, name: "" },
      undefined,
      resolverOptions as never,
    );
    const serverSide = await createCategoryAction({ ...VALID_INPUT, name: "" });

    const clientMessage = (clientSide.errors as Record<string, { message?: string }>).name?.message;
    expect(clientMessage).toBe("שם חובה");
    expect(serverSide.fieldErrors?.name).toBe(clientMessage);
  });

  it("accepts values the server accepts", async () => {
    const clientSide = await resolver(VALID_INPUT, undefined, resolverOptions as never);

    expect(clientSide.errors).toEqual({});
    expect(clientSide.values).toEqual(VALID_INPUT);
  });
});
