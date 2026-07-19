"use client";

/**
 * Dashboard budget status card (BGR9, #166) — the owner-picked Variant C
 * (collapsed aggregate, expand for the per-budget breakdown) from the
 * prototype reaction pass, rebuilt against live `/api/budgets-summary` data.
 * All pace/target verdicts are computed server-side by the budgets module
 * (CONTEXT.md "budget pace"; decision record #105); this component only
 * formats and lays out what it's handed — no verdict logic here.
 *
 * Status vs. category-identity, by form not color (prototype-gate follow-up,
 * #166): category identity is always a filled dot (the app-wide convention —
 * see spending-breakdown.tsx's `CategoryDot`); a budget's pace verdict is
 * always a bordered pill (chip), never a dot, so the two can never be
 * mistaken for each other even though both use the same status palette.
 */

import * as React from "react";
import { Wallet, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Amount } from "@/components/ui/amount";
import type { BudgetVerdict, SavingsTargetStatus, SavingsTargetVerdict } from "@/lib/budgets";

export type BudgetChipData = {
  id: string;
  categoryName: string;
  categoryColor: string;
  verdict: BudgetVerdict;
  spent: number;
  limit: number;
};

export type TargetsHeadlineInput = {
  expenseTarget: number | null;
  expenseActual: number;
  savingsTarget: SavingsTargetStatus | null;
};

export type TargetsHeadlineViewModel = {
  expense: { target: number; actual: number; over: boolean } | null;
  savings: {
    target: number;
    actual: number;
    verdict: SavingsTargetStatus["verdict"];
    monthClosed: boolean;
  } | null;
};

/**
 * Visibility/arithmetic for the targets headline — not a verdict: the module
 * gives no pace for the expense target (only budgets get a pace), so "over"
 * here is a plain actual-vs-target comparison, same as the summary cards'
 * existing sign-based coloring elsewhere on the dashboard. The savings
 * verdict is passed through untouched (null intra-month by design, §6).
 */
export function buildTargetsHeadline(input: TargetsHeadlineInput): TargetsHeadlineViewModel {
  return {
    expense:
      input.expenseTarget != null
        ? {
            target: input.expenseTarget,
            actual: input.expenseActual,
            over: input.expenseActual > input.expenseTarget,
          }
        : null,
    savings: input.savingsTarget
      ? {
          target: input.savingsTarget.target,
          actual: input.savingsTarget.netSavings,
          verdict: input.savingsTarget.verdict,
          monthClosed: input.savingsTarget.monthClosed,
        }
      : null,
  };
}

export const VERDICT_LABEL: Record<BudgetVerdict, string> = {
  over: "חריגה",
  "at-risk": "בסיכון",
  "on-pace": "בקצב",
  "comfortably-under": "מתחת ליעד בנוחות",
};

/**
 * The shared positive/negative chip fill — reused by both the per-verdict
 * palette below and the savings met/missed chip, so the two "good/bad" chip
 * treatments on this card can't drift apart.
 */
const POSITIVE_CHIP_CLASS = "border-emerald-200 bg-emerald-50 text-emerald-700";
const NEGATIVE_CHIP_CLASS = "border-red-200 bg-red-50 text-red-700";

/** Light-theme, low-saturation chip fills — the status palette. Never applied to a dot. */
export const VERDICT_CHIP_CLASS: Record<BudgetVerdict, string> = {
  over: NEGATIVE_CHIP_CLASS,
  "at-risk": "border-amber-200 bg-amber-50 text-amber-700",
  "on-pace": "border-muted text-muted-foreground",
  "comfortably-under": POSITIVE_CHIP_CLASS,
};

/**
 * The savings-target met/missed pill — same bordered-pill status system as
 * `VERDICT_CHIP_CLASS`, reused here and by the דוחות monthly report's
 * month-close section (issue #169) so the two can't drift on label or fill.
 */
export function SavingsVerdictChip({
  verdict,
  className = "",
}: {
  verdict: SavingsTargetVerdict;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
        verdict === "met" ? POSITIVE_CHIP_CLASS : NEGATIVE_CHIP_CLASS
      } ${className}`}
    >
      {verdict === "met" ? "הושג" : "לא הושג"}
    </span>
  );
}

const VERDICT_SEVERITY_ORDER: BudgetVerdict[] = ["over", "at-risk", "on-pace", "comfortably-under"];

export type VerdictCount = { verdict: BudgetVerdict; count: number };

/**
 * Counts budgets per verdict, most concerning first, omitting verdicts with
 * zero budgets. Feeds the collapsed-row summary as count chips — never dots —
 * so it can't be confused with the category-identity dots in the expanded
 * list below it (prototype-gate follow-up, #166).
 */
export function countByVerdict(budgets: { verdict: BudgetVerdict }[]): VerdictCount[] {
  const counts = new Map<BudgetVerdict, number>();
  for (const b of budgets) counts.set(b.verdict, (counts.get(b.verdict) ?? 0) + 1);
  return VERDICT_SEVERITY_ORDER.filter((v) => (counts.get(v) ?? 0) > 0).map((verdict) => ({
    verdict,
    count: counts.get(verdict)!,
  }));
}

function TargetsHeadline({ headline }: { headline: TargetsHeadlineViewModel }) {
  if (!headline.expense && !headline.savings) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b pb-3 text-sm">
      {headline.expense && (
        <span className="text-muted-foreground">
          יעד הוצאות{" "}
          <span
            className={`font-semibold ${headline.expense.over ? "text-red-600" : "text-foreground"}`}
          >
            <Amount amount={headline.expense.actual} colorize={false} fractionDigits={0} /> מתוך{" "}
            <Amount amount={headline.expense.target} colorize={false} fractionDigits={0} />
          </span>
        </span>
      )}
      {headline.savings && (
        <span className="text-muted-foreground">
          יעד חיסכון{" "}
          <span className="text-foreground font-semibold">
            <Amount amount={headline.savings.actual} colorize={false} fractionDigits={0} /> מתוך{" "}
            <Amount amount={headline.savings.target} colorize={false} fractionDigits={0} />
          </span>
          {headline.savings.verdict && (
            <SavingsVerdictChip verdict={headline.savings.verdict} className="mr-1.5" />
          )}
        </span>
      )}
    </div>
  );
}

function CountChips({ counts }: { counts: VerdictCount[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {counts.map(({ verdict, count }) => (
        <span
          key={verdict}
          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${VERDICT_CHIP_CLASS[verdict]}`}
        >
          {count} {VERDICT_LABEL[verdict]}
        </span>
      ))}
    </span>
  );
}

/**
 * Category dot + spent/limit + pace-verdict pill for one budget. Exported so
 * the דוחות monthly report's month-close section (issue #169) reuses the
 * exact same row rendering as the Dashboard card, rather than a copy that
 * could drift in styling or verdict labeling.
 */
export function BudgetRow({ budget }: { budget: BudgetChipData }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: budget.categoryColor }}
        />
        <span className="truncate">{budget.categoryName}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-muted-foreground text-xs tabular-nums">
          <Amount amount={budget.spent} colorize={false} fractionDigits={0} /> /{" "}
          <Amount amount={budget.limit} colorize={false} fractionDigits={0} />
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${VERDICT_CHIP_CLASS[budget.verdict]}`}
        >
          {VERDICT_LABEL[budget.verdict]}
        </span>
      </div>
    </div>
  );
}

export function BudgetStatusCard({
  budgets,
  targetsHeadline,
}: {
  budgets: BudgetChipData[];
  targetsHeadline: TargetsHeadlineInput;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const headline = buildTargetsHeadline(targetsHeadline);
  const counts = countByVerdict(budgets);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="size-4" strokeWidth={1.5} />
          תקציבים
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <TargetsHeadline headline={headline} />
        {budgets.length === 0 ? (
          <EmptyState
            icon={Wallet}
            heading="אין תקציבים"
            explainer="הגדר תקציב חודשי לקטגוריה בהגדרות כדי לעקוב אחרי הקצב כאן."
            cta={{ label: "עבור להגדרות", href: "/settings" }}
          />
        ) : (
          <>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="hover:bg-muted/40 flex w-full items-center justify-between rounded-md py-1 text-right"
              aria-expanded={expanded}
            >
              <CountChips counts={counts} />
              {expanded ? (
                <ChevronUp className="text-muted-foreground size-4 shrink-0" strokeWidth={1.5} />
              ) : (
                <ChevronDown className="text-muted-foreground size-4 shrink-0" strokeWidth={1.5} />
              )}
            </button>
            {expanded && (
              <div className="space-y-2 border-t pt-2">
                {budgets.map((b) => (
                  <BudgetRow key={b.id} budget={b} />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
