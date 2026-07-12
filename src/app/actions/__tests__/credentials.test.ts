import { describe, it, expect, vi, beforeEach } from "vitest";

// Action-seam tests: the module and Next's cache are mocked, so these verify
// the boundary itself — invalid input never reaches the module; valid input
// delegates and reports success (categories actions suite is prior art).
//
// Zero-leak: every fixture is obviously fake (000000000 / fake-password);
// no real credential value ever appears here.

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/credentials", () => ({
  addCredential: vi.fn(),
  updateCredential: vi.fn(),
  removeCredential: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { addCredential, updateCredential, removeCredential } from "@/lib/credentials";
import {
  addCredentialAction,
  updateCredentialAction,
  deleteCredentialAction,
} from "@/app/actions/credentials";
import { addCredentialSchema, editCredentialSchema } from "@/lib/credentials/schemas";
import { CredentialNotFoundError } from "@/lib/credentials/errors";
import { zodResolver } from "@hookform/resolvers/zod";

const FAKE_DISCOUNT_FIELDS = { id: "000000000", password: "fake-password", num: "000000" };
const FAKE_MAX_FIELDS = { username: "fake-user", password: "fake-password" };

const VALID_DISCOUNT_INPUT = {
  bankType: "discount" as const,
  displayName: "חשבון בדיקה",
  credentials: FAKE_DISCOUNT_FIELDS,
};

const VALID_MAX_INPUT = {
  bankType: "max" as const,
  displayName: "כרטיס בדיקה",
  credentials: FAKE_MAX_FIELDS,
};

const VALID_ID = "3f8a2b1c-4d5e-4f6a-8b7c-9d0e1f2a3b4c";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── addCredentialAction ───────────────────────────────────────────────────────

describe("addCredentialAction", () => {
  it("rejects a blank display name with a Hebrew field error without touching the module", async () => {
    const result = await addCredentialAction({ ...VALID_DISCOUNT_INPUT, displayName: "" });

    expect(result.error).toContain("שם תצוגה חובה");
    expect(result.fieldErrors?.displayName).toBe("שם תצוגה חובה");
    expect(addCredential).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects non-object input without touching the module", async () => {
    const result = await addCredentialAction("not an object");

    expect(result.error).toBeTruthy();
    expect(addCredential).not.toHaveBeenCalled();
  });

  it("maps missing Discount fields (national ID, password, account number) into fieldErrors", async () => {
    const result = await addCredentialAction({
      bankType: "discount",
      displayName: "חשבון בדיקה",
      credentials: { id: "", password: "", num: "" },
    });

    expect(result.fieldErrors).toMatchObject({
      "credentials.id": "תעודת זהות חובה",
      "credentials.password": "סיסמה חובה",
      "credentials.num": "מספר חשבון חובה",
    });
    expect(addCredential).not.toHaveBeenCalled();
  });

  it("maps missing Max/Cal fields (internet username, password) into fieldErrors", async () => {
    const result = await addCredentialAction({
      bankType: "max",
      displayName: "כרטיס בדיקה",
      credentials: { username: "", password: "" },
    });

    expect(result.fieldErrors).toMatchObject({
      "credentials.username": "שם משתמש חובה",
      "credentials.password": "סיסמה חובה",
    });
    expect(addCredential).not.toHaveBeenCalled();
  });

  it("rejects an unknown bank type without touching the module", async () => {
    const result = await addCredentialAction({
      bankType: "hapoalim",
      displayName: "חשבון בדיקה",
      credentials: FAKE_MAX_FIELDS,
    });

    expect(result.error).toBeTruthy();
    expect(addCredential).not.toHaveBeenCalled();
  });

  it("delegates a valid Discount credential to the module and revalidates the affected pages", async () => {
    vi.mocked(addCredential).mockResolvedValue("new-id");

    const result = await addCredentialAction(VALID_DISCOUNT_INPUT);

    expect(result).toEqual({ id: "new-id" });
    expect(addCredential).toHaveBeenCalledWith("discount", "חשבון בדיקה", FAKE_DISCOUNT_FIELDS);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/sync");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
  });

  it("delegates a valid Max credential keyed by internet username (not national ID)", async () => {
    vi.mocked(addCredential).mockResolvedValue("new-id");

    const result = await addCredentialAction(VALID_MAX_INPUT);

    expect(result).toEqual({ id: "new-id" });
    expect(addCredential).toHaveBeenCalledWith("max", "כרטיס בדיקה", FAKE_MAX_FIELDS);
  });

  it("strips fields that belong to the other bank's shape before delegating", async () => {
    vi.mocked(addCredential).mockResolvedValue("new-id");

    await addCredentialAction({
      ...VALID_MAX_INPUT,
      // Superset form state carries blank Discount fields too.
      credentials: { ...FAKE_MAX_FIELDS, id: "", num: "" },
    });

    expect(addCredential).toHaveBeenCalledWith("max", "כרטיס בדיקה", FAKE_MAX_FIELDS);
  });

  it("rethrows unexpected module failures", async () => {
    vi.mocked(addCredential).mockRejectedValue(new Error("connection refused"));

    await expect(addCredentialAction(VALID_DISCOUNT_INPUT)).rejects.toThrow("connection refused");
  });
});

// ── updateCredentialAction ────────────────────────────────────────────────────

describe("updateCredentialAction", () => {
  it("rejects a malformed id without touching the module", async () => {
    const result = await updateCredentialAction({
      id: "not-a-uuid",
      bankType: "discount",
      displayName: "חשבון בדיקה",
    });

    expect(result.error).toContain("מזהה חשבון לא תקין");
    expect(updateCredential).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects incomplete replacement credentials without touching the module", async () => {
    const result = await updateCredentialAction({
      id: VALID_ID,
      bankType: "discount",
      displayName: "חשבון בדיקה",
      credentials: { id: "000000000", password: "", num: "000000" },
    });

    expect(result.fieldErrors?.["credentials.password"]).toBe("סיסמה חובה");
    expect(updateCredential).not.toHaveBeenCalled();
  });

  it("updates only the display name when no replacement credentials are sent", async () => {
    const result = await updateCredentialAction({
      id: VALID_ID,
      bankType: "max",
      displayName: "שם חדש",
    });

    expect(result).toEqual({ updated: true });
    expect(updateCredential).toHaveBeenCalledWith(VALID_ID, {
      displayName: "שם חדש",
      rawCredentials: undefined,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("replaces the credentials when a full set (with new password) is sent", async () => {
    const result = await updateCredentialAction({
      id: VALID_ID,
      bankType: "discount",
      displayName: "חשבון בדיקה",
      credentials: FAKE_DISCOUNT_FIELDS,
    });

    expect(result).toEqual({ updated: true });
    expect(updateCredential).toHaveBeenCalledWith(VALID_ID, {
      displayName: "חשבון בדיקה",
      rawCredentials: FAKE_DISCOUNT_FIELDS,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/sync");
  });

  it("returns a Hebrew error when the credential does not exist, without revalidating", async () => {
    vi.mocked(updateCredential).mockRejectedValue(new CredentialNotFoundError(VALID_ID));

    const result = await updateCredentialAction({
      id: VALID_ID,
      bankType: "max",
      displayName: "שם חדש",
    });

    expect(result.error).toBe("חשבון הבנק לא נמצא");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rethrows unexpected module failures", async () => {
    vi.mocked(updateCredential).mockRejectedValue(new Error("connection refused"));

    await expect(
      updateCredentialAction({ id: VALID_ID, bankType: "max", displayName: "שם חדש" }),
    ).rejects.toThrow("connection refused");
  });
});

// ── deleteCredentialAction ────────────────────────────────────────────────────

describe("deleteCredentialAction", () => {
  it("rejects a malformed id without touching the module", async () => {
    const result = await deleteCredentialAction({ id: "42" });

    expect(result.error).toContain("מזהה חשבון לא תקין");
    expect(removeCredential).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("delegates valid input to the module and revalidates the cascade-affected pages", async () => {
    const result = await deleteCredentialAction({ id: VALID_ID });

    expect(result).toEqual({ deleted: true });
    expect(removeCredential).toHaveBeenCalledWith(VALID_ID);
    // Delete cascades to bank accounts and transactions.
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
    expect(revalidatePath).toHaveBeenCalledWith("/sync");
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/transactions");
  });
});

// ── client/server schema parity ───────────────────────────────────────────────
//
// The RHF resolvers run the SAME module-owned schemas the action boundary
// runs, so the client can never accept what the server rejects.

describe("zodResolver runs the module-owned credential schemas", () => {
  const resolverOptions = { fields: {}, shouldUseNativeValidation: false };

  it("add: produces the same Hebrew message the server action produces", async () => {
    const invalid = { ...VALID_DISCOUNT_INPUT, credentials: { ...FAKE_DISCOUNT_FIELDS, id: "" } };

    const clientSide = await zodResolver(addCredentialSchema)(
      invalid,
      undefined,
      resolverOptions as never,
    );
    const serverSide = await addCredentialAction(invalid);

    const clientErrors = clientSide.errors as Record<string, Record<string, { message?: string }>>;
    const clientMessage = clientErrors.credentials?.id?.message;
    expect(clientMessage).toBe("תעודת זהות חובה");
    expect(serverSide.fieldErrors?.["credentials.id"]).toBe(clientMessage);
  });

  it("add: accepts values the server accepts", async () => {
    const clientSide = await zodResolver(addCredentialSchema)(
      VALID_DISCOUNT_INPUT,
      undefined,
      resolverOptions as never,
    );

    expect(clientSide.errors).toEqual({});
    expect(clientSide.values).toEqual(VALID_DISCOUNT_INPUT);
  });

  it("edit: accepts a blank password (meaning: keep the stored one)", async () => {
    const clientSide = await zodResolver(editCredentialSchema)(
      { ...VALID_MAX_INPUT, credentials: { ...FAKE_MAX_FIELDS, password: "" } },
      undefined,
      resolverOptions as never,
    );

    expect(clientSide.errors).toEqual({});
  });

  it("edit: still requires the non-password fields, matching the server's messages", async () => {
    const clientSide = await zodResolver(editCredentialSchema)(
      { ...VALID_MAX_INPUT, credentials: { username: "", password: "" } },
      undefined,
      resolverOptions as never,
    );
    // The server sees replacement credentials only when a password was typed —
    // same per-bank schema, same message.
    const serverSide = await updateCredentialAction({
      id: VALID_ID,
      bankType: "max",
      displayName: "כרטיס בדיקה",
      credentials: { username: "", password: "fake-password" },
    });

    const clientErrors = clientSide.errors as Record<string, Record<string, { message?: string }>>;
    expect(clientErrors.credentials?.username?.message).toBe("שם משתמש חובה");
    expect(serverSide.fieldErrors?.["credentials.username"]).toBe("שם משתמש חובה");
  });
});
