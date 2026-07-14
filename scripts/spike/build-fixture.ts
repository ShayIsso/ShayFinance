import "dotenv/config";
import { db } from "@/db";
import { transactions, categories } from "@/db/schema";
import { isNotNull } from "drizzle-orm";
import { categorize, getRules } from "@/lib/categories/rules";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Rebuilds the 50-item Hebrew benchmark fixture (#100) from the live DB.
 *
 * Population change vs the original spike: the uncategorized pool
 * (`category_id IS NULL`) is now ~6 rows, so it can no longer seed a fixture.
 * Instead we take categorized transactions whose `description` matches NO
 * active rule — those labels cannot have come from the rule engine, so they
 * are human-assigned ground truth on exactly the population AI
 * categorization serves in production (descriptions the rules can't handle).
 *
 * Few-shot examples are drawn from the rule-matched pool, which is disjoint
 * from the fixture by construction (rule matching is deterministic on
 * `description`), eliminating the spike's 14/50 few-shot overlap caveat.
 *
 * Output (all gitignored): scripts/spike/fixture.json, few-shot.json
 */

const FIXTURE_SIZE = 50;
const MAX_PER_CATEGORY = 9;
const FEW_SHOT_PER_CATEGORY = 6;

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function main() {
  const rules = await getRules();
  const cats = await db.select().from(categories);
  const catById = new Map(cats.map((c) => [c.id, c]));

  const rows = await db
    .select({
      description: transactions.description,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(isNotNull(transactions.categoryId));

  // Distinct by description; verify all rows sharing a description agree on category
  const byDesc = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byDesc.has(r.description)) byDesc.set(r.description, new Set());
    byDesc.get(r.description)!.add(r.categoryId!);
  }

  const manualPool: { description: string; categoryId: string }[] = [];
  const rulePool: { description: string; categoryId: string }[] = [];
  let conflicting = 0;

  for (const [description, catIds] of byDesc) {
    if (catIds.size > 1) {
      conflicting++;
      continue;
    }
    const categoryId = [...catIds][0];
    const ruleResult = categorize(description, rules);
    if (ruleResult === null) {
      manualPool.push({ description, categoryId });
    } else if (ruleResult === categoryId) {
      rulePool.push({ description, categoryId });
    }
    // ruleResult !== categoryId: rule and label disagree — ambiguous provenance, excluded
  }

  const poolByCat = new Map<string, string[]>();
  for (const item of manualPool) {
    if (!poolByCat.has(item.categoryId)) poolByCat.set(item.categoryId, []);
    poolByCat.get(item.categoryId)!.push(item.description);
  }

  console.log(`Distinct categorized descriptions: ${byDesc.size}`);
  console.log(`Conflicting (multi-category) descriptions excluded: ${conflicting}`);
  console.log(`Manual pool (no rule matches): ${manualPool.length}`);
  console.log(`Rule pool (rule matches, agrees): ${rulePool.length}`);
  console.log(`\nManual pool by category:`);
  const sorted = [...poolByCat.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [catId, descs] of sorted) {
    const c = catById.get(catId)!;
    console.log(`  ${c.name} (${c.type}): ${descs.length}`);
  }

  if (process.argv.includes("--stats-only")) return;

  // Stratified sample: round-robin across categories (largest first),
  // capped per category, until FIXTURE_SIZE reached.
  const shuffledPools = sorted.map(([catId, descs]) => ({
    catId,
    descs: seededShuffle(descs, 42),
  }));
  const fixture: { description: string; category: string; type: string }[] = [];
  for (let round = 0; round < MAX_PER_CATEGORY && fixture.length < FIXTURE_SIZE; round++) {
    for (const pool of shuffledPools) {
      if (fixture.length >= FIXTURE_SIZE) break;
      if (round < pool.descs.length) {
        const c = catById.get(pool.catId)!;
        fixture.push({ description: pool.descs[round], category: c.name, type: c.type });
      }
    }
  }

  const fewShotByCat = new Map<string, string[]>();
  for (const item of seededShuffle(rulePool, 7)) {
    if (!fewShotByCat.has(item.categoryId)) fewShotByCat.set(item.categoryId, []);
    const list = fewShotByCat.get(item.categoryId)!;
    if (list.length < FEW_SHOT_PER_CATEGORY) list.push(item.description);
  }
  const fewShot = [...fewShotByCat.entries()].map(([catId, examples]) => ({
    category: catById.get(catId)!.name,
    type: catById.get(catId)!.type,
    examples,
  }));

  const dir = join(process.cwd(), "scripts", "spike");
  writeFileSync(join(dir, "fixture.json"), JSON.stringify(fixture, null, 2));
  writeFileSync(join(dir, "few-shot.json"), JSON.stringify(fewShot, null, 2));

  console.log(`\nWrote fixture.json (${fixture.length} items):`);
  const fixtureCounts = new Map<string, number>();
  for (const f of fixture) fixtureCounts.set(f.category, (fixtureCounts.get(f.category) ?? 0) + 1);
  for (const [name, n] of [...fixtureCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${n}`);
  }
  console.log(`Wrote few-shot.json (${fewShot.length} categories)`);
}

main().then(() => process.exit(0));
