/**
 * Taxonomy v2 migration executor (#139; decisions from #133/#136). Dry-run by
 * default; --apply executes the whole plan in one transaction (OWNER-only,
 * pg_dump backup first). Single-use: run immediately after the 0002 schema
 * migration is applied — running --apply against a DB that has since imported
 * new transactions can stamp them category_source='user', forging user-tier
 * provenance (ADR-0010).
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, categoryRules, transactions, merchantMemory } from "@/db/schema";
import { TAXONOMY_V2 } from "@/db/taxonomy";
import {
  buildPlan,
  decisionsSchema,
  type Decisions,
  type CategorySnapshot,
  type RuleSnapshot,
  type TxnSnapshot,
  type PlanOp,
} from "./plan";

const DECISIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "spike",
  "taxonomy-decisions-133.json",
);

function loadDecisions(): Decisions {
  if (!existsSync(DECISIONS_PATH)) {
    throw new Error(
      `Decisions file not found at ${DECISIONS_PATH}.\n` +
        "This file is gitignored (real merchant descriptors) — copy it into scripts/spike/ before running.",
    );
  }
  const raw = JSON.parse(readFileSync(DECISIONS_PATH, "utf8"));
  const parsed = decisionsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Decisions file failed validation:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}

function logPlan(ops: PlanOp[]) {
  for (const op of ops) {
    switch (op.kind) {
      case "renameCategory":
        console.log(`  RENAME  ${op.from} → ${op.to}${op.icon ? ` (icon ${op.icon})` : ""}`);
        break;
      case "createCategory":
        console.log(`  CREATE  ${op.name} [${op.type}] icon=${op.icon} color=${op.color}`);
        break;
      case "mergeCategory":
        console.log(
          `  MERGE   ${op.fromName} → ${op.intoName} (re-point ${op.txnCount} txns, ${op.ruleCount} rules, memory; then delete)`,
        );
        break;
      case "moveTransactions":
        console.log(`  MOVE    ${op.txIds.length} txn(s) → ${op.toName}  [${op.label}]`);
        console.log(`            ids: ${op.txIds.join(", ")}`);
        break;
      case "deleteRule":
        console.log(
          `  DEL-RULE [${op.matchType}] "${op.pattern}" → ${op.categoryName}  (${op.reason})`,
        );
        break;
      case "repointRule":
        console.log(`  REPOINT rule "${op.pattern}"  ${op.fromName} → ${op.toName}`);
        break;
      case "deleteCategory":
        console.log(
          `  DEL-CAT ${op.name}` +
            (op.leftoverTxnCount > 0
              ? `  (WARNING: ${op.leftoverTxnCount} txn(s) will become uncategorized/NULL)`
              : ""),
        );
        break;
    }
  }
}

async function snapshot() {
  const cats = (await db
    .select({
      id: categories.id,
      name: categories.name,
      type: categories.type,
      icon: categories.icon,
      color: categories.color,
    })
    .from(categories)) as CategorySnapshot[];
  const ruleRows = await db.select().from(categoryRules);
  const rules: RuleSnapshot[] = ruleRows.map((r) => ({
    id: r.id,
    categoryId: r.categoryId,
    matchType: r.matchType,
    pattern: r.pattern,
    priority: r.priority,
  }));
  const txnRows = await db
    .select({
      id: transactions.id,
      description: transactions.description,
      categoryId: transactions.categoryId,
      categorySource: transactions.categorySource,
    })
    .from(transactions);
  const txns: TxnSnapshot[] = txnRows.map((t) => ({
    id: t.id,
    description: t.description,
    categoryId: t.categoryId,
    categorySource: t.categorySource,
  }));
  return { cats, rules, txns };
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyPlan(tx: DbTransaction, ops: PlanOp[]) {
  const idByName = async (name: string): Promise<string> => {
    const [row] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.name, name));
    if (!row) throw new Error(`apply: category "${name}" not found`);
    return row.id;
  };

  for (const op of ops) {
    switch (op.kind) {
      case "renameCategory": {
        await tx
          .update(categories)
          .set(op.icon ? { name: op.to, icon: op.icon } : { name: op.to })
          .where(eq(categories.name, op.from));
        break;
      }
      case "createCategory": {
        const def = TAXONOMY_V2.find((c) => c.name === op.name);
        await tx.insert(categories).values({
          name: op.name,
          type: op.type,
          icon: op.icon,
          color: op.color,
          description: def?.description ?? null,
          isDefault: true,
        });
        break;
      }
      case "mergeCategory": {
        const fromId = await idByName(op.fromName);
        const intoId = await idByName(op.intoName);
        await tx
          .update(transactions)
          .set({ categoryId: intoId })
          .where(eq(transactions.categoryId, fromId));
        await tx
          .update(categoryRules)
          .set({ categoryId: intoId })
          .where(eq(categoryRules.categoryId, fromId));
        await tx
          .update(merchantMemory)
          .set({ categoryId: intoId })
          .where(eq(merchantMemory.categoryId, fromId));
        await tx.delete(categories).where(eq(categories.id, fromId));
        break;
      }
      case "moveTransactions": {
        const toId = await idByName(op.toName);
        await tx
          .update(transactions)
          .set({ categoryId: toId, categorySource: "user" })
          .where(inArray(transactions.id, op.txIds));
        break;
      }
      case "deleteRule": {
        await tx.delete(categoryRules).where(eq(categoryRules.id, op.ruleId));
        break;
      }
      case "repointRule": {
        const toId = await idByName(op.toName);
        await tx
          .update(categoryRules)
          .set({ categoryId: toId })
          .where(eq(categoryRules.id, op.ruleId));
        break;
      }
      case "deleteCategory": {
        await tx.delete(categories).where(eq(categories.name, op.name));
        break;
      }
    }
  }

  // Reconcile the AI-prompt descriptions onto every surviving category so an
  // already-populated DB gains the #133 texts (the seed only inserts missing rows).
  for (const def of TAXONOMY_V2) {
    await tx
      .update(categories)
      .set({ description: def.description })
      .where(eq(categories.name, def.name));
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const decisions = loadDecisions();
  const { cats, rules, txns } = await snapshot();
  const { ops, summary, warnings } = buildPlan(decisions, cats, rules, txns);

  console.log(`\n=== Taxonomy v2 migration — ${apply ? "APPLY" : "DRY RUN"} ===\n`);
  logPlan(ops);

  if (warnings.length > 0) {
    console.log("\n!!! WARNINGS !!!");
    for (const w of warnings) console.log(`  WARNING: ${w}`);
  }

  console.log("\n--- SUMMARY ---");
  console.log(`categories: ${summary.categoriesBefore} → ${summary.categoriesAfter}`);
  console.log(`rules:      ${summary.rulesBefore} → ${summary.rulesAfter}`);
  console.log(
    `renames=${summary.renames} merges=${summary.merges} additions=${summary.additions} categoryDeletions=${summary.categoryDeletions}`,
  );
  console.log(
    `txn moves: procedural=${summary.txnMoves.procedural} explicit=${summary.txnMoves.explicit} drugstore=${summary.txnMoves.drugstore} total=${summary.txnMoves.total}`,
  );
  console.log(
    `rule deletions: duplicate=${summary.ruleDeletions.duplicate} categoryDeleted=${summary.ruleDeletions.categoryDeleted} collapse=${summary.ruleDeletions.collapse} oneMatch=${summary.ruleDeletions.oneMatch}; repoints=${summary.ruleRepoints}`,
  );
  console.log(`transactions left in deleted categories (→ NULL): ${summary.leftoverInDeleted}`);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to execute (OWNER-only, back up first).");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    await applyPlan(tx, ops);
  });

  const [{ n: catCount }] = await db.select({ n: sql<number>`count(*)` }).from(categories);
  const [{ n: ruleCount }] = await db.select({ n: sql<number>`count(*)` }).from(categoryRules);
  console.log(`\nApplied. categories now=${catCount}, rules now=${ruleCount}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
