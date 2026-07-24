"use client";

import { Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BudgetPace } from "@/lib/budgets";

export type PaceHeroProps = {
  /**
   * Month spend against the overall expense ceiling, already paced server-side
   * by the budgets module (`getExpenseTargetPace`, surfaced on
   * `/api/budgets-summary`). Null when no monthly expense target is configured
   * — there is no ceiling to pace against, not a load failure.
   */
  pace: BudgetPace | null;
};

/**
 * A′ pace hero — the layout's emotional anchor ("am I on track this month?").
 * Slot scaffold only (#204); the spend-vs-ceiling bar, time-elapsed tick and
 * verdict sentence are built in #205, which also takes ownership of the
 * spend-vs-ceiling figure so the budgets card can drop its duplicate headline.
 */
export function PaceHero({ pace }: PaceHeroProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="text-muted-foreground size-4" strokeWidth={1.5} />
          קצב הוצאה חודשי
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          {pace ? "בבנייה" : "לא הוגדרה תקרת הוצאות חודשית"}
        </p>
      </CardContent>
    </Card>
  );
}
