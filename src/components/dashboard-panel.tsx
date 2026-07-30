"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Amount } from "@/components/ui/amount";
import { SpendingBreakdown } from "@/components/spending-breakdown";
import type { Category } from "@/lib/categories";
import type {
  MonthlySummary,
  CategorySpendingNode,
  AccountBalance,
  RecentTransaction,
  TopMerchant,
} from "@/lib/analytics";
import type { SyncRunSummary } from "@/lib/sync/runs";
import { GoalsProgressCard, type GoalProgressCardData } from "@/components/goals-progress-card";
import { BudgetStatusCard, type BudgetChipData } from "@/components/budget-status-card";
import type {
  BudgetPace,
  BudgetStatus,
  MonthlyTargetsData,
  SavingsTargetStatus,
} from "@/lib/budgets";
import type { TrendsMonthPoint, TrendsReport } from "@/lib/reports";
import { PaceHero } from "@/components/dashboard/pace-hero";
import { AttentionCounters, type AttentionCounts } from "@/components/dashboard/attention-counters";
import { SyncFreshnessPill } from "@/components/dashboard/sync-freshness-pill";
import { TrendMiniChart } from "@/components/dashboard/trend-mini-chart";
import { TopMerchantsCard } from "@/components/dashboard/top-merchants-card";
import {
  UpcomingChargesCard,
  type UpcomingCharge,
} from "@/components/dashboard/upcoming-charges-card";

const HEBREW_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

const BANK_LABELS: Record<string, string> = {
  discount: "דיסקונט",
  max: "מקס",
  visaCal: "ויזה כאל",
};

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

type BudgetsSummaryResponse = {
  budgets: BudgetStatus[];
  monthlyTargets: MonthlyTargetsData;
  savingsTarget: SavingsTargetStatus | null;
  expenseTargetPace: BudgetPace | null;
};

const EMPTY_BUDGETS_SUMMARY: BudgetsSummaryResponse = {
  budgets: [],
  monthlyTargets: { expenseTarget: null, savingsTarget: null },
  savingsTarget: null,
  expenseTargetPace: null,
};

type DashboardData = {
  summary: MonthlySummary | null;
  spending: CategorySpendingNode[];
  balances: AccountBalance[];
  recent: RecentTransaction[];
  lastSyncRuns: SyncRunSummary[];
  upcomingCharges: UpcomingCharge[];
  upcomingTotal: number;
  goals: GoalProgressCardData[];
  goalsSurplus: number;
  budgetsSummary: BudgetsSummaryResponse;
  attention: AttentionCounts | null;
  topMerchants: TopMerchant[];
  trend: TrendsMonthPoint[];
};

const EMPTY_DASHBOARD_DATA: DashboardData = {
  summary: null,
  spending: [],
  balances: [],
  recent: [],
  lastSyncRuns: [],
  upcomingCharges: [],
  upcomingTotal: 0,
  goals: [],
  goalsSurplus: 0,
  budgetsSummary: EMPTY_BUDGETS_SUMMARY,
  attention: null,
  topMerchants: [],
  trend: [],
};

type GoalsResponse = {
  goals: GoalProgressCardData[];
  surplus: number;
};

const EMPTY_GOALS_RESPONSE: GoalsResponse = { goals: [], surplus: 0 };

async function fetchDashboardData(year: number, month: number): Promise<DashboardData> {
  const [
    summaryRes,
    spendingRes,
    balancesRes,
    recentRes,
    syncRunsRes,
    upcomingRes,
    goalsRes,
    budgetsSummaryRes,
    attentionRes,
    topMerchantsRes,
    trendRes,
  ] = await Promise.all([
    fetch(`/api/analytics/monthly?year=${year}&month=${month}`),
    fetch(`/api/analytics/spending-rollup?year=${year}&month=${month}`),
    fetch(`/api/analytics/balances`),
    // 8, not 15: the A′ layout puts the recent list in a half-width column
    // beside Upcoming, and a 15-row column dwarfs it. "צפה בהכל" carries the rest.
    fetch(`/api/analytics/recent?limit=8`),
    fetch(`/api/sync-runs`),
    fetch(`/api/recurring-upcoming`),
    fetch(`/api/goals`),
    fetch(`/api/budgets-summary?year=${year}&month=${month}`),
    fetch(`/api/attention-counts`),
    fetch(`/api/analytics/top-merchants?year=${year}&month=${month}`),
    fetch(`/api/reports/trends?range=12`),
  ]);

  const [
    summary,
    spending,
    balances,
    recent,
    lastSyncRuns,
    upcomingData,
    goalsData,
    budgetsSummary,
    attention,
    topMerchants,
    trendReport,
  ] = await Promise.all([
    summaryRes.ok ? summaryRes.json() : null,
    spendingRes.ok ? spendingRes.json() : [],
    balancesRes.ok ? balancesRes.json() : [],
    recentRes.ok ? recentRes.json() : [],
    syncRunsRes.ok ? syncRunsRes.json() : [],
    upcomingRes.ok ? upcomingRes.json() : { upcoming: [], total: 0 },
    goalsRes.ok ? (goalsRes.json() as Promise<GoalsResponse>) : EMPTY_GOALS_RESPONSE,
    budgetsSummaryRes.ok ? budgetsSummaryRes.json() : EMPTY_BUDGETS_SUMMARY,
    attentionRes.ok ? (attentionRes.json() as Promise<AttentionCounts>) : null,
    topMerchantsRes.ok ? topMerchantsRes.json() : [],
    trendRes.ok ? (trendRes.json() as Promise<TrendsReport>) : null,
  ]);

  return {
    summary,
    spending,
    balances,
    recent,
    lastSyncRuns,
    upcomingCharges: upcomingData.upcoming ?? [],
    upcomingTotal: upcomingData.total ?? 0,
    goals: goalsData.goals ?? [],
    goalsSurplus: goalsData.surplus ?? 0,
    budgetsSummary,
    attention,
    topMerchants,
    trend: trendReport?.months ?? [],
  };
}

// Dates formatted client-side to avoid hydration mismatch (CLAUDE.md rule).
//
// Not the upcoming-charges card's formatter: the balances card wants an
// unpadded "day.month" ("9.8"), not Intl's 2-digit form.
function formatDebitDateHint(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day}.${month}`;
}

function KpiTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DashboardPanel({ categories }: { categories: Category[] }) {
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [data, setData] = React.useState<DashboardData>(EMPTY_DASHBOARD_DATA);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- removed during Phase 2 Server Actions migration (see PRD issue #35)
    setLoading(true);
    fetchDashboardData(year, month)
      .then(setData)
      .finally(() => setLoading(false));
  }, [year, month]);

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  const {
    summary,
    spending,
    balances,
    recent,
    lastSyncRuns,
    upcomingCharges,
    upcomingTotal,
    goals,
    goalsSurplus,
    budgetsSummary,
    attention,
    topMerchants,
    trend,
  } = data;

  // Budgets only ever attach to expense-type categories (src/lib/budgets
  // enforces this at write time), so this lookup only ever needs to resolve
  // an expense category's display name/color for the chip row.
  const categoriesById = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const budgetChips: BudgetChipData[] = React.useMemo(
    () =>
      budgetsSummary.budgets.map(({ budget, pace }) => {
        const category = categoriesById.get(budget.categoryId);
        return {
          id: budget.id,
          categoryName: category?.name ?? "—",
          categoryColor: category?.color ?? "#9ca3af",
          verdict: pace.verdict,
          spent: pace.spent,
          limit: pace.limit,
        };
      }),
    [budgetsSummary.budgets, categoriesById],
  );

  // A brand-new account returns a zeroed summary object (not null), so checking
  // `summary === null` alone never fires. Treat an all-zero summary as empty too;
  // the other clauses (no balances/recent/spending/upcoming) keep an existing user
  // viewing a quiet month out of this branch — they still have bank balances.
  const summaryIsEmpty =
    summary === null ||
    (summary.income === 0 && summary.expenses === 0 && summary.investmentTotal === 0);

  const hasNoData =
    summaryIsEmpty &&
    spending.length === 0 &&
    balances.length === 0 &&
    recent.length === 0 &&
    upcomingCharges.length === 0;

  return (
    <div className="space-y-6">
      {/*
       * .stagger is scoped to this month-nav block only — it doesn't depend on
       * `loading`, so this wrapper's children never remount on the month-strip
       * refetch below. (The sync freshness pill lives *inside* the month-nav
       * child, so it doesn't occupy a stagger position of its own.) The data
       * slots past this point DO remount every refetch (the loading ternary
       * swaps their JSX), so they stay unanimated (#202).
       */}
      <div className="stagger space-y-6">
        {/* Header — month navigation + sync-freshness pill */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight">לוח בקרה</h2>
          <div className="flex items-center gap-3">
            <SyncFreshnessPill runs={lastSyncRuns} />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={nextMonth} aria-label="חודש הבא">
                <ChevronRight className="size-4" />
              </Button>
              <span className="min-w-32 text-center text-sm font-medium">
                {HEBREW_MONTHS[month - 1]} {year}
              </span>
              <Button variant="outline" size="icon" onClick={prevMonth} aria-label="חודש קודם">
                <ChevronLeft className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          {/* Pace hero skeleton */}
          <Card>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-3 w-full" />
            </CardContent>
          </Card>
          {/* KPI band skeleton */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={`sk-kpi-${i}`}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-28" />
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Breakdown skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          {/* Recent transactions skeleton */}
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`sk-tx-${i}`} className="flex items-center justify-between px-1 py-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      ) : hasNoData ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Wallet}
              heading="אין נתונים"
              explainer="לא נטענו עסקאות. התחבר לבנק הראשון שלך כדי להתחיל."
              cta={{ label: "עבור להגדרות", href: "/settings" }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 transition-opacity duration-150">
          {/* ── Monthly band — everything below is scoped to the month strip ── */}

          <PaceHero pace={budgetsSummary.expenseTargetPace} />

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiTile label="הכנסות">
              {summary ? (
                <Amount amount={summary.income} fractionDigits={0} className="text-2xl font-bold" />
              ) : (
                <p className="text-2xl font-bold">—</p>
              )}
            </KpiTile>

            <KpiTile label="הוצאות">
              {summary ? (
                // summary.expenses is a stored positive magnitude (analytics sums
                // Math.abs), so sign-driven colorize would read it as positive money
                // and go emerald. Expenses are money-out: force the --neg token.
                <Amount
                  amount={summary.expenses}
                  fractionDigits={0}
                  colorize={false}
                  className="text-neg text-2xl font-bold"
                />
              ) : (
                <p className="text-2xl font-bold">—</p>
              )}
            </KpiTile>

            <KpiTile label="חיסכון נטו">
              {summary ? (
                <Amount
                  amount={summary.netSavings}
                  fractionDigits={0}
                  className="text-2xl font-bold"
                />
              ) : (
                <p className="text-2xl font-bold">—</p>
              )}
            </KpiTile>

            <KpiTile label="אחוז חיסכון">
              <p
                className={`text-2xl font-bold ${
                  summary && summary.savingsRate >= 0 ? "text-pos" : "text-neg"
                }`}
              >
                {summary ? formatPercent(summary.savingsRate) : "—"}
              </p>
              {summary && (
                <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-bar-strong h-full rounded-full transition-all"
                    style={{ width: `${Math.min(Math.max(summary.savingsRate, 0), 100)}%` }}
                  />
                </div>
              )}
            </KpiTile>
          </div>

          <AttentionCounters counts={attention} />

          {/* Spending breakdown — group-first with drill-down (BGR5 #162). Sits
              directly above budgets so the two monthly spend views are adjacent
              (#108 gate adjudication). */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">הוצאות לפי קטגוריה</CardTitle>
            </CardHeader>
            <CardContent>
              <SpendingBreakdown nodes={spending} />
            </CardContent>
          </Card>

          {/* Budgets — pace chips + targets headline (BGR9 #166). The duplicate
              spend-vs-ceiling headline is dropped by #205, which makes the pace
              hero the sole owner of that figure. */}
          <BudgetStatusCard
            budgets={budgetChips}
            targetsHeadline={{
              expenseTarget: budgetsSummary.monthlyTargets.expenseTarget,
              expenseActual: summary?.expenses ?? 0,
              savingsTarget: budgetsSummary.savingsTarget,
            }}
          />

          {/* ── Long-horizon band — month-independent widgets: goals always
                track today's real month (CONTEXT.md "savings goal") and
                balances are current-state, so the month strip doesn't scope
                either of them. ── */}

          <GoalsProgressCard goals={goals} surplus={goalsSurplus} />

          {balances.length > 0 && (
            <div>
              <h3 className="mb-3 text-base font-semibold">יתרות חשבון</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {balances.map((acc) => (
                  <Card key={acc.id}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{acc.displayName}</p>
                          <p className="text-muted-foreground text-xs">
                            ****{acc.accountNumber.slice(-4)}
                          </p>
                        </div>
                        <div className="text-left">
                          <Badge variant="outline" className="mb-1 text-xs">
                            {BANK_LABELS[acc.bankType] ?? acc.bankType}
                          </Badge>
                          {acc.balance !== null ? (
                            <Amount
                              amount={acc.balance}
                              fractionDigits={0}
                              className="text-sm font-semibold"
                            />
                          ) : (
                            <p className="text-sm font-semibold">—</p>
                          )}
                          {acc.nextDebitDate && acc.balance !== 0 && (
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              חיוב קרוב · {formatDebitDateHint(acc.nextDebitDate)}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Past | future activity, side by side */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold">עסקאות אחרונות</h3>
                <Link
                  href="/transactions"
                  className="text-muted-foreground text-sm hover:underline"
                >
                  צפה בהכל
                </Link>
              </div>
              <Card>
                <CardContent className="p-0">
                  {recent.length === 0 ? (
                    <p className="text-muted-foreground p-4 text-sm">אין עסקאות להצגה</p>
                  ) : (
                    <div className="divide-y">
                      {recent.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {tx.customDescription ?? tx.description}
                            </p>
                            <p className="text-muted-foreground text-xs">{tx.date}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                            {tx.categoryName && (
                              <Badge
                                variant="outline"
                                className="text-xs"
                                style={
                                  tx.categoryColor
                                    ? {
                                        borderColor: tx.categoryColor,
                                        color: tx.categoryColor,
                                      }
                                    : undefined
                                }
                              >
                                {tx.categoryName}
                              </Badge>
                            )}
                            <Amount
                              amount={tx.chargedAmount}
                              fractionDigits={0}
                              className="text-sm font-semibold"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            <div>
              <h3 className="mb-3 text-base font-semibold">צפוי בהמשך</h3>
              <UpcomingChargesCard charges={upcomingCharges} total={upcomingTotal} />
            </div>
          </div>

          {/* Bottom band — secondary, backward-looking (full trend on דוחות) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TrendMiniChart months={trend} />
            <TopMerchantsCard merchants={topMerchants} />
          </div>
        </div>
      )}
    </div>
  );
}
