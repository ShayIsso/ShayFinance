"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  Repeat,
  ChevronDown,
  ChevronUp,
  Wallet,
} from "lucide-react";
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
} from "@/lib/analytics";
import { LastSyncStrip } from "@/components/last-sync-strip";
import type { SyncRunSummary } from "@/lib/sync/runs";
import { GoalsProgressCard, type GoalProgressCardData } from "@/components/goals-progress-card";
import { BudgetStatusCard, type BudgetChipData } from "@/components/budget-status-card";
import type { BudgetStatus, MonthlyTargetsData, SavingsTargetStatus } from "@/lib/budgets";

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

type UpcomingCharge = {
  id: string;
  merchant: string;
  expectedAmount: number;
  cadence: "monthly" | "quarterly" | "annual";
  nextExpectedDate: string;
};

type BudgetsSummaryResponse = {
  budgets: BudgetStatus[];
  monthlyTargets: MonthlyTargetsData;
  savingsTarget: SavingsTargetStatus | null;
};

const EMPTY_BUDGETS_SUMMARY: BudgetsSummaryResponse = {
  budgets: [],
  monthlyTargets: { expenseTarget: null, savingsTarget: null },
  savingsTarget: null,
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
  ] = await Promise.all([
    fetch(`/api/analytics/monthly?year=${year}&month=${month}`),
    fetch(`/api/analytics/spending-rollup?year=${year}&month=${month}`),
    fetch(`/api/analytics/balances`),
    fetch(`/api/analytics/recent?limit=15`),
    fetch(`/api/sync-runs`),
    fetch(`/api/recurring-upcoming`),
    fetch(`/api/goals`),
    fetch(`/api/budgets-summary?year=${year}&month=${month}`),
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
  ] = await Promise.all([
    summaryRes.ok ? summaryRes.json() : null,
    spendingRes.ok ? spendingRes.json() : [],
    balancesRes.ok ? balancesRes.json() : [],
    recentRes.ok ? recentRes.json() : [],
    syncRunsRes.ok ? syncRunsRes.json() : [],
    upcomingRes.ok ? upcomingRes.json() : { upcoming: [], total: 0 },
    goalsRes.ok ? (goalsRes.json() as Promise<GoalsResponse>) : EMPTY_GOALS_RESPONSE,
    budgetsSummaryRes.ok ? budgetsSummaryRes.json() : EMPTY_BUDGETS_SUMMARY,
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
  };
}

const CADENCE_LABELS: Record<UpcomingCharge["cadence"], string> = {
  monthly: "חודשי",
  quarterly: "רבעוני",
  annual: "שנתי",
};

// Dates formatted client-side to avoid hydration mismatch (CLAUDE.md rule)

function formatUpcomingDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(year, month - 1, day));
}

// Not formatUpcomingDate: the balances card wants an unpadded "day.month" ("9.8"),
// not Intl's 2-digit form.
function formatDebitDateHint(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day}.${month}`;
}

function UpcomingChargesCard({ charges, total }: { charges: UpcomingCharge[]; total: number }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-emerald-600" strokeWidth={1.5} />
            <CardTitle className="text-base font-semibold">חיובים קרובים</CardTitle>
          </div>
          {charges.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-xs">7 ימים הקרובים</span>
              <Amount
                amount={total}
                currency="ILS"
                colorize={false}
                className="text-sm font-semibold tabular-nums"
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {charges.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין חיובים חוזרים צפויים בשבוע הקרוב</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                {charges.length} חיוב{charges.length !== 1 ? "ים" : ""} צפוי
                {charges.length !== 1 ? "ים" : ""}
              </span>
              <button
                onClick={() => setExpanded((e) => !e)}
                className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-xs"
                aria-expanded={expanded}
              >
                {expanded ? (
                  <>
                    הסתר
                    <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </>
                ) : (
                  <>
                    הצג פירוט
                    <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </>
                )}
              </button>
            </div>
            {expanded && (
              <div className="divide-y rounded-md border">
                {charges.map((charge) => (
                  <div key={charge.id} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{charge.merchant}</p>
                      <p className="text-muted-foreground text-xs">
                        {CADENCE_LABELS[charge.cadence]} &middot;{" "}
                        {formatUpcomingDate(charge.nextExpectedDate)}
                      </p>
                    </div>
                    <Amount
                      amount={charge.expectedAmount}
                      currency="ILS"
                      colorize={false}
                      className="text-sm tabular-nums"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardPanel({
  categories,
  pendingReconCount = 0,
}: {
  categories: Category[];
  pendingReconCount?: number;
}) {
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [data, setData] = React.useState<DashboardData>({
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
  });
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
       * .stagger is scoped to this month-nav/recon-strip/sync-strip block
       * only — none of these three depend on `loading`, so this wrapper's
       * children never remount on the month-strip refetch below. The
       * Goals/data slots past this point DO remount every refetch (the
       * loading ternary swaps their JSX), so they stay unanimated (#202).
       */}
      <div className="stagger space-y-6">
        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">לוח בקרה</h2>
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

        {/* Reconciliation pending strip */}
        {pendingReconCount > 0 && (
          <Link
            href="/reconciliation"
            className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
          >
            <Inbox className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>{pendingReconCount} התאמות ממתינות לאישור</span>
            <span className="mr-auto text-xs text-amber-600">לחץ לאישור &#x2190;</span>
          </Link>
        )}

        {/* Last sync strip */}
        {lastSyncRuns.length > 0 && <LastSyncStrip runs={lastSyncRuns} />}
      </div>

      {/* Goals progress — independent of the month strip below (always
          today's real month, per CONTEXT.md "savings goal"), so it renders
          on its own loading cycle rather than waiting on month-scoped data. */}
      {loading ? (
        <Card>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-2 w-full" />
          </CardContent>
        </Card>
      ) : (
        <GoalsProgressCard goals={goals} surplus={goalsSurplus} />
      )}

      {loading ? (
        <div className="space-y-6">
          {/* Summary cards skeleton */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={`sk-summary-${i}`}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Income / Expenses skeleton */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={`sk-ie-${i}`}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-28" />
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Chart skeleton */}
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
          {/* Savings summary — 3 cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  חיסכון נטו
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className={`text-2xl font-bold ${
                    summary && summary.netSavings >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {summary ? formatCurrency(summary.netSavings) : "—"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  אחוז חיסכון
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className={`text-2xl font-bold ${
                    summary && summary.savingsRate >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {summary ? formatPercent(summary.savingsRate) : "—"}
                </p>
                {summary && (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(Math.max(summary.savingsRate, 0), 100)}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">הושקע</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-600">
                  {summary ? formatCurrency(summary.investmentTotal) : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Income / Expenses — 2 cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">הכנסות</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-600">
                  {summary ? formatCurrency(summary.income) : "—"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-muted-foreground text-sm font-medium">הוצאות</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">
                  {summary ? formatCurrency(summary.expenses) : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Budgets — pace chips + targets headline (BGR9 #166) */}
          <BudgetStatusCard
            budgets={budgetChips}
            targetsHeadline={{
              expenseTarget: budgetsSummary.monthlyTargets.expenseTarget,
              expenseActual: summary?.expenses ?? 0,
              savingsTarget: budgetsSummary.savingsTarget,
            }}
          />

          {/* Upcoming charges */}
          <UpcomingChargesCard charges={upcomingCharges} total={upcomingTotal} />

          {/* Account balances */}
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
                          <p
                            className={`text-sm font-semibold ${
                              acc.balance !== null && acc.balance >= 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            {acc.balance !== null ? formatCurrency(acc.balance) : "—"}
                          </p>
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

          {/* Spending breakdown — group-first with drill-down (BGR5 #162) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">הוצאות לפי קטגוריה</CardTitle>
            </CardHeader>
            <CardContent>
              <SpendingBreakdown nodes={spending} />
            </CardContent>
          </Card>

          {/* Recent transactions */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">עסקאות אחרונות</h3>
              <Link href="/transactions" className="text-muted-foreground text-sm hover:underline">
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
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {tx.customDescription ?? tx.description}
                          </p>
                          <p className="text-muted-foreground text-xs">{tx.date}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
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
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              tx.chargedAmount >= 0 ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {formatCurrency(tx.chargedAmount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
