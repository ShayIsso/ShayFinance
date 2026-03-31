export const dynamic = "force-dynamic";

import { getCategories } from "@/lib/categories";
import { getRules } from "@/lib/categories/rules";
import { CategoriesSection } from "@/components/categories-section";
import { CredentialsSection } from "@/components/credentials-section";
import { RulesSection } from "@/components/rules-section";

export default async function SettingsPage() {
  const [categories, rules] = await Promise.all([getCategories(), getRules()]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">הגדרות</h2>
        <p className="text-muted-foreground mt-1">ניהול חשבונות בנק, קטגוריות וכללי סיווג.</p>
      </div>

      <CredentialsSection />

      <CategoriesSection initialCategories={categories} />

      <RulesSection initialRules={rules} categories={categories} />
    </div>
  );
}
