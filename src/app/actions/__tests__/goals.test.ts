import { describe, it, expect, vi, beforeEach } from "vitest";

// Action-seam tests: the DB-backed CRUD is mocked, so these verify the
// boundary itself (invalid input never reaches the module) and the
// per-month -> cumulative derivation, which runs for real (imported from the
// pure "@/lib/goals/progress" submodule, untouched by this mock).

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/goals", () => ({
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { createGoal, updateGoal, deleteGoal } from "@/lib/goals";
import { cumulativeTargetFromMonthly } from "@/lib/goals/progress";
import { InvalidGoalTargetMonthError } from "@/lib/goals/errors";
import { createGoalAction, updateGoalAction, deleteGoalAction } from "@/app/actions/goals";

const VALID_ID = "3f8a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";

const VALID_CUMULATIVE_INPUT = {
  mode: "cumulative" as const,
  name: "קרן חירום",
  startMonth: "2026-01",
  openingAmount: 5000,
  targetAmount: 30000,
  targetMonth: "2026-12" as string | null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── createGoalAction ─────────────────────────────────────────────────────────

describe("createGoalAction", () => {
  it("rejects invalid input with a formatted Hebrew error without touching the module", async () => {
    const result = await createGoalAction({ ...VALID_CUMULATIVE_INPUT, name: "" });

    expect(result.error).toContain("שם חובה");
    expect(result.fieldErrors?.name).toBe("שם חובה");
    expect(createGoal).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a malformed start month without touching the module", async () => {
    const result = await createGoalAction({ ...VALID_CUMULATIVE_INPUT, startMonth: "2026-13" });

    expect(result.fieldErrors?.startMonth).toBeTruthy();
    expect(createGoal).not.toHaveBeenCalled();
  });

  it("rejects a non-positive cumulative target amount", async () => {
    const result = await createGoalAction({ ...VALID_CUMULATIVE_INPUT, targetAmount: 0 });

    expect(result.fieldErrors?.targetAmount).toBeTruthy();
    expect(createGoal).not.toHaveBeenCalled();
  });

  it("rejects a monthly-mode goal missing its deadline (no span to derive over)", async () => {
    const result = await createGoalAction({
      mode: "monthly",
      name: "חופשה",
      startMonth: "2026-01",
      openingAmount: 0,
      monthlyAmount: 1000,
      targetMonth: null,
    });

    expect(result.fieldErrors?.targetMonth).toBeTruthy();
    expect(createGoal).not.toHaveBeenCalled();
  });

  it("delegates a cumulative-mode goal to the module and revalidates", async () => {
    vi.mocked(createGoal).mockResolvedValue("new-id");

    const result = await createGoalAction(VALID_CUMULATIVE_INPUT);

    expect(result).toEqual({ id: "new-id", targetAmount: 30000 });
    expect(createGoal).toHaveBeenCalledWith({
      name: "קרן חירום",
      startMonth: "2026-01",
      openingAmount: 5000,
      targetMonth: "2026-12",
      targetAmount: 30000,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("derives the byte-identical stored goal from per-month phrasing as the equivalent cumulative form", async () => {
    vi.mocked(createGoal).mockResolvedValue("new-id");

    // "₪1000 לחודש, ינואר עד דצמבר 2026" over the opening amount above.
    const monthlyAmount = (30000 - 5000) / 12;
    const result = await createGoalAction({
      mode: "monthly",
      name: "קרן חירום",
      startMonth: "2026-01",
      openingAmount: 5000,
      monthlyAmount,
      targetMonth: "2026-12",
    });

    // The module's own pure derivation is the reference: the action must
    // resolve to exactly what it would compute, not an approximation.
    const expectedTargetAmount = cumulativeTargetFromMonthly(
      5000,
      monthlyAmount,
      { year: 2026, month: 1 },
      { year: 2026, month: 12 },
    );

    expect(createGoal).toHaveBeenCalledWith({
      name: "קרן חירום",
      startMonth: "2026-01",
      openingAmount: 5000,
      targetMonth: "2026-12",
      targetAmount: expectedTargetAmount,
    });
    // Cross-checked against the equivalent cumulative-mode call above:
    // identical stored shape, down to the number.
    expect(vi.mocked(createGoal).mock.calls[0][0]).toEqual({
      name: "קרן חירום",
      startMonth: "2026-01",
      openingAmount: 5000,
      targetMonth: "2026-12",
      targetAmount: 30000,
    });
    // The result the client's optimistic row reads from also carries the
    // same derived amount, so it never has to re-derive it itself.
    expect(result.targetAmount).toBe(30000);
  });

  it("surfaces InvalidGoalTargetMonthError as a field error on targetMonth, never a thrown 500", async () => {
    vi.mocked(createGoal).mockRejectedValue(new InvalidGoalTargetMonthError());

    const result = await createGoalAction(VALID_CUMULATIVE_INPUT);

    expect(result.error).toBeTruthy();
    expect(result.fieldErrors?.targetMonth).toBeTruthy();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rethrows unexpected module failures", async () => {
    vi.mocked(createGoal).mockRejectedValue(new Error("connection refused"));

    await expect(createGoalAction(VALID_CUMULATIVE_INPUT)).rejects.toThrow("connection refused");
  });
});

// ── updateGoalAction ─────────────────────────────────────────────────────────

describe("updateGoalAction", () => {
  it("rejects a malformed id without touching the module", async () => {
    const result = await updateGoalAction({ id: "not-a-uuid", ...VALID_CUMULATIVE_INPUT });

    expect(result.error).toContain("מזהה יעד לא תקין");
    expect(updateGoal).not.toHaveBeenCalled();
  });

  it("delegates a cumulative-mode update to the module and revalidates", async () => {
    const result = await updateGoalAction({ id: VALID_ID, ...VALID_CUMULATIVE_INPUT });

    expect(result).toEqual({ updated: true, targetAmount: 30000 });
    expect(updateGoal).toHaveBeenCalledWith(VALID_ID, {
      name: "קרן חירום",
      startMonth: "2026-01",
      openingAmount: 5000,
      targetMonth: "2026-12",
      targetAmount: 30000,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("derives the same cumulative target amount for a monthly-mode update", async () => {
    const monthlyAmount = 500;
    const result = await updateGoalAction({
      id: VALID_ID,
      mode: "monthly",
      name: "חופשה",
      startMonth: "2026-03",
      openingAmount: 0,
      monthlyAmount,
      targetMonth: "2026-08",
    });

    const expectedTargetAmount = cumulativeTargetFromMonthly(
      0,
      monthlyAmount,
      { year: 2026, month: 3 },
      { year: 2026, month: 8 },
    );
    expect(result.targetAmount).toBe(expectedTargetAmount);

    expect(updateGoal).toHaveBeenCalledWith(VALID_ID, {
      name: "חופשה",
      startMonth: "2026-03",
      openingAmount: 0,
      targetMonth: "2026-08",
      targetAmount: expectedTargetAmount,
    });
  });

  it("surfaces InvalidGoalTargetMonthError as a field error on targetMonth", async () => {
    vi.mocked(updateGoal).mockRejectedValue(new InvalidGoalTargetMonthError());

    const result = await updateGoalAction({ id: VALID_ID, ...VALID_CUMULATIVE_INPUT });

    expect(result.fieldErrors?.targetMonth).toBeTruthy();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rethrows unexpected module failures", async () => {
    vi.mocked(updateGoal).mockRejectedValue(new Error("connection refused"));

    await expect(updateGoalAction({ id: VALID_ID, ...VALID_CUMULATIVE_INPUT })).rejects.toThrow(
      "connection refused",
    );
  });
});

// ── deleteGoalAction ─────────────────────────────────────────────────────────

describe("deleteGoalAction", () => {
  it("rejects a malformed id without touching the module", async () => {
    const result = await deleteGoalAction({ id: "42" });

    expect(result.error).toContain("מזהה יעד לא תקין");
    expect(deleteGoal).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("delegates valid input to the module and revalidates", async () => {
    const result = await deleteGoalAction({ id: VALID_ID });

    expect(result).toEqual({ deleted: true });
    expect(deleteGoal).toHaveBeenCalledWith(VALID_ID);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});
