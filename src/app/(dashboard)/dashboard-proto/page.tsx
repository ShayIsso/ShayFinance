"use client";

/**
 * THROWAWAY PROTOTYPE — dashboard widget inventory + premium home layout (#108).
 *
 * Question: which widgets make the Phase-3 dashboard, in what layout? Three
 * structurally different layouts, each with a different hero and information
 * hierarchy, switchable via `?variant=` + the floating bar:
 *   A — "On track?"        pace-hero command center (budget pace is the hero)
 *   B — "How am I trending?" statement/reporting layout (trend chart is the hero)
 *   C — "What needs me?"   triage/action layout (attention + freshness lead)
 *
 * Read-only. Real data where a query exists; the three inventory gaps
 * (top merchants, needs-attention counters, pace-hero composite) are computed
 * client-side or stubbed — this gate judges LAYOUT, not the numbers. Not for
 * production. Query→widget mapping is recorded on #108.
 */
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Gauge,
  TrendingUp,
  Store,
  Inbox,
  AlertTriangle,
  Tag,
  ArrowLeftRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Amount } from "@/components/ui/amount";
import { SpendingBreakdown } from "@/components/spending-breakdown";
import { LastSyncStrip } from "@/components/last-sync-strip";
import { GoalsProgressCard, type GoalProgressCardData } from "@/components/goals-progress-card";
import { BudgetStatusCard, type BudgetChipData } from "@/components/budget-status-card";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import type { Category } from "@/lib/categories";
import type { MonthlySummary, CategorySpendingNode, RecentTransaction } from "@/lib/analytics";
import type { SyncRunSummary } from "@/lib/sync/runs";
import type { BudgetStatus, MonthlyTargetsData, SavingsTargetStatus } from "@/lib/budgets";

const VARIANTS = [
  { key: "A", name: "On track? · pace hero" },
  { key: "B", name: "How am I trending? · statement" },
  { key: "C", name: "What needs me? · triage" },
];

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

// ---- data ----

type UpcomingCharge = {
  id: string;
  merchant: string;
  expectedAmount: number;
  cadence: "monthly" | "quarterly" | "annual";
  nextExpectedDate: string;
};
type TrendPoint = {
  year: number;
  month: number;
  netSavings: number;
  income: number;
  expenses: number;
};

type ProtoData = {
  summary: MonthlySummary | null;
  spending: CategorySpendingNode[];
  recent: RecentTransaction[];
  lastSyncRuns: SyncRunSummary[];
  upcomingCharges: UpcomingCharge[];
  upcomingTotal: number;
  goals: GoalProgressCardData[];
  goalsSurplus: number;
  budgets: BudgetStatus[];
  monthlyTargets: MonthlyTargetsData;
  savingsTarget: SavingsTargetStatus | null;
  categories: Category[];
  trend: TrendPoint[];
};

const EMPTY: ProtoData = {
  summary: null,
  spending: [],
  recent: [],
  lastSyncRuns: [],
  upcomingCharges: [],
  upcomingTotal: 0,
  goals: [],
  goalsSurplus: 0,
  budgets: [],
  monthlyTargets: { expenseTarget: null, savingsTarget: null },
  savingsTarget: null,
  categories: [],
  trend: [],
};

async function jsonOr<T>(p: Promise<Response>, fallback: T): Promise<T> {
  try {
    const res = await p;
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function fetchAll(year: number, month: number): Promise<ProtoData> {
  const [
    summary,
    spending,
    recent,
    lastSyncRuns,
    upcoming,
    goals,
    budgetsSummary,
    categories,
    trend,
  ] = await Promise.all([
    jsonOr<MonthlySummary | null>(
      fetch(`/api/analytics/monthly?year=${year}&month=${month}`),
      null,
    ),
    jsonOr<CategorySpendingNode[]>(
      fetch(`/api/analytics/spending-rollup?year=${year}&month=${month}`),
      [],
    ),
    jsonOr<RecentTransaction[]>(fetch(`/api/analytics/recent?limit=25`), []),
    jsonOr<SyncRunSummary[]>(fetch(`/api/sync-runs`), []),
    jsonOr<{ upcoming: UpcomingCharge[]; total: number }>(fetch(`/api/proto-upcoming`), {
      upcoming: [],
      total: 0,
    }),
    jsonOr<{ goals: GoalProgressCardData[]; surplus: number }>(fetch(`/api/goals`), {
      goals: [],
      surplus: 0,
    }),
    jsonOr<{
      budgets: BudgetStatus[];
      monthlyTargets: MonthlyTargetsData;
      savingsTarget: SavingsTargetStatus | null;
    }>(fetch(`/api/budgets-summary?year=${year}&month=${month}`), {
      budgets: [],
      monthlyTargets: { expenseTarget: null, savingsTarget: null },
      savingsTarget: null,
    }),
    jsonOr<Category[]>(fetch(`/api/categories`), []),
    jsonOr<{ months: TrendPoint[] }>(fetch(`/api/reports/trends?range=12`), { months: [] }),
  ]);

  return {
    summary,
    spending,
    recent,
    lastSyncRuns,
    upcomingCharges: upcoming.upcoming ?? [],
    upcomingTotal: upcoming.total ?? 0,
    goals: goals.goals ?? [],
    goalsSurplus: goals.surplus ?? 0,
    budgets: budgetsSummary.budgets ?? [],
    monthlyTargets: budgetsSummary.monthlyTargets ?? { expenseTarget: null, savingsTarget: null },
    savingsTarget: budgetsSummary.savingsTarget ?? null,
    categories,
    trend: trend.months ?? [],
  };
}

// ---- derived (inventory gaps computed client-side / stubbed for the gate) ----

type PaceVerdict = "over" | "at-risk" | "on-pace" | "under" | "no-target";

function computePace(
  summary: MonthlySummary | null,
  expenseTarget: number | null,
  year: number,
  month: number,
): {
  verdict: PaceVerdict;
  spent: number;
  target: number | null;
  elapsedFrac: number;
  sentence: string;
} {
  const spent = summary?.expenses ?? 0;
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const elapsedFrac = isCurrentMonth ? Math.min(now.getDate() / daysInMonth, 1) : 1;

  if (expenseTarget === null || expenseTarget <= 0) {
    return {
      verdict: "no-target",
      spent,
      target: null,
      elapsedFrac,
      sentence: "לא הוגדרה תקרת הוצאות חודשית — קבע יעד בהגדרות כדי לראות את הקצב.",
    };
  }
  const projected = elapsedFrac > 0 ? spent / elapsedFrac : spent;
  let verdict: PaceVerdict;
  let sentence: string;
  if (spent > expenseTarget) {
    verdict = "over";
    sentence = `חרגת מהתקרה ב-${formatCurrency(spent - expenseTarget)}.`;
  } else if (projected > expenseTarget * 1.1) {
    verdict = "at-risk";
    sentence = `בקצב הנוכחי צפויה חריגה — תחזית ${formatCurrency(projected)} מול תקרה ${formatCurrency(expenseTarget)}.`;
  } else if (projected < expenseTarget * 0.8) {
    verdict = "under";
    sentence = `הרבה מתחת לתקרה — נותרו ${formatCurrency(expenseTarget - spent)} עד סוף החודש.`;
  } else {
    verdict = "on-pace";
    sentence = `בקצב תקין — ${formatCurrency(spent)} מתוך ${formatCurrency(expenseTarget)}.`;
  }
  return { verdict, spent, target: expenseTarget, elapsedFrac, sentence };
}

const PACE_FILL: Record<PaceVerdict, string> = {
  over: "bg-red-500",
  "at-risk": "bg-amber-500",
  "on-pace": "bg-emerald-500",
  under: "bg-emerald-500",
  "no-target": "bg-slate-300",
};

type Merchant = { name: string; total: number; count: number };

// Card-settlement debits and cheque/transfer rows dwarf real merchants (the
// whole card bill lands as one row), so they must not count as "top merchants".
// The real query excludes transfer/ignore category types + the card_settlement
// descriptor (transaction-matching #145); here we approximate with categoryType
// + a settlement/cheque name pattern for uncategorized rows.
const SETTLEMENT_RE = /משיכת שיק|כ["'׳.]?א["'׳.]?ל|מקס איט|ויזה כאל|ישראכרט|לאומי קארד|העברה/;

function computeTopMerchants(recent: RecentTransaction[]): Merchant[] {
  const map = new Map<string, Merchant>();
  for (const tx of recent) {
    if (tx.chargedAmount >= 0) continue; // expenses only
    if (tx.categoryType && tx.categoryType !== "expense") continue; // no transfer/ignore/income/investment
    const name = tx.customDescription ?? tx.description;
    if (SETTLEMENT_RE.test(name)) continue;
    const cur = map.get(name) ?? { name, total: 0, count: 0 };
    cur.total += Math.abs(tx.chargedAmount);
    cur.count += 1;
    map.set(name, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
}

// STUB — no count query exists yet (#108 gap: uncategorized / needs-review /
// anomaly counters need dedicated aggregates). Sample values so the layout reads
// at realistic density; judge placement, not the numbers.
const ATTENTION_STUB = { uncategorized: 12, reviewQueue: 3, anomalies: 2 };

// ---- shared presentational widgets ----

function PaceHeroCard({ pace, large }: { pace: ReturnType<typeof computePace>; large?: boolean }) {
  const pct = pace.target ? Math.min((pace.spent / pace.target) * 100, 100) : 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-slate-500" strokeWidth={1.5} />
          <CardTitle className="text-base font-semibold">קצב הוצאה חודשי</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between">
          <p className={`font-bold tabular-nums ${large ? "text-4xl" : "text-2xl"}`}>
            {formatCurrency(pace.spent)}
          </p>
          {pace.target !== null && (
            <p className="text-muted-foreground text-sm">מתוך תקרה {formatCurrency(pace.target)}</p>
          )}
        </div>
        {pace.target !== null && (
          <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${PACE_FILL[pace.verdict]}`}
              style={{ width: `${pct}%` }}
            />
            {/* time-elapsed tick */}
            <div
              className="absolute top-0 h-full w-0.5 bg-slate-700"
              style={{ right: `${pace.elapsedFrac * 100}%` }}
              title="חלק החודש שחלף"
            />
          </div>
        )}
        <p className="text-sm text-slate-600">{pace.sentence}</p>
      </CardContent>
    </Card>
  );
}

function KpiTile({
  label,
  value,
  tone,
  bar,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "invest" | "neutral";
  bar?: number;
}) {
  const color =
    tone === "pos"
      ? "text-emerald-600"
      : tone === "neg"
        ? "text-red-600"
        : tone === "invest"
          ? "text-blue-600"
          : "text-slate-900";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
        {bar !== undefined && (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.min(Math.max(bar, 0), 100)}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CashFlowBand({ summary }: { summary: MonthlySummary | null }) {
  const income = summary?.income ?? 0;
  const expenses = summary?.expenses ?? 0;
  const net = summary?.netSavings ?? 0;
  return (
    <Card>
      <CardContent className="flex flex-col items-stretch gap-4 py-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-muted-foreground text-xs">הכנסות</p>
          <p className="text-xl font-bold text-emerald-600 tabular-nums">
            {formatCurrency(income)}
          </p>
        </div>
        <ArrowLeftRight className="hidden size-4 text-slate-300 sm:block" />
        <div className="flex-1">
          <p className="text-muted-foreground text-xs">הוצאות</p>
          <p className="text-xl font-bold text-red-600 tabular-nums">{formatCurrency(expenses)}</p>
        </div>
        <div className="hidden h-10 w-px bg-slate-200 sm:block" />
        <div className="flex-1">
          <p className="text-muted-foreground text-xs">נטו</p>
          <p
            className={`text-xl font-bold tabular-nums ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {formatCurrency(net)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function TrendMiniChart({ trend, large }: { trend: TrendPoint[]; large?: boolean }) {
  const max = Math.max(1, ...trend.map((p) => Math.abs(p.netSavings)));
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-slate-500" strokeWidth={1.5} />
          <CardTitle className="text-base font-semibold">מגמת חיסכון נטו · 12 חודשים</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {trend.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין נתונים היסטוריים</p>
        ) : (
          // Bars fill the card height (flex-1 growth area, % heights) so the card
          // has no dead space when a taller sibling stretches the grid row.
          <div
            className="flex h-full items-stretch justify-between gap-1"
            dir="ltr"
            style={{ minHeight: large ? 200 : 150 }}
          >
            {trend.map((p) => {
              const pct = (Math.abs(p.netSavings) / max) * 100;
              const pos = p.netSavings >= 0;
              return (
                <div
                  key={`${p.year}-${p.month}`}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t ${pos ? "bg-emerald-500" : "bg-red-400"}`}
                      style={{ height: `${Math.max(pct, 1)}%` }}
                      title={`${HEBREW_MONTHS[p.month - 1]}: ${formatCurrency(p.netSavings)}`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400">{p.month}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TopMerchantsCard({ merchants }: { merchants: Merchant[] }) {
  const max = Math.max(1, ...merchants.map((m) => m.total));
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Store className="h-4 w-4 text-slate-500" strokeWidth={1.5} />
          <CardTitle className="text-base font-semibold">בתי עסק מובילים</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {merchants.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין נתונים</p>
        ) : (
          merchants.map((m) => (
            <div key={m.name} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate">{m.name}</span>
                <span className="text-slate-600 tabular-nums">{formatCurrency(m.total)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-400"
                  style={{ width: `${(m.total / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function AttentionCounters({ layout }: { layout: "row" | "stack" }) {
  const items = [
    {
      icon: Tag,
      label: "ללא סיווג",
      count: ATTENTION_STUB.uncategorized,
      href: "/transactions?uncategorized=1",
      tone: "amber",
    },
    {
      icon: Inbox,
      label: "בתור לבדיקה",
      count: ATTENTION_STUB.reviewQueue,
      href: "/transactions?needsReview=1",
      tone: "sky",
    },
    {
      icon: AlertTriangle,
      label: "חריגות",
      count: ATTENTION_STUB.anomalies,
      href: "/subscriptions",
      tone: "red",
    },
  ] as const;
  const tones: Record<string, string> = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <div className={layout === "row" ? "grid grid-cols-3 gap-3" : "space-y-3"}>
      {items.map((it) => (
        <Link
          key={it.label}
          href={it.href}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:opacity-80 ${tones[it.tone]}`}
        >
          <it.icon className="h-5 w-5 shrink-0" strokeWidth={1.5} />
          <div className="min-w-0">
            <p className="text-2xl leading-none font-bold tabular-nums">{it.count}</p>
            <p className="mt-1 text-xs font-medium">{it.label}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function RecentTxCard({ recent, limit = 8 }: { recent: RecentTransaction[]; limit?: number }) {
  return (
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
              {recent.slice(0, limit).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
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
                            ? { borderColor: tx.categoryColor, color: tx.categoryColor }
                            : undefined
                        }
                      >
                        {tx.categoryName}
                      </Badge>
                    )}
                    <span
                      className={`text-sm font-semibold tabular-nums ${tx.chargedAmount >= 0 ? "text-emerald-600" : "text-red-600"}`}
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
  );
}

function UpcomingCard({ charges, total }: { charges: UpcomingCharge[]; total: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">חיובים קרובים</CardTitle>
          {charges.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">30 הימים הקרובים</span>
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
          <p className="text-muted-foreground text-sm">אין חיובים חוזרים צפויים</p>
        ) : (
          <div className="divide-y">
            {charges.slice(0, 8).map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{c.merchant}</p>
                  <p className="text-muted-foreground text-xs">{c.nextExpectedDate}</p>
                </div>
                <Amount
                  amount={c.expectedAmount}
                  currency="ILS"
                  colorize={false}
                  className="text-sm tabular-nums"
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold">{children}</h3>;
}

function BreakdownCard({ nodes }: { nodes: CategorySpendingNode[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">הוצאות לפי קטגוריה</CardTitle>
      </CardHeader>
      <CardContent>
        <SpendingBreakdown nodes={nodes} />
      </CardContent>
    </Card>
  );
}

function budgetChipsFrom(data: ProtoData): BudgetChipData[] {
  const byId = new Map(data.categories.map((c) => [c.id, c]));
  return data.budgets.map(({ budget, pace }) => {
    const cat = byId.get(budget.categoryId);
    return {
      id: budget.id,
      categoryName: cat?.name ?? "—",
      categoryColor: cat?.color ?? "#9ca3af",
      verdict: pace.verdict,
      spent: pace.spent,
      limit: pace.limit,
    };
  });
}

// At-a-glance sync freshness only — aggregate age (Shay syncs all accounts
// together), links to /sync for per-account detail. Amber is the app's existing
// attention accent (recon strip, budgets); fresh state stays neutral, never
// emerald (reserved for positive balances).
function LastSyncCube({ runs }: { runs: SyncRunSummary[] }) {
  if (runs.length === 0) return null;
  const anyError = runs.some((r) => r.status === "error");
  const latest = runs
    .map((r) => r.finishedAt)
    .filter(Boolean)
    .map((d) => new Date(d as unknown as string))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const daysAgo = latest ? Math.floor((Date.now() - latest.getTime()) / 86_400_000) : Infinity;
  const stale = anyError || daysAgo > 3;
  const label = anyError
    ? "סנכרון עם שגיאה"
    : daysAgo <= 0
      ? "עודכן היום"
      : daysAgo === 1
        ? "עודכן אתמול"
        : stale
          ? `לא סונכרן ${daysAgo} ימים`
          : `עודכן לפני ${daysAgo} ימים`;

  return (
    <Link
      href="/sync"
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        stale
          ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      <RefreshCw
        className={`h-3.5 w-3.5 ${stale ? "text-amber-600" : "text-slate-400"}`}
        strokeWidth={1.5}
      />
      {label}
    </Link>
  );
}

// ---- variants ----

// Refined A′ — the gate pick (#108). Pace hero leads; goals + top merchants
// live in the main flow (not a cramped rail); last-sync is a small cube;
// חיובים קרובים dropped; compact trend at the foot.
function VariantA(props: { data: ProtoData; year: number; month: number }) {
  const { data } = props;
  const pace = computePace(
    data.summary,
    data.monthlyTargets.expenseTarget,
    props.year,
    props.month,
  );
  const s = data.summary;
  return (
    <div className="space-y-6">
      {/* HERO: pace */}
      <PaceHeroCard pace={pace} large />

      {/* KPI band */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTile label="הכנסות" value={formatCurrency(s?.income ?? 0)} tone="pos" />
        <KpiTile label="הוצאות" value={formatCurrency(s?.expenses ?? 0)} tone="neg" />
        <KpiTile
          label="חיסכון נטו"
          value={formatCurrency(s?.netSavings ?? 0)}
          tone={s && s.netSavings >= 0 ? "pos" : "neg"}
        />
        <KpiTile
          label="אחוז חיסכון"
          value={formatPercent(s?.savingsRate ?? 0)}
          tone="pos"
          bar={s?.savingsRate}
        />
      </div>

      {/* Attention — compact, small */}
      <AttentionCounters layout="row" />

      {/* Where the money went — above budgets per gate */}
      <BreakdownCard nodes={data.spending} />

      {/* Budgets — moderate, he watches these */}
      <BudgetStatusCard
        budgets={budgetChipsFrom(data)}
        targetsHeadline={{
          expenseTarget: data.monthlyTargets.expenseTarget,
          expenseActual: data.summary?.expenses ?? 0,
          savingsTarget: data.savingsTarget,
        }}
      />

      {/* Goals — full width, earns the space (priority-waterfall ladder) */}
      <GoalsProgressCard goals={data.goals} surplus={data.goalsSurplus} />

      {/* Past vs future activity, side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentTxCard recent={data.recent} limit={8} />
        <div>
          <h3 className="mb-3 text-base font-semibold">צפוי בהמשך</h3>
          <UpcomingCard charges={data.upcomingCharges} total={data.upcomingTotal} />
        </div>
      </div>

      {/* Bottom insights — secondary, backward-looking (full trend on דוחות) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TrendMiniChart trend={data.trend} />
        <TopMerchantsCard merchants={computeTopMerchants(data.recent)} />
      </div>
    </div>
  );
}

function VariantB(props: { data: ProtoData; year: number; month: number }) {
  const { data } = props;
  return (
    <div className="space-y-6">
      {/* HERO: cash-flow band then the trend chart dominates */}
      <CashFlowBand summary={data.summary} />
      <TrendMiniChart trend={data.trend} large />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <BreakdownCard nodes={data.spending} />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <TopMerchantsCard merchants={computeTopMerchants(data.recent)} />
            <BudgetStatusCard
              budgets={budgetChipsFrom(data)}
              targetsHeadline={{
                expenseTarget: data.monthlyTargets.expenseTarget,
                expenseActual: data.summary?.expenses ?? 0,
                savingsTarget: data.savingsTarget,
              }}
            />
          </div>
          <RecentTxCard recent={data.recent} limit={10} />
        </div>
        <div className="space-y-4">
          <GoalsProgressCard goals={data.goals} surplus={data.goalsSurplus} />
          <UpcomingCard charges={data.upcomingCharges} total={data.upcomingTotal} />
          <AttentionCounters layout="stack" />
        </div>
      </div>
    </div>
  );
}

function VariantC(props: { data: ProtoData; year: number; month: number }) {
  const { data } = props;
  const pace = computePace(
    data.summary,
    data.monthlyTargets.expenseTarget,
    props.year,
    props.month,
  );
  return (
    <div className="space-y-6">
      {/* HERO: triage — what needs me + data freshness */}
      <div>
        <SectionTitle>דורש טיפול</SectionTitle>
        <div className="mt-3">
          <AttentionCounters layout="row" />
        </div>
      </div>
      {data.lastSyncRuns.length > 0 && <LastSyncStrip runs={data.lastSyncRuns} />}

      {/* secondary: pace + cash flow side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PaceHeroCard pace={pace} />
        <div className="space-y-4">
          <CashFlowBand summary={data.summary} />
          <BudgetStatusCard
            budgets={budgetChipsFrom(data)}
            targetsHeadline={{
              expenseTarget: data.monthlyTargets.expenseTarget,
              expenseActual: data.summary?.expenses ?? 0,
              savingsTarget: data.savingsTarget,
            }}
          />
        </div>
      </div>

      {/* analytics compacted, follow-through at the foot */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownCard nodes={data.spending} />
        <TrendMiniChart trend={data.trend} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentTxCard recent={data.recent} />
        <div className="space-y-6">
          <UpcomingCard charges={data.upcomingCharges} total={data.upcomingTotal} />
          <GoalsProgressCard goals={data.goals} surplus={data.goalsSurplus} />
        </div>
      </div>
    </div>
  );
}

// ---- page ----

function DashboardProtoInner() {
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [data, setData] = React.useState<ProtoData>(EMPTY);
  const [loading, setLoading] = React.useState(true);
  const variant = useSearchParams().get("variant") ?? "A";

  React.useEffect(() => {
    setLoading(true);
    fetchAll(year, month)
      .then(setData)
      .finally(() => setLoading(false));
  }, [year, month]);

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">לוח בקרה</h2>
          <p className="text-muted-foreground text-xs">אב-טיפוס #108 · פריסה {variant}</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && <LastSyncCube runs={data.lastSyncRuns} />}
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

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-40 w-full" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {variant === "A" && <VariantA data={data} year={year} month={month} />}
          {variant === "B" && <VariantB data={data} year={year} month={month} />}
          {variant === "C" && <VariantC data={data} year={year} month={month} />}
        </>
      )}

      <PrototypeSwitcher variants={VARIANTS} />
    </div>
  );
}

export default function DashboardProtoPage() {
  return (
    <React.Suspense fallback={null}>
      <DashboardProtoInner />
    </React.Suspense>
  );
}
