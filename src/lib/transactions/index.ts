import { db } from "@/db";
import { transactions, bankAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { categorizeTransaction } from "@/lib/categories/rules";
import type { ScrapedAccount } from "@/lib/scraper/types";

export async function importScrapedAccounts(
  credentialId: string,
  scrapedAccounts: ScrapedAccount[],
): Promise<number> {
  let imported = 0;

  for (const account of scrapedAccounts) {
    // Upsert bank_account
    const [bankAccount] = await db
      .insert(bankAccounts)
      .values({
        credentialId,
        accountNumber: account.accountNumber,
        balance: account.balance?.toString() ?? null,
        balanceUpdatedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: bankAccounts.id });

    // If account already exists, fetch its ID
    let accountId: string | undefined = bankAccount?.id;
    if (!accountId) {
      const existing = await db.query.bankAccounts.findFirst({
        where: and(
          eq(bankAccounts.credentialId, credentialId),
          eq(bankAccounts.accountNumber, account.accountNumber),
        ),
        columns: { id: true },
      });
      accountId = existing?.id;
      if (!accountId) continue;

      // Update balance
      await db
        .update(bankAccounts)
        .set({
          balance: account.balance?.toString() ?? null,
          balanceUpdatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, accountId));
    }

    // Import transactions
    for (const tx of account.transactions) {
      const categoryId = await categorizeTransaction(tx.description);

      await db
        .insert(transactions)
        .values({
          bankAccountId: accountId,
          externalId: tx.externalId,
          date: tx.date,
          processedDate: tx.processedDate,
          description: tx.description,
          memo: tx.memo,
          originalAmount: tx.originalAmount.toString(),
          originalCurrency: tx.originalCurrency,
          chargedAmount: tx.chargedAmount.toString(),
          chargedCurrency: tx.chargedCurrency,
          type: tx.type,
          installmentNumber: tx.installmentNumber,
          installmentTotal: tx.installmentTotal,
          status: tx.status,
          categoryId,
        })
        .onConflictDoNothing(); // basic dedup on external_id+bank_account_id

      imported++;
    }
  }

  return imported;
}
