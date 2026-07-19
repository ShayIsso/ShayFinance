"use client";

/**
 * Dashboard goals progress card (BGR10 #167, ladder amendment #186) — the
 * owner-picked Variant A (compact multi-goal list), rebuilt against live
 * `/api/goals` ladder data. Each goal's `current` is its capped ladder fill
 * (opening + its slice of the shared savings pool, never past the target) and
 * the pace verdict is computed server-side (CONTEXT.md "goal ladder"); this
 * component only formats and labels what it's handed. Pool beyond all needs
 * shows as the unallocated-surplus line (עודף ללא יעד).
 */

import * as React from "react";
import { Target, PiggyBank } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Amount } from "@/components/ui/amount";

export type GoalPaceVerdict = "ahead-or-on-pace" | "behind-pace" | "no-deadline";

export type GoalProgressCardData = {
  id: string;
  name: string;
  current: number;
  target: number;
  paceVerdict: GoalPaceVerdict;
};

const PACE_LABELS: Record<GoalPaceVerdict, string> = {
  "ahead-or-on-pace": "בקצב או לפני הקצב",
  "behind-pace": "מאחורי הקצב",
  "no-deadline": "ללא יעד זמן",
};

const PACE_CHIP_CLASSES: Record<GoalPaceVerdict, string> = {
  "ahead-or-on-pace": "border-emerald-200 text-emerald-700",
  "behind-pace": "border-red-200 text-red-700",
  "no-deadline": "border-muted text-muted-foreground",
};

/**
 * Ladder fill as a percentage, clamped to [0, 100] — a goal never shows past
 * 100% (CONTEXT.md "goal ladder"; overflow belongs to the next rung). `current`
 * is already capped server-side; the clamp here is a display backstop.
 */
function fillPercent(current: number, target: number): number {
  if (target === 0) return 0;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

function GoalRow({ goal }: { goal: GoalProgressCardData }) {
  const percent = fillPercent(goal.current, goal.target);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{goal.name}</span>
        <span className="text-muted-foreground tabular-nums">{Math.round(percent)}%</span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          <Amount amount={goal.current} fractionDigits={0} /> מתוך{" "}
          <Amount amount={goal.target} colorize={false} fractionDigits={0} />
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 font-medium ${PACE_CHIP_CLASSES[goal.paceVerdict]}`}
        >
          {PACE_LABELS[goal.paceVerdict]}
        </span>
      </div>
    </div>
  );
}

export function GoalsProgressCard({
  goals,
  surplus = 0,
}: {
  goals: GoalProgressCardData[];
  surplus?: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4" strokeWidth={1.5} />
          יעדי חיסכון
        </CardTitle>
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <EmptyState
            icon={Target}
            heading="אין יעדי חיסכון"
            explainer="הגדר יעד חיסכון בהגדרות כדי לעקוב אחרי ההתקדמות כאן."
            cta={{ label: "עבור להגדרות", href: "/settings" }}
          />
        ) : (
          <div className="space-y-4">
            {goals.map((goal) => (
              <GoalRow key={goal.id} goal={goal} />
            ))}
            {surplus > 0 && (
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <PiggyBank className="size-4" strokeWidth={1.5} />
                  עודף ללא יעד
                </span>
                <Amount amount={surplus} colorize={false} fractionDigits={0} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
