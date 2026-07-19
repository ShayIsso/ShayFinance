"use client";

/**
 * PROTOTYPE — three structurally different layouts for the BGR9 (#166)
 * dashboard budget widget, all reading the same hardcoded `MockScenario`.
 * Never merges to phase-3; frozen on prototype/bgr9-budget-widgets.
 */

import * as React from "react";
import { Wallet, TrendingDown, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import type { BudgetVerdict, MockScenario } from "./mock-data";

const VERDICT_LABEL: Record<BudgetVerdict, string> = {
  over: "חריגה",
  "at-risk": "בסיכון",
  "on-pace": "בקצב",
  "comfortably-under": "מתחת ליעד בנוחות",
};

const VERDICT_CLASS: Record<BudgetVerdict, string> = {
  over: "border-red-200 bg-red-50 text-red-700",
  "at-risk": "border-amber-200 bg-amber-50 text-amber-700",
  "on-pace": "border-muted text-muted-foreground",
  "comfortably-under": "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const VERDICT_DOT_CLASS: Record<BudgetVerdict, string> = {
  over: "bg-red-500",
  "at-risk": "bg-amber-500",
  "on-pace": "bg-gray-400",
  "comfortably-under": "bg-emerald-500",
};

function ils(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function BudgetsEmptyState() {
  return (
    <EmptyState
      icon={Wallet}
      heading="אין תקציבים"
      explainer="הגדר תקציב חודשי לקטגוריה בהגדרות כדי לעקוב אחרי הקצב כאן."
      cta={{ label: "עבור להגדרות", href: "/settings" }}
    />
  );
}

// ── Variant A — full list, goals-card idiom (always-visible rows) ────────────

export function VariantA({ data }: { data: MockScenario }) {
  const hasTargets = data.expenseTarget != null || data.savingsTarget != null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="size-4" strokeWidth={1.5} />
          תקציבים
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasTargets && (
          <div className="grid grid-cols-2 gap-3 border-b pb-3 text-sm">
            {data.expenseTarget != null && (
              <div>
                <p className="text-muted-foreground text-xs">יעד הוצאות חודשי</p>
                <p
                  className={`font-semibold tabular-nums ${
                    data.expenseActual > data.expenseTarget ? "text-red-600" : "text-foreground"
                  }`}
                >
                  {ils(data.expenseActual)} מתוך {ils(data.expenseTarget)}
                </p>
              </div>
            )}
            {data.savingsTarget && (
              <div>
                <p className="text-muted-foreground text-xs">יעד חיסכון (סוף חודש)</p>
                <p className="flex items-center gap-2 font-semibold tabular-nums">
                  {ils(data.savingsTarget.netSavings)} מתוך {ils(data.savingsTarget.target)}
                  {data.savingsTarget.verdict && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        data.savingsTarget.verdict === "met"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      {data.savingsTarget.verdict === "met" ? "הושג" : "לא הושג"}
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        {data.budgets.length === 0 ? (
          <BudgetsEmptyState />
        ) : (
          <div className="space-y-3">
            {data.budgets.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: b.categoryColor }}
                  />
                  <span className="truncate font-medium">{b.categoryName}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {ils(b.spent)} / {ils(b.limit)}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[b.verdict]}`}
                  >
                    {VERDICT_LABEL[b.verdict]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Variant B — stat-tile banner + wrap-chip grid (no amounts on the chips) ──

export function VariantB({ data }: { data: MockScenario }) {
  const hasTargets = data.expenseTarget != null || data.savingsTarget != null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="size-4" strokeWidth={1.5} />
          תקציבים
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasTargets && (
          <div className="grid grid-cols-2 gap-3">
            {data.expenseTarget != null && (
              <div className="bg-muted/40 flex items-center gap-2 rounded-lg p-3">
                {data.expenseActual > data.expenseTarget ? (
                  <TrendingUp className="size-4 shrink-0 text-red-600" strokeWidth={1.5} />
                ) : (
                  <TrendingDown
                    className="size-4 shrink-0 text-emerald-600"
                    strokeWidth={1.5}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs">הוצאות מול יעד</p>
                  <p className="truncate text-sm font-semibold tabular-nums">
                    {ils(data.expenseActual)} / {ils(data.expenseTarget)}
                  </p>
                </div>
              </div>
            )}
            {data.savingsTarget && (
              <div className="bg-muted/40 flex items-center gap-2 rounded-lg p-3">
                <Wallet className="text-muted-foreground size-4 shrink-0" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground text-xs">יעד חיסכון</p>
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold tabular-nums">
                      {ils(data.savingsTarget.netSavings)} / {ils(data.savingsTarget.target)}
                    </p>
                    {data.savingsTarget.verdict && (
                      <span
                        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${
                          data.savingsTarget.verdict === "met"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {data.savingsTarget.verdict === "met" ? "הושג" : "לא הושג"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {data.budgets.length === 0 ? (
          <BudgetsEmptyState />
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.budgets.map((b) => (
              <span
                key={b.id}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${VERDICT_CLASS[b.verdict]}`}
                title={`${ils(b.spent)} / ${ils(b.limit)}`}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: b.categoryColor }}
                />
                {b.categoryName}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Variant C — one-line aggregate headline, chips revealed on demand ───────

function aggregateHeadline(data: MockScenario): string {
  if (data.budgets.length === 0) return "";
  const healthy = data.budgets.filter(
    (b) => b.verdict === "on-pace" || b.verdict === "comfortably-under",
  ).length;
  return `${healthy} מתוך ${data.budgets.length} תקציבים בקצב`;
}

export function VariantC({ data }: { data: MockScenario }) {
  const [expanded, setExpanded] = React.useState(false);
  const hasTargets = data.expenseTarget != null || data.savingsTarget != null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="size-4" strokeWidth={1.5} />
          תקציבים
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasTargets && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {data.expenseTarget != null && (
              <span className="text-muted-foreground">
                יעד הוצאות{" "}
                <span
                  className={`font-semibold tabular-nums ${
                    data.expenseActual > data.expenseTarget ? "text-red-600" : "text-foreground"
                  }`}
                >
                  {ils(data.expenseActual)} / {ils(data.expenseTarget)}
                </span>
              </span>
            )}
            {data.savingsTarget && (
              <span className="text-muted-foreground">
                יעד חיסכון{" "}
                <span className="text-foreground font-semibold tabular-nums">
                  {ils(data.savingsTarget.netSavings)} / {ils(data.savingsTarget.target)}
                </span>
                {data.savingsTarget.verdict && (
                  <span
                    className={`mr-1.5 rounded-full border px-1.5 py-0.5 text-[10px] ${
                      data.savingsTarget.verdict === "met"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {data.savingsTarget.verdict === "met" ? "הושג" : "לא הושג"}
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {data.budgets.length === 0 ? (
          <BudgetsEmptyState />
        ) : (
          <>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="hover:bg-muted/40 flex w-full items-center justify-between rounded-md py-1 text-sm"
              aria-expanded={expanded}
            >
              <span className="flex items-center gap-2 font-medium">
                {aggregateHeadline(data)}
                <span className="flex items-center gap-1">
                  {data.budgets.map((b) => (
                    <span
                      key={b.id}
                      className={`size-1.5 rounded-full ${VERDICT_DOT_CLASS[b.verdict]}`}
                    />
                  ))}
                </span>
              </span>
              {expanded ? (
                <ChevronUp className="text-muted-foreground size-4" strokeWidth={1.5} />
              ) : (
                <ChevronDown className="text-muted-foreground size-4" strokeWidth={1.5} />
              )}
            </button>
            {expanded && (
              <div className="space-y-2 border-t pt-2">
                {data.budgets.map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: b.categoryColor }}
                      />
                      <span className="truncate">{b.categoryName}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {ils(b.spent)} / {ils(b.limit)}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[b.verdict]}`}
                      >
                        {VERDICT_LABEL[b.verdict]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
