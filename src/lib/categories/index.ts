import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Category = {
  id: string;
  name: string;
  type: "income" | "expense" | "investment" | "transfer" | "ignore";
  icon: string;
  color: string;
  isDefault: boolean;
};

export async function getCategories(): Promise<Category[]> {
  return db.select().from(categories).orderBy(categories.name);
}

export async function createCategory(data: {
  name: string;
  type: "income" | "expense" | "investment" | "transfer" | "ignore";
  icon: string;
  color: string;
}): Promise<string> {
  const [row] = await db
    .insert(categories)
    .values({ ...data, isDefault: false })
    .returning({ id: categories.id });
  return row.id;
}

export async function updateCategory(
  id: string,
  changes: Partial<{
    name: string;
    type: "income" | "expense" | "investment" | "transfer" | "ignore";
    icon: string;
    color: string;
  }>,
): Promise<void> {
  await db.update(categories).set(changes).where(eq(categories.id, id));
}

export async function deleteCategory(id: string): Promise<void> {
  const [row] = await db
    .select({ isDefault: categories.isDefault })
    .from(categories)
    .where(eq(categories.id, id));

  if (!row) return;
  if (row.isDefault) {
    throw new Error("Cannot delete a default category");
  }

  await db.delete(categories).where(eq(categories.id, id));
}
