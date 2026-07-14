import { describe, it, expect, vi, beforeEach } from "vitest";

// Action-seam tests: the module and Next's cache are mocked, so these verify
// the boundary itself — invalid input never reaches the module; valid input
// delegates and reports success (categories/rules actions suites are prior art).

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/transactions", () => ({
  updateTransaction: vi.fn(),
}));

vi.mock("@/lib/merchant-memory", () => ({
  changeTransactionCategory: vi.fn(async () => ({
    fanOutCount: 0,
    fannedOut: [],
    wasCorrection: false,
  })),
  bulkChangeTransactionCategories: vi.fn(async () => ({ fanOutCount: 0, fannedOut: [] })),
  undoCategoryFanOut: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { updateTransaction } from "@/lib/transactions";
import {
  changeTransactionCategory,
  bulkChangeTransactionCategories,
  undoCategoryFanOut,
} from "@/lib/merchant-memory";
import {
  updateTransactionAction,
  bulkCategorizeAction,
  undoFanOutAction,
} from "@/app/actions/transactions";

const VALID_TXN_ID = "3f8a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const VALID_CATEGORY_ID = "7c6b5a4d-3e2f-4a1b-9c8d-0e1f2a3b4c5d";
const OTHER_TXN_ID = "1a2b3c4d-5e6f-4a1b-9c8d-0e1f2a3b4c5d";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── updateTransactionAction ────────────────────────────────────────────────────

describe("updateTransactionAction", () => {
  it("rejects a malformed id without touching the module", async () => {
    const result = await updateTransactionAction({ id: "not-a-uuid", customDescription: "קפה" });

    expect(result.error).toContain("מזהה עסקה לא תקין");
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects non-object input without touching the module", async () => {
    const result = await updateTransactionAction("not an object");

    expect(result.error).toBeTruthy();
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("rejects a malformed categoryId without touching the module", async () => {
    const result = await updateTransactionAction({ id: VALID_TXN_ID, categoryId: "not-a-uuid" });

    expect(result.fieldErrors?.categoryId).toBe("מזהה קטגוריה לא תקין");
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(changeTransactionCategory).not.toHaveBeenCalled();
  });

  it("rejects an update with no fields to change without touching the module", async () => {
    const result = await updateTransactionAction({ id: VALID_TXN_ID });

    expect(result.error).toBe("לא סופקו שדות לעדכון");
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("delegates a custom-description edit to the module and revalidates the affected pages", async () => {
    const result = await updateTransactionAction({
      id: VALID_TXN_ID,
      customDescription: "קפה עם חברים",
    });

    expect(result).toEqual({ updated: true });
    expect(updateTransaction).toHaveBeenCalledWith(VALID_TXN_ID, {
      customDescription: "קפה עם חברים",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("routes a category assignment through merchant memory and reports the fan-out", async () => {
    const fannedOut = [
      { id: OTHER_TXN_ID, previousCategoryId: null, previousCategorySource: null },
    ];
    vi.mocked(changeTransactionCategory).mockResolvedValueOnce({
      fanOutCount: 1,
      fannedOut,
      wasCorrection: true,
    });

    const result = await updateTransactionAction({
      id: VALID_TXN_ID,
      categoryId: VALID_CATEGORY_ID,
    });

    expect(result).toEqual({ updated: true, fanOutCount: 1, fannedOut });
    expect(changeTransactionCategory).toHaveBeenCalledWith(VALID_TXN_ID, VALID_CATEGORY_ID);
    // Assignment does not go through the plain update path.
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("allows clearing the custom description back to null (display reverts to the original description)", async () => {
    const result = await updateTransactionAction({ id: VALID_TXN_ID, customDescription: null });

    expect(result).toEqual({ updated: true });
    expect(updateTransaction).toHaveBeenCalledWith(VALID_TXN_ID, { customDescription: null });
  });

  it("clears the category back to null via the plain update path (no memory write)", async () => {
    const result = await updateTransactionAction({ id: VALID_TXN_ID, categoryId: null });

    expect(result).toEqual({ updated: true });
    expect(updateTransaction).toHaveBeenCalledWith(VALID_TXN_ID, { categoryId: null });
    expect(changeTransactionCategory).not.toHaveBeenCalled();
  });

  it("rethrows unexpected module failures", async () => {
    vi.mocked(changeTransactionCategory).mockRejectedValueOnce(new Error("connection refused"));

    await expect(
      updateTransactionAction({ id: VALID_TXN_ID, categoryId: VALID_CATEGORY_ID }),
    ).rejects.toThrow("connection refused");
  });
});

// ── bulkCategorizeAction ────────────────────────────────────────────────────────

describe("bulkCategorizeAction", () => {
  it("rejects an empty transaction id list without touching the module", async () => {
    const result = await bulkCategorizeAction({
      transactionIds: [],
      categoryId: VALID_CATEGORY_ID,
    });

    expect(result.error).toContain("יש לספק לפחות עסקה אחת");
    expect(bulkChangeTransactionCategories).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a malformed categoryId without touching the module", async () => {
    const result = await bulkCategorizeAction({
      transactionIds: [VALID_TXN_ID],
      categoryId: "not-a-uuid",
    });

    expect(result.fieldErrors?.categoryId).toBe("יש לבחור קטגוריה");
    expect(bulkChangeTransactionCategories).not.toHaveBeenCalled();
  });

  it("rejects a malformed transaction id within the list without touching the module", async () => {
    const result = await bulkCategorizeAction({
      transactionIds: [VALID_TXN_ID, "not-a-uuid"],
      categoryId: VALID_CATEGORY_ID,
    });

    expect(result.fieldErrors?.["transactionIds.1"]).toBe("מזהה עסקה לא תקין");
    expect(bulkChangeTransactionCategories).not.toHaveBeenCalled();
  });

  it("rejects non-object input without touching the module", async () => {
    const result = await bulkCategorizeAction("not an object");

    expect(result.error).toBeTruthy();
    expect(bulkChangeTransactionCategories).not.toHaveBeenCalled();
  });

  it("delegates valid input to merchant memory in a single call, reports fan-out, revalidates once", async () => {
    const fannedOut = [
      {
        id: "9f8e7d6c-5b4a-4f3e-8d2c-1b0a9f8e7d6c",
        previousCategoryId: null,
        previousCategorySource: null,
      },
    ];
    vi.mocked(bulkChangeTransactionCategories).mockResolvedValueOnce({
      fanOutCount: 1,
      fannedOut,
    });

    const result = await bulkCategorizeAction({
      transactionIds: [VALID_TXN_ID, OTHER_TXN_ID],
      categoryId: VALID_CATEGORY_ID,
    });

    expect(result).toEqual({ updated: 2, fanOutCount: 1, fannedOut });
    expect(bulkChangeTransactionCategories).toHaveBeenCalledTimes(1);
    expect(bulkChangeTransactionCategories).toHaveBeenCalledWith(
      [VALID_TXN_ID, OTHER_TXN_ID],
      VALID_CATEGORY_ID,
    );
    // Bulk touches many rows — revalidate ONCE per action call, not per row.
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/transactions"], ["/"]]);
  });

  it("rethrows unexpected module failures", async () => {
    vi.mocked(bulkChangeTransactionCategories).mockRejectedValue(new Error("connection refused"));

    await expect(
      bulkCategorizeAction({ transactionIds: [VALID_TXN_ID], categoryId: VALID_CATEGORY_ID }),
    ).rejects.toThrow("connection refused");
  });
});

// ── undoFanOutAction ────────────────────────────────────────────────────────────

describe("undoFanOutAction", () => {
  it("rejects an empty rows list without touching the module", async () => {
    const result = await undoFanOutAction({ rows: [] });

    expect(result.error).toContain("אין החלה לביטול");
    expect(undoCategoryFanOut).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a malformed previous source without touching the module", async () => {
    const result = await undoFanOutAction({
      rows: [{ id: VALID_TXN_ID, previousCategoryId: null, previousCategorySource: "hacked" }],
    });

    expect(result.error).toBeTruthy();
    expect(undoCategoryFanOut).not.toHaveBeenCalled();
  });

  it("delegates valid rows to merchant memory and revalidates", async () => {
    const rows = [
      { id: VALID_TXN_ID, previousCategoryId: VALID_CATEGORY_ID, previousCategorySource: "ai" },
      { id: OTHER_TXN_ID, previousCategoryId: null, previousCategorySource: null },
    ];

    const result = await undoFanOutAction({ rows });

    expect(result).toEqual({ undone: 2 });
    expect(undoCategoryFanOut).toHaveBeenCalledWith(rows);
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
  });
});
