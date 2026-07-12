import { describe, it, expect, vi, beforeEach } from "vitest";

// Action-seam tests: the module and Next's cache are mocked, so these verify
// the boundary itself — invalid input never reaches the module; valid input
// delegates and reports success (categories actions suite is prior art).

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/categories/rules", () => ({
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
}));

// The retroactive actions live in the same file; mock their module so
// importing the actions never touches the DB driver.
vi.mock("@/lib/categories/retroactive", () => ({
  previewRetroactiveApply: vi.fn(),
  applyRetroactively: vi.fn(),
  drizzleRetroactiveStore: {},
}));

import { revalidatePath } from "next/cache";
import { createRule, updateRule, deleteRule } from "@/lib/categories/rules";
import { createRuleAction, updateRuleAction, deleteRuleAction } from "@/app/actions/rules";
import { createRuleSchema } from "@/lib/categories/schemas";
import { zodResolver } from "@hookform/resolvers/zod";

const VALID_CATEGORY_ID = "3f8a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";
const VALID_RULE_ID = "7c6b5a4d-3e2f-4a1b-9c8d-0e1f2a3b4c5d";

const VALID_INPUT = {
  categoryId: VALID_CATEGORY_ID,
  matchType: "contains" as const,
  pattern: "שופרסל",
  priority: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── createRuleAction ──────────────────────────────────────────────────────────

describe("createRuleAction", () => {
  it("rejects an empty pattern with a formatted Hebrew error without touching the module", async () => {
    const result = await createRuleAction({ ...VALID_INPUT, pattern: "" });

    expect(result.error).toContain("תבנית חובה");
    expect(result.fieldErrors?.pattern).toBe("תבנית חובה");
    expect(createRule).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects non-object input without touching the module", async () => {
    const result = await createRuleAction("not an object");

    expect(result.error).toBeTruthy();
    expect(createRule).not.toHaveBeenCalled();
  });

  it("maps every invalid field into fieldErrors", async () => {
    const result = await createRuleAction({
      categoryId: "not-a-uuid",
      matchType: "bogus",
      pattern: "",
      priority: -1,
    });

    expect(result.fieldErrors).toMatchObject({
      categoryId: "יש לבחור קטגוריה",
      matchType: "יש לבחור סוג התאמה",
      pattern: "תבנית חובה",
      priority: "עדיפות לא יכולה להיות שלילית",
    });
    expect(createRule).not.toHaveBeenCalled();
  });

  it("rejects a non-integer priority", async () => {
    const result = await createRuleAction({ ...VALID_INPUT, priority: 1.5 });

    expect(result.fieldErrors?.priority).toBe("עדיפות חייבת להיות מספר שלם");
    expect(createRule).not.toHaveBeenCalled();
  });

  it("rejects a regex-type rule whose pattern does not compile", async () => {
    const result = await createRuleAction({
      ...VALID_INPUT,
      matchType: "regex",
      pattern: "שופרסל(",
    });

    expect(result.fieldErrors?.pattern).toBe("ביטוי רגולרי לא תקין");
    expect(createRule).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts a regex-type rule whose pattern compiles", async () => {
    vi.mocked(createRule).mockResolvedValue("new-id");

    const result = await createRuleAction({
      ...VALID_INPUT,
      matchType: "regex",
      pattern: "^שופרסל \\d+$",
    });

    expect(result).toEqual({ id: "new-id" });
  });

  it("does not regex-compile patterns of non-regex match types", async () => {
    vi.mocked(createRule).mockResolvedValue("new-id");

    // "(" is an invalid regex but a perfectly valid `contains` pattern.
    const result = await createRuleAction({ ...VALID_INPUT, pattern: "(" });

    expect(result).toEqual({ id: "new-id" });
  });

  it("delegates valid input to the module and revalidates the affected pages", async () => {
    vi.mocked(createRule).mockResolvedValue("new-id");

    const result = await createRuleAction(VALID_INPUT);

    expect(result).toEqual({ id: "new-id" });
    expect(createRule).toHaveBeenCalledWith(VALID_INPUT);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
  });

  it("rethrows unexpected module failures", async () => {
    vi.mocked(createRule).mockRejectedValue(new Error("connection refused"));

    await expect(createRuleAction(VALID_INPUT)).rejects.toThrow("connection refused");
  });
});

// ── updateRuleAction ──────────────────────────────────────────────────────────

describe("updateRuleAction", () => {
  it("rejects a malformed id without touching the module", async () => {
    const result = await updateRuleAction({ id: "not-a-uuid", ...VALID_INPUT });

    expect(result.error).toContain("מזהה כלל לא תקין");
    expect(updateRule).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects invalid field values without touching the module", async () => {
    const result = await updateRuleAction({ id: VALID_RULE_ID, pattern: "" });

    expect(result.fieldErrors?.pattern).toBe("תבנית חובה");
    expect(updateRule).not.toHaveBeenCalled();
  });

  it("rejects an update with no fields to change without touching the module", async () => {
    const result = await updateRuleAction({ id: VALID_RULE_ID });

    expect(result.error).toBe("לא סופקו שדות לעדכון");
    expect(updateRule).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects a regex-type update whose pattern does not compile", async () => {
    const result = await updateRuleAction({
      id: VALID_RULE_ID,
      matchType: "regex",
      pattern: "[a-z",
    });

    expect(result.fieldErrors?.pattern).toBe("ביטוי רגולרי לא תקין");
    expect(updateRule).not.toHaveBeenCalled();
  });

  it("delegates valid input to the module and revalidates", async () => {
    const result = await updateRuleAction({ id: VALID_RULE_ID, ...VALID_INPUT });

    expect(result).toEqual({ updated: true });
    expect(updateRule).toHaveBeenCalledWith(VALID_RULE_ID, VALID_INPUT);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
  });

  it("accepts partial changes", async () => {
    const result = await updateRuleAction({ id: VALID_RULE_ID, priority: 5 });

    expect(result).toEqual({ updated: true });
    expect(updateRule).toHaveBeenCalledWith(VALID_RULE_ID, { priority: 5 });
  });

  // pattern and matchType must travel together — otherwise a partial update
  // could smuggle an uncompilable pattern under an existing regex rule (or
  // flip a rule to regex without re-validating its pattern).

  it("rejects a pattern update that omits the match type", async () => {
    const result = await updateRuleAction({ id: VALID_RULE_ID, pattern: "שופרסל(" });

    expect(result.fieldErrors?.matchType).toBe("תבנית וסוג התאמה מתעדכנים יחד");
    expect(updateRule).not.toHaveBeenCalled();
  });

  it("rejects a match-type update that omits the pattern", async () => {
    const result = await updateRuleAction({ id: VALID_RULE_ID, matchType: "regex" });

    expect(result.fieldErrors?.pattern).toBe("תבנית וסוג התאמה מתעדכנים יחד");
    expect(updateRule).not.toHaveBeenCalled();
  });
});

// ── deleteRuleAction ──────────────────────────────────────────────────────────

describe("deleteRuleAction", () => {
  it("rejects a malformed id without touching the module", async () => {
    const result = await deleteRuleAction({ id: "42" });

    expect(result.error).toContain("מזהה כלל לא תקין");
    expect(deleteRule).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("delegates valid input to the module and revalidates", async () => {
    const result = await deleteRuleAction({ id: VALID_RULE_ID });

    expect(result).toEqual({ deleted: true });
    expect(deleteRule).toHaveBeenCalledWith(VALID_RULE_ID);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
  });
});

// ── client/server schema parity ───────────────────────────────────────────────
//
// The RHF resolver runs the SAME module-owned schema the action boundary runs,
// so the client can never accept what the server rejects — including the
// regex-compile refinement.

describe("zodResolver runs the module-owned rule schema", () => {
  const resolver = zodResolver(createRuleSchema);
  const resolverOptions = { fields: {}, shouldUseNativeValidation: false };

  it("produces the same Hebrew regex error the server action produces", async () => {
    const invalid = { ...VALID_INPUT, matchType: "regex" as const, pattern: "שופרסל(" };

    const clientSide = await resolver(invalid, undefined, resolverOptions as never);
    const serverSide = await createRuleAction(invalid);

    const clientMessage = (clientSide.errors as Record<string, { message?: string }>).pattern
      ?.message;
    expect(clientMessage).toBe("ביטוי רגולרי לא תקין");
    expect(serverSide.fieldErrors?.pattern).toBe(clientMessage);
  });

  it("accepts values the server accepts", async () => {
    const clientSide = await resolver(VALID_INPUT, undefined, resolverOptions as never);

    expect(clientSide.errors).toEqual({});
    expect(clientSide.values).toEqual(VALID_INPUT);
  });
});
