"use client";

import { Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Amount } from "@/components/ui/amount";
import { cn } from "@/lib/utils";
import type { BudgetPace, BudgetVerdict } from "@/lib/budgets";

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
 * Bar fill per verdict (decision record #105 §3 bands). `comfortably-under`
 * stays neutral — never emerald: a green fill on a ceiling bar reads as
 * "spend more", a #108 design review gate. `at-risk` and `over` are the only
 * verdicts that escalate the fill past the neutral gauge treatment.
 */
const BAR_FILL_CLASS: Record<BudgetVerdict, string> = {
  over: "bg-destructive",
  "at-risk": "bg-warning",
  "on-pace": "bg-bar-strong",
  "comfortably-under": "bg-bar-strong",
};

const VERDICT_SENTENCE: Record<BudgetVerdict, string> = {
  over: "ההוצאה החודשית חרגה מהתקרה שהוגדרה",
  "at-risk": "קצב ההוצאה מהיר מקצב הזמן שחלף החודש",
  "on-pace": "קצב ההוצאה תואם את קצב הזמן שחלף החודש",
  "comfortably-under": "קצב ההוצאה נמוך מקצב הזמן שחלף החודש",
};

export type PaceHeroViewModel = {
  barFillClass: string;
  /** Bar fill width, clamped to [0, 100] — `spentFraction` can exceed 1 or be `Infinity`. */
  fillPercent: number;
  /** Time-elapsed tick position, 0–100 (elapsedFraction is already clamped to [0, 1]). */
  elapsedPercent: number;
  /** Display string for the elapsed tick label, e.g. "40%". */
  elapsedLabel: string;
  /** Display string for the spend label, e.g. "77%" or "∞%" for a zero-limit breach. */
  spentLabel: string;
  sentence: string;
};

/**
 * The verdict→treatment mapping (pure, node-tested): bar fill class + Hebrew
 * sentence per {@link BudgetVerdict}, plus display clamping for the two shapes
 * a raw `BudgetPace` can take that a naive percentage render can't handle —
 * `spentFraction` of `Infinity` (non-zero spend against a zero limit, see
 * {@link evaluateBudget}) and fractions past 100%. Returns null exactly when
 * there's no pace to show (no monthly expense target configured).
 */
export function paceHeroViewModel(pace: BudgetPace | null): PaceHeroViewModel | null {
  if (!pace) return null;

  const fillPercent = Number.isFinite(pace.spentFraction)
    ? Math.min(100, Math.max(0, pace.spentFraction * 100))
    : 100;
  const elapsedPercent = Math.min(100, Math.max(0, pace.elapsedFraction * 100));
  const spentLabel = Number.isFinite(pace.spentFraction)
    ? `${Math.round(pace.spentFraction * 100)}%`
    : "∞%";

  return {
    barFillClass: BAR_FILL_CLASS[pace.verdict],
    fillPercent,
    elapsedPercent,
    elapsedLabel: `${Math.round(elapsedPercent)}%`,
    spentLabel,
    sentence: VERDICT_SENTENCE[pace.verdict],
  };
}

/** Keeps a label's centered anchor from spilling past the bar's own edges. */
function clampLabelPosition(percent: number): number {
  return Math.min(94, Math.max(6, percent));
}

/**
 * A′ pace hero — the layout's emotional anchor ("am I on track this month?").
 * Both label rows anchor via `right` (not `insetInlineStart`): under the
 * app's mandatory `dir="rtl"`, an unfilled bar/gauge grows from the right
 * (CONTEXT.md convention — see the goal-ladder and savings-rate gauges), so
 * "percent along the bar" is measured from the right edge here too. The
 * elapsed-time tick and spend labels sit on separate rows (above/below the
 * bar) rather than sharing one, so a near-zero gap between them — the exact
 * case the label pair exists to surface — never renders as overlapping text.
 */
export function PaceHero({ pace }: PaceHeroProps) {
  const vm = paceHeroViewModel(pace);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="text-muted-foreground size-4" strokeWidth={1.5} />
          קצב הוצאה חודשי
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!pace || !vm ? (
          <EmptyState
            icon={Gauge}
            heading="לא הוגדרה תקרת הוצאות חודשית"
            explainer="הגדר תקרת הוצאות חודשית בהגדרות כדי לעקוב אחרי הקצב כאן."
            cta={{ label: "עבור להגדרות", href: "/settings" }}
          />
        ) : (
          <div className="space-y-3">
            <span className="text-lg font-semibold">
              <Amount amount={pace.spent} colorize={false} fractionDigits={0} /> מתוך{" "}
              <Amount amount={pace.limit} colorize={false} fractionDigits={0} />
            </span>

            <div className="space-y-1">
              <div className="relative h-4 text-[11px]">
                <span
                  className="text-muted-foreground absolute translate-x-1/2 whitespace-nowrap"
                  style={{ right: `${clampLabelPosition(vm.elapsedPercent)}%` }}
                >
                  זמן שחלף {vm.elapsedLabel}
                </span>
              </div>

              <div className="relative">
                <div className="bg-bar h-3 w-full overflow-hidden rounded-full">
                  <div
                    className={cn("h-full rounded-full", vm.barFillClass)}
                    style={{ width: `${vm.fillPercent}%` }}
                  />
                </div>
                <div
                  className="bg-foreground/40 absolute inset-y-0 w-px"
                  style={{ right: `${vm.elapsedPercent}%` }}
                  aria-hidden
                />
              </div>

              <div className="relative h-4 text-[11px]">
                <span
                  className="text-foreground absolute translate-x-1/2 font-medium whitespace-nowrap"
                  style={{ right: `${clampLabelPosition(vm.fillPercent)}%` }}
                >
                  הוצאת {vm.spentLabel}
                </span>
              </div>
            </div>

            <p className="text-muted-foreground text-sm">{vm.sentence}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
