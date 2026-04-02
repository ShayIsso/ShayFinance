/**
 * One-time cleanup script: merge duplicate bank_accounts rows.
 *
 * For each (credentialId, accountNumber) pair with multiple rows,
 * keep the oldest row, reassign all transactions to it, then delete the duplicates.
 *
 * Run with: npx tsx src/db/cleanup-duplicate-accounts.ts
 */
import "dotenv/config";
import { db } from "./index";
import { bankAccounts, transactions } from "./schema";
import { eq, and, sql, count } from "drizzle-orm";

async function cleanup() {
  console.log("Scanning for duplicate bank_accounts...");

  // Find all (credentialId, accountNumber) groups with more than 1 row
  const duplicates = await db
    .select({
      credentialId: bankAccounts.credentialId,
      accountNumber: bankAccounts.accountNumber,
      cnt: count(),
    })
    .from(bankAccounts)
    .groupBy(bankAccounts.credentialId, bankAccounts.accountNumber)
    .having(sql`count(*) > 1`);

  if (duplicates.length === 0) {
    console.log("No duplicates found. Database is clean.");
    process.exit(0);
  }

  console.log(`Found ${duplicates.length} duplicate group(s).\n`);

  for (const dup of duplicates) {
    console.log(
      `  Account "${dup.accountNumber}" (credential ${dup.credentialId.slice(0, 8)}...): ${dup.cnt} rows`,
    );

    // Get all rows for this pair, ordered by id (keep first)
    const rows = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.credentialId, dup.credentialId),
          eq(bankAccounts.accountNumber, dup.accountNumber),
        ),
      )
      .orderBy(bankAccounts.id);

    const keepId = rows[0].id;
    const deleteIds = rows.slice(1).map((r) => r.id);

    console.log(`    Keeping: ${keepId.slice(0, 8)}...`);
    console.log(`    Merging ${deleteIds.length} duplicate(s)...`);

    // Reassign transactions from duplicate accounts to the kept account
    for (const dupeId of deleteIds) {
      await db
        .update(transactions)
        .set({ bankAccountId: keepId })
        .where(eq(transactions.bankAccountId, dupeId));

      console.log(`    Reassigned transactions from ${dupeId.slice(0, 8)}...`);
    }

    // Delete duplicate accounts
    for (const dupeId of deleteIds) {
      await db.delete(bankAccounts).where(eq(bankAccounts.id, dupeId));
    }

    console.log(`    Deleted ${deleteIds.length} duplicate row(s).`);
  }

  console.log("\nCleanup complete. Verifying...");

  // Verify no duplicates remain
  const remaining = await db
    .select({
      cnt: count(),
    })
    .from(bankAccounts)
    .groupBy(bankAccounts.credentialId, bankAccounts.accountNumber)
    .having(sql`count(*) > 1`);

  if (remaining.length === 0) {
    console.log("Verified: no duplicates remain. Unique constraint is safe to enforce.");
  } else {
    console.error("ERROR: Duplicates still remain! Manual intervention needed.");
    process.exit(1);
  }

  process.exit(0);
}

cleanup().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
