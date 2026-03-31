import { getCategories } from "@/lib/categories";
import { CategoriesSection } from "@/components/categories-section";

export default async function SettingsPage() {
  const categories = await getCategories();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">הגדרות</h2>
        <p className="text-muted-foreground mt-1">ניהול קטגוריות וכללי סיווג.</p>
      </div>

      <CategoriesSection initialCategories={categories} />
    </div>
  );
}
