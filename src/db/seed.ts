import "dotenv/config";
import { db } from "./index";
import { categories } from "./schema";
import { and, eq, isNull } from "drizzle-orm";
import { TAXONOMY_V2, DEFAULT_GROUPS } from "./taxonomy";

async function seed() {
  console.log("Seeding default categories...");

  const existing = await db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.isDefault, true));
  const existingNames = new Set(existing.map((c) => c.name));

  let inserted = 0;
  for (const category of TAXONOMY_V2) {
    if (!existingNames.has(category.name)) {
      await db.insert(categories).values({ ...category, isDefault: true });
      inserted++;
    }
  }

  // Default grouping (ADR-0011 §7): seed each expense group, then backfill its
  // children's parent_id by name. Idempotent and safe to re-run — a child is
  // only linked while it is still a root leaf, so a user who has since detached
  // or regrouped a leaf is never overridden.
  let groupsInserted = 0;
  let linked = 0;
  for (const group of DEFAULT_GROUPS) {
    let [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.name, group.name));

    if (!row) {
      [row] = await db
        .insert(categories)
        .values({
          name: group.name,
          type: "expense",
          icon: group.icon,
          color: group.color,
          isDefault: true,
        })
        .returning({ id: categories.id });
      groupsInserted++;
    }

    for (const childName of group.children) {
      const result = await db
        .update(categories)
        .set({ parentId: row.id })
        .where(and(eq(categories.name, childName), isNull(categories.parentId)))
        .returning({ id: categories.id });
      linked += result.length;
    }
  }

  console.log(
    `Seeded ${inserted} leaf categories (${existingNames.size} already existed), ` +
      `${groupsInserted} groups, linked ${linked} leaves.`,
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
