import "dotenv/config";
import { db } from "./index";
import { categories } from "./schema";
import { eq } from "drizzle-orm";
import { TAXONOMY_V2 } from "./taxonomy";

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

  console.log(`Seeded ${inserted} new categories (${existingNames.size} already existed).`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
