import { describe, it, expect, vi, beforeEach } from "vitest";

// Action-seam tests: the DB-backed CRUD is mocked, so these verify the
// boundary itself (invalid input never reaches the module) and the typed
// error -> Hebrew field error mapping.

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/budgets", () => ({
  createBudget: vi.fn(),
  updateBudget: vi.fn(),
  deleteBudget: vi.fn(),
  setMonthlyTargets: vi.fn(),
  getBudgetForCategory: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import {
  createBudget,
  updateBudget,
  deleteBudget,
  setMonthlyTargets,
  getBudgetForCategory,
} from "@/lib/budgets";
import { DuplicateBudgetCategoryError, NonExpenseBudgetCategoryError } from "@/lib/budgets/errors";
import {
  createBudgetAction,
  updateBudgetAction,
  deleteBudgetAction,
  setMonthlyTargetsAction,
  getCategoryBudgetAction,
} from "@/app/actions/budgets";

const VALID_ID = "3f8a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const VALID_CATEGORY_ID = "7c1a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── createBudgetAction ───────────────────────────────────────────────────────

describe("createBudgetAction", () => {
  it("rejects invalid input without touching the module", async () => {
    const result = await createBudgetAction({ categoryId: "not-a-uuid", monthlyLimit: 1000 });

    expect(result.fieldErrors?.categoryId).toBeTruthy();
    expect(createBudget).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a non-positive monthly limit", async () => {
    const result = await createBudgetAction({ categoryId: VALID_CATEGORY_ID, monthlyLimit: 0 });

    expect(result.fieldErrors?.monthlyLimit).toBeTruthy();
    expect(createBudget).not.toHaveBeenCalled();
  });

  it("delegates valid input to the module and revalidates", async () => {
    vi.mocked(createBudget).mockResolvedValue("new-id");

    const result = await createBudgetAction({
      categoryId: VALID_CATEGORY_ID,
      monthlyLimit: 2000,
    });

    expect(result).toEqual({ id: "new-id" });
    expect(createBudget).toHaveBeenCalledWith({
      categoryId: VALID_CATEGORY_ID,
      monthlyLimit: 2000,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("surfaces DuplicateBudgetCategoryError as a Hebrew field error on categoryId, never a 500", async () => {
    vi.mocked(createBudget).mockRejectedValue(new DuplicateBudgetCategoryError());

    const result = await createBudgetAction({
      categoryId: VALID_CATEGORY_ID,
      monthlyLimit: 2000,
    });

    expect(result.error).toBeTruthy();
    expect(result.fieldErrors?.categoryId).toBeTruthy();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces NonExpenseBudgetCategoryError as a Hebrew field error on categoryId", async () => {
    vi.mocked(createBudget).mockRejectedValue(new NonExpenseBudgetCategoryError());

    const result = await createBudgetAction({
      categoryId: VALID_CATEGORY_ID,
      monthlyLimit: 2000,
    });

    expect(result.error).toBeTruthy();
    expect(result.fieldErrors?.categoryId).toBeTruthy();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rethrows unexpected module failures", async () => {
    vi.mocked(createBudget).mockRejectedValue(new Error("connection refused"));

    await expect(
      createBudgetAction({ categoryId: VALID_CATEGORY_ID, monthlyLimit: 2000 }),
    ).rejects.toThrow("connection refused");
  });
});

// ── updateBudgetAction ───────────────────────────────────────────────────────

describe("updateBudgetAction", () => {
  it("rejects a malformed id without touching the module", async () => {
    const result = await updateBudgetAction({ id: "not-a-uuid", monthlyLimit: 2000 });

    expect(result.error).toBeTruthy();
    expect(updateBudget).not.toHaveBeenCalled();
  });

  it("rejects a non-positive monthly limit", async () => {
    const result = await updateBudgetAction({ id: VALID_ID, monthlyLimit: -1 });

    expect(result.fieldErrors?.monthlyLimit).toBeTruthy();
    expect(updateBudget).not.toHaveBeenCalled();
  });

  it("delegates valid input to the module and revalidates", async () => {
    const result = await updateBudgetAction({ id: VALID_ID, monthlyLimit: 2500 });

    expect(result).toEqual({ updated: true });
    expect(updateBudget).toHaveBeenCalledWith(VALID_ID, { monthlyLimit: 2500 });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("rethrows unexpected module failures", async () => {
    vi.mocked(updateBudget).mockRejectedValue(new Error("connection refused"));

    await expect(updateBudgetAction({ id: VALID_ID, monthlyLimit: 2500 })).rejects.toThrow(
      "connection refused",
    );
  });
});

// ── deleteBudgetAction ───────────────────────────────────────────────────────

describe("deleteBudgetAction", () => {
  it("rejects a malformed id without touching the module", async () => {
    const result = await deleteBudgetAction({ id: "42" });

    expect(result.error).toBeTruthy();
    expect(deleteBudget).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("delegates valid input to the module and revalidates", async () => {
    const result = await deleteBudgetAction({ id: VALID_ID });

    expect(result).toEqual({ deleted: true });
    expect(deleteBudget).toHaveBeenCalledWith(VALID_ID);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});

// ── setMonthlyTargetsAction ──────────────────────────────────────────────────

describe("setMonthlyTargetsAction", () => {
  it("rejects a non-positive expense target", async () => {
    const result = await setMonthlyTargetsAction({ expenseTarget: 0, savingsTarget: null });

    expect(result.fieldErrors?.expenseTarget).toBeTruthy();
    expect(setMonthlyTargets).not.toHaveBeenCalled();
  });

  it("accepts both targets as null (clearing) and revalidates", async () => {
    const result = await setMonthlyTargetsAction({ expenseTarget: null, savingsTarget: null });

    expect(result).toEqual({ saved: true });
    expect(setMonthlyTargets).toHaveBeenCalledWith({ expenseTarget: null, savingsTarget: null });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("delegates two set targets to the module", async () => {
    const result = await setMonthlyTargetsAction({ expenseTarget: 12000, savingsTarget: 3000 });

    expect(result).toEqual({ saved: true });
    expect(setMonthlyTargets).toHaveBeenCalledWith({ expenseTarget: 12000, savingsTarget: 3000 });
  });
});

// ── getCategoryBudgetAction ──────────────────────────────────────────────────

describe("getCategoryBudgetAction", () => {
  it("rejects a malformed id without touching the module", async () => {
    const result = await getCategoryBudgetAction({ id: "not-a-uuid" });

    expect(result.hasBudget).toBe(false);
    expect(result.error).toBeTruthy();
    expect(getBudgetForCategory).not.toHaveBeenCalled();
  });

  it("reports true when the category has a budget", async () => {
    vi.mocked(getBudgetForCategory).mockResolvedValue({
      id: "b1",
      categoryId: VALID_CATEGORY_ID,
      monthlyLimit: 2000,
    });

    const result = await getCategoryBudgetAction({ id: VALID_CATEGORY_ID });

    expect(result).toEqual({ hasBudget: true });
    expect(getBudgetForCategory).toHaveBeenCalledWith(VALID_CATEGORY_ID);
  });

  it("reports false when the category has no budget", async () => {
    vi.mocked(getBudgetForCategory).mockResolvedValue(null);

    const result = await getCategoryBudgetAction({ id: VALID_CATEGORY_ID });

    expect(result).toEqual({ hasBudget: false });
  });
});
