"use client";

/**
 * Dashboard goals progress card (BGR10, #167) — the owner-picked Variant A
 * (compact multi-goal list) from the prototype reaction pass, rebuilt against
 * live `/api/goals` data. Progress numbers and the pace verdict are computed
 * entirely server-side (CONTEXT.md "savings goal": opening + cumulative Net
 * Savings, unclamped; CONTEXT.md "budget pace" sibling — linear deadline
 * pace); this component only formats and labels what it's handed.
 */

import * as React from "react";
import { Target } from "lucide-react";
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

function percentOf(current: number, target: number): number {
  if (target === 0) return 0;
  return (current / target) * 100;
}

/** Bar fill only, clamped to [0, 100] for layout — the printed percentage never is. */
function clampedFill(current: number, target: number): number {
  return Math.max(0, Math.min(100, percentOf(current, target)));
}

function GoalRow({ goal }: { goal: GoalProgressCardData }) {
  const percent = percentOf(goal.current, goal.target);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{goal.name}</span>
        <span className="text-muted-foreground tabular-nums">{Math.round(percent)}%</span>
      </div>
      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${goal.current < 0 ? "bg-red-500" : "bg-emerald-500"}`}
          style={{ width: `${clampedFill(goal.current, goal.target)}%` }}
        />
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

export function GoalsProgressCard({ goals }: { goals: GoalProgressCardData[] }) {
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
