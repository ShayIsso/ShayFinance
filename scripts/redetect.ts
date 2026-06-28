import "dotenv/config";
import { db } from "@/db";
import { recurringExpenses } from "@/db/schema";
import { runDetection, drizzleRecurringStore } from "@/lib/recurring-detection";

/**
 * Re-runs recurring-expense detection over the full transaction window and
 * reports how many patterns now live in `recurring_expenses`.
 *
 * Intended use (OWNER-only, after the #90 precision changes merge): wipe the
 * `recurring_expenses` table, then run this to re-detect from clean data with
 * the new money-out / category / merchant-exclusivity filters applied.
 *
 *   npx tsx scripts/redetect.ts
 *
 * This script does NOT delete anything — it only detects + upserts.
 */
async function main() {
  await runDetection(drizzleRecurringStore);

  const rows = await db.select({ id: recurringExpenses.id }).from(recurringExpenses);

  console.log(`Detection complete. recurring_expenses now holds ${rows.length} pattern(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("redetect failed:", err);
    process.exit(1);
  });
