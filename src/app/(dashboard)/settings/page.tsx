export const dynamic = "force-dynamic";

import { getCategories } from "@/lib/categories";
import { getRules } from "@/lib/categories/rules";
import { getSchedulerConfigAction } from "@/app/actions/scheduler";
import { CategoriesSection } from "@/components/categories-section";
import { CredentialsSection } from "@/components/credentials-section";
import { RulesSection } from "@/components/rules-section";
import { SchedulerSection } from "@/components/scheduler-section";

export default async function SettingsPage() {
  const [categories, rules, schedulerConfig] = await Promise.all([
    getCategories(),
    getRules(),
    getSchedulerConfigAction(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">הגדרות</h2>
        <p className="text-muted-foreground mt-1">ניהול חשבונות בנק, קטגוריות וכללי סיווג.</p>
      </div>

      <CredentialsSection />

      <CategoriesSection initialCategories={categories} />

      <RulesSection initialRules={rules} categories={categories} />

      <SchedulerSection initialConfig={schedulerConfig} />
    </div>
  );
}
