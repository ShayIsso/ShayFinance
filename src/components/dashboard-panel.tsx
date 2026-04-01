"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import type { Category } from "@/lib/categories";
import type {
  MonthlySummary,
  CategorySpending,
  AccountBalance,
  RecentTransaction,
} from "@/lib/analytics";

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

type DashboardData = {
  summary: MonthlySummary | null;
  spending: CategorySpending[];
  balances: AccountBalance[];
  recent: RecentTransaction[];
};

async function fetchDashboardData(year: number, month: number): Promise<DashboardData> {
  const [summaryRes, spendingRes, balancesRes, recentRes] = await Promise.all([
    fetch(`/api/analytics/monthly?year=${year}&month=${month}`),
    fetch(`/api/analytics/spending-by-category?year=${year}&month=${month}`),
    fetch(`/api/analytics/balances`),
    fetch(`/api/analytics/recent?limit=15`),
  ]);

  const [summary, spending, balances, recent] = await Promise.all([
    summaryRes.ok ? summaryRes.json() : null,
    spendingRes.ok ? spendingRes.json() : [],
    balancesRes.ok ? balancesRes.json() : [],
    recentRes.ok ? recentRes.json() : [],
  ]);

  return { summary, spending, balances, recent };
}

export function DashboardPanel({ categories: _categories }: { categories: Category[] }) {
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [data, setData] = React.useState<DashboardData>({
    summary: null,
    spending: [],
    balances: [],
    recent: [],
  });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
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

  const { summary, spending, balances, recent } = data;

  const chartConfig: ChartConfig = spending.reduce<ChartConfig>((cfg, item) => {
    cfg[item.categoryId] = { label: item.categoryName, color: item.color };
    return cfg;
  }, {});

  return (
    <div className="space-y-6">
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

      {loading && <p className="text-muted-foreground text-sm">טוען נתונים...</p>}

      {/* Savings summary — 3 cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">חיסכון נטו</CardTitle>
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
            <CardTitle className="text-muted-foreground text-sm font-medium">אחוז חיסכון</CardTitle>
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

      {/* Account balances */}
      {balances.length > 0 && (
        <div>
          <h3 className="mb-3 text-base font-semibold">יתרות חשבון</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((acc) => (
              <Card key={`${acc.bankType}-${acc.accountNumber}`}>
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
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Spending by category chart */}
      {spending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">הוצאות לפי קטגוריה</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <BarChart
                data={spending.map((s) => ({
                  name: s.categoryName,
                  amount: s.amount,
                  id: s.categoryId,
                  color: s.color,
                }))}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
              >
                <XAxis
                  type="number"
                  tickFormatter={(v) => formatCurrency(v)}
                  tick={{ fontSize: 11 }}
                />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />
                  }
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {spending.map((s) => (
                    <Cell key={s.categoryId} fill={s.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

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
                  <div key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3">
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
  );
}
