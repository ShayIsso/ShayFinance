export const dynamic = "force-dynamic";

import { getCategories, getCategoryTree } from "@/lib/categories";
import { getRules } from "@/lib/categories/rules";
import { listGoals, getGoalLadder } from "@/lib/goals";
import { listBudgets, getMonthlyTargets } from "@/lib/budgets";
import { getSchedulerConfigAction } from "@/app/actions/scheduler";
import { CategoriesSection } from "@/components/categories-section";
import { CredentialsSection } from "@/components/credentials-section";
import { RulesSection } from "@/components/rules-section";
import { SchedulerSection } from "@/components/scheduler-section";
import { GoalsSection } from "@/components/goals-section";
import { BudgetsSection } from "@/components/budgets-section";
import { Separator } from "@/components/ui/separator";

export default async function SettingsPage() {
  const [categories, categoryTree, rules, schedulerConfig, goals, ladder, budgets, monthlyTargets] =
    await Promise.all([
      getCategories(),
      getCategoryTree(),
      getRules(),
      getSchedulerConfigAction(),
      listGoals(),
      getGoalLadder(),
      listBudgets(),
      getMonthlyTargets(),
    ]);

  const ladderStatus = ladder.rungs.map((rung) => ({
    id: rung.goal.id,
    current: rung.current,
    target: rung.target,
    paceVerdict: rung.paceVerdict,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">הגדרות</h2>
        <p className="text-muted-foreground mt-1">ניהול חשבונות בנק, קטגוריות וכללי סיווג.</p>
      </div>

      <CredentialsSection />

      <Separator />

      <CategoriesSection initialCategories={categories} />

      <Separator />

      <RulesSection initialRules={rules} categories={categories} tree={categoryTree} />

      <Separator />

      <GoalsSection
        initialGoals={goals}
        ladderStatus={ladderStatus}
        initialTrackingSince={ladder.trackingSinceMonth}
      />

      <Separator />

      <BudgetsSection
        initialBudgets={budgets}
        categories={categories}
        initialTargets={monthlyTargets}
      />

      <Separator />

      <SchedulerSection initialConfig={schedulerConfig} />
    </div>
  );
}
