import { getCategories } from "@/lib/categories";
import { CategoriesSection } from "@/components/categories-section";
import { CredentialsSection } from "@/components/credentials-section";

export default async function SettingsPage() {
  const categories = await getCategories();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">הגדרות</h2>
        <p className="text-muted-foreground mt-1">ניהול חשבונות בנק, קטגוריות וכללי סיווג.</p>
      </div>

      <CredentialsSection />

      <CategoriesSection initialCategories={categories} />
    </div>
  );
}
