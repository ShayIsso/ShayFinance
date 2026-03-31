import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankCredentials } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";
import { credentialSchemas } from "./schemas";

type BankType = "discount" | "max" | "visaCal";

function validateCredentials(bankType: BankType, raw: Record<string, string>): void {
  credentialSchemas[bankType].parse(raw);
}

export async function addCredential(
  bankType: BankType,
  displayName: string,
  rawCredentials: Record<string, string>,
): Promise<string> {
  validateCredentials(bankType, rawCredentials);
  const { encrypted, iv, authTag } = encrypt(JSON.stringify(rawCredentials));
  const [row] = await db
    .insert(bankCredentials)
    .values({ bankType, displayName, encryptedCredentials: encrypted, iv, authTag })
    .returning({ id: bankCredentials.id });
  return row.id;
}

export async function listCredentials(): Promise<
  Array<{ id: string; bankType: string; displayName: string; createdAt: Date }>
> {
  return db.query.bankCredentials.findMany({
    columns: { id: true, bankType: true, displayName: true, createdAt: true },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
}

export async function getDecryptedCredentials(
  id: string,
): Promise<{ bankType: string; credentials: Record<string, string> }> {
  const row = await db.query.bankCredentials.findFirst({
    where: eq(bankCredentials.id, id),
  });
  if (!row) throw new Error(`Credential not found: ${id}`);
  const json = decrypt({ encrypted: row.encryptedCredentials, iv: row.iv, authTag: row.authTag });
  return { bankType: row.bankType, credentials: JSON.parse(json) as Record<string, string> };
}

export async function updateCredential(
  id: string,
  update: { displayName?: string; rawCredentials?: Record<string, string> },
): Promise<void> {
  const values: Partial<typeof bankCredentials.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (update.displayName !== undefined) values.displayName = update.displayName;
  if (update.rawCredentials !== undefined) {
    const row = await db.query.bankCredentials.findFirst({
      where: eq(bankCredentials.id, id),
      columns: { bankType: true },
    });
    if (!row) throw new Error(`Credential not found: ${id}`);
    validateCredentials(row.bankType, update.rawCredentials);
    const { encrypted, iv, authTag } = encrypt(JSON.stringify(update.rawCredentials));
    values.encryptedCredentials = encrypted;
    values.iv = iv;
    values.authTag = authTag;
  }
  await db.update(bankCredentials).set(values).where(eq(bankCredentials.id, id));
}

export async function removeCredential(id: string): Promise<void> {
  await db.delete(bankCredentials).where(eq(bankCredentials.id, id));
}
