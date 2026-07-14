import "dotenv/config";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { and, isNull, isNotNull, inArray } from "drizzle-orm";
import { getRules, categorize } from "@/lib/categories/rules";

/**
 * Backfills `transactions.category_source` for rows categorized before the
 * provenance column existed (ADR-0010 §7).
 *
 * Classification: a categorized row whose raw description matches an ACTIVE
 * rule pointing at its CURRENT category is `rule`; every other categorized row
 * is `user`. Merchant memory is deliberately NOT seeded — historical manual
 * labels include personal-context assignments that must not fossilize into
 * always-apply mappings (ADR-0010 §7); memory earns entries from live actions.
 *
 * OWNER-only, never invoked automatically. Idempotent: only rows with a
 * category but no source are touched, so re-runs are no-ops and live-set
 * provenance (user/memory/ai) is never clobbered.
 *
 *   npx tsx scripts/backfill-category-source.ts
 */
async function main() {
  const rules = await getRules();

  const rows = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(and(isNotNull(transactions.categoryId), isNull(transactions.categorySource)));

  const ruleIds: string[] = [];
  const userIds: string[] = [];
  for (const row of rows) {
    const matched = categorize(row.description, rules);
    if (matched !== null && matched === row.categoryId) {
      ruleIds.push(row.id);
    } else {
      userIds.push(row.id);
    }
  }

  if (ruleIds.length > 0) {
    await db
      .update(transactions)
      .set({ categorySource: "rule" })
      .where(inArray(transactions.id, ruleIds));
  }
  if (userIds.length > 0) {
    await db
      .update(transactions)
      .set({ categorySource: "user" })
      .where(inArray(transactions.id, userIds));
  }

  console.log(
    `Backfill complete: ${ruleIds.length} rule, ${userIds.length} user, ${rows.length} rows total.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("backfill-category-source failed:", err);
    process.exit(1);
  });
