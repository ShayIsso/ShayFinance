"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ArrowUp, ArrowDown, Minus, Download, FileBarChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { BudgetRow, SavingsVerdictChip } from "@/components/budget-status-card";
// Runtime helpers come from DB-free leaf modules; the report shapes are
// type-only imports (build-erased) so no DB code reaches the client bundle
// (issue #168 / PR #185 — a deliberate exception to the index-only import rule).
import { computeYoyDelta } from "@/lib/reports/yoy";
import { monthDateRange } from "@/lib/analytics/month-window";
// Same searchParams builder the transactions page's own CSV export link uses
// (issue #169 — BGR12), so the two links can never diverge on filter shape.
import { buildFilterSearchParams } from "@/lib/transactions/filter-params";
// Type-only import from the index barrel is safe even though the barrel also
// exports DB-backed runtime code (`drizzleReportsStore`, `getMonthlyReport`):
// `import type` is build-erased, so nothing from it reaches the client bundle
// (same reasoning as the leaf-file exception above, applied to the one type
// that only the barrel — not `monthly.ts` — actually defines).
import type { ReportMonth, MonthlyReportWithVerdicts } from "@/lib/reports";
import type { MonthlyReport, MonthlyReportNode, YoyValue } from "@/lib/reports/monthly";
import type { MonthCloseVerdicts } from "@/lib/reports/month-close";

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

// Currency/date formatting stays client-side only (hydration rule, CLAUDE.md).
function formatILS(amount: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercentValue(v: number): string {
  return `${Math.round(v)}%`;
}

function monthKey(m: ReportMonth): string {
  return `${m.year}-${String(m.month).padStart(2, "0")}`;
}

function monthLabel(m: ReportMonth): string {
  return `${HEBREW_MONTHS[m.month - 1]} ${m.year}`;
}

/**
 * Default selection = the most recent CLOSED month. דוחות studies past months
 * (issue #168), so it must not open on the current in-progress month and mirror
 * the Dashboard's live view. The current month stays selectable in the dropdown;
 * only the default skips it. `months` is newest-first.
 */
function defaultMonth(months: ReportMonth[]): ReportMonth | null {
  if (months.length === 0) return null;
  const now = new Date();
  const isCurrent = (m: ReportMonth) =>
    m.year === now.getFullYear() && m.month === now.getMonth() + 1;
  if (isCurrent(months[0]) && months[1]) return months[1];
  return months[0];
}

// ── delta chip (semantic coloring; issue #168 / PR #185) ──────────────────────
// Trend deltas on the reports page ARE colored (unlike the neutral category-
// identity rule): direction is judged against what "good" means per metric.
type GoodDirection = "up" | "down" | "neutral";

function DeltaChip({
  current,
  lastYear,
  good,
  asPercentagePoints,
}: {
  current: number;
  lastYear: number | null;
  good: GoodDirection;
  asPercentagePoints?: boolean;
}) {
  const delta = computeYoyDelta(current, lastYear);
  if (delta.pct === null) {
    return <span className="text-muted-foreground tabular-nums">—</span>;
  }
  const Icon = delta.direction === "up" ? ArrowUp : delta.direction === "down" ? ArrowDown : Minus;
  const isGood = good !== "neutral" && delta.direction === good;
  const isBad = good !== "neutral" && delta.direction !== "flat" && delta.direction !== good;
  const tone =
    delta.direction === "flat" || good === "neutral"
      ? "text-muted-foreground"
      : isGood
        ? "bg-emerald-50 text-emerald-700"
        : isBad
          ? "bg-red-50 text-red-700"
          : "text-muted-foreground";
  const label = asPercentagePoints
    ? `${delta.pct > 0 ? "+" : ""}${Math.round(current - (lastYear ?? 0))} נק'`
    : `${delta.pct > 0 ? "+" : ""}${Math.round(delta.pct)}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
        tone,
      )}
    >
      <Icon className="size-3" strokeWidth={2} />
      {label}
    </span>
  );
}

function CategoryDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function amountOrDash(v: number | null): string {
  // Owner change 1: last year absent OR zero → "—" (no fabricated comparison).
  return v === null || v === 0 ? "—" : formatILS(v);
}

// ── breakdown bar cell (last-year ghost bar folded into the table; issue #168) ─
function BarCell({
  amount,
  lastYear,
  max,
  showGhost,
  strong,
}: {
  amount: number;
  lastYear: number | null;
  max: number;
  showGhost: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-gray-100",
        strong ? "h-1.5" : "h-1",
      )}
    >
      {showGhost && lastYear !== null && lastYear > 0 && (
        <div
          className="absolute inset-y-0 right-0 rounded-full border border-dashed border-gray-400"
          style={{ width: max > 0 ? `${(lastYear / max) * 100}%` : "0%" }}
        />
      )}
      <div
        className={cn("h-full rounded-full", strong ? "bg-gray-400" : "bg-gray-300")}
        style={{ width: max > 0 ? `${(amount / max) * 100}%` : "0%" }}
      />
    </div>
  );
}

function BreakdownRows({
  node,
  total,
  max,
  showGhost,
}: {
  node: MonthlyReportNode;
  total: number;
  max: number;
  showGhost: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const isGroup = node.children.length > 0;
  const share = total > 0 ? Math.round((node.amount / total) * 100) : 0;

  return (
    <>
      <TableRow
        className={isGroup ? "cursor-pointer" : undefined}
        onClick={isGroup ? () => setOpen((o) => !o) : undefined}
        aria-expanded={isGroup ? open : undefined}
      >
        <TableCell className="font-medium">
          <span className="flex items-center gap-2">
            {isGroup ? (
              <ChevronDown
                className={cn(
                  "text-muted-foreground size-4 shrink-0 transition-transform",
                  open ? "" : "-rotate-90",
                )}
                strokeWidth={1.5}
              />
            ) : (
              <span className="size-4 shrink-0" />
            )}
            <CategoryDot color={node.color} />
            <span className="truncate">{node.categoryName}</span>
          </span>
        </TableCell>
        <TableCell className="w-40">
          <BarCell
            amount={node.amount}
            lastYear={node.lastYearAmount}
            max={max}
            showGhost={showGhost}
            strong
          />
        </TableCell>
        <TableCell className="text-left font-semibold tabular-nums">
          {formatILS(node.amount)}
        </TableCell>
        <TableCell className="text-muted-foreground text-left tabular-nums">
          {amountOrDash(node.lastYearAmount)}
        </TableCell>
        <TableCell className="text-left">
          <DeltaChip current={node.amount} lastYear={node.lastYearAmount} good="down" />
        </TableCell>
        <TableCell className="text-muted-foreground text-left tabular-nums">{share}%</TableCell>
      </TableRow>

      {isGroup &&
        open &&
        node.children.map((leaf) => (
          <TableRow key={leaf.categoryId} className="bg-muted/20">
            <TableCell className="text-muted-foreground pr-12">
              <span className="flex items-center gap-2">
                <CategoryDot color={leaf.color} />
                <span className="truncate">{leaf.categoryName}</span>
              </span>
            </TableCell>
            <TableCell className="w-40">
              <BarCell
                amount={leaf.amount}
                lastYear={leaf.lastYearAmount}
                max={max}
                showGhost={showGhost}
              />
            </TableCell>
            <TableCell className="text-left tabular-nums">{formatILS(leaf.amount)}</TableCell>
            <TableCell className="text-muted-foreground text-left tabular-nums">
              {amountOrDash(leaf.lastYearAmount)}
            </TableCell>
            <TableCell className="text-left">
              <DeltaChip current={leaf.amount} lastYear={leaf.lastYearAmount} good="down" />
            </TableCell>
            <TableCell />
          </TableRow>
        ))}
    </>
  );
}

type SummaryMetric = {
  key: string;
  label: string;
  value: YoyValue;
  good: GoodDirection;
  format: (n: number) => string;
  asPercentagePoints?: boolean;
  /** Net savings is emphasized (bold row) and colored by sign. */
  strong?: boolean;
  /** Optional color for the current-value cell (net savings by sign; investment blue). */
  currentClass?: (v: number) => string;
};

// Investment good="neutral": more/less deployment of savings has no inherent
// good/bad direction (issue #168 / PR #185).
function summaryMetrics(s: MonthlyReport["summary"]): SummaryMetric[] {
  return [
    { key: "income", label: "הכנסות", value: s.income, good: "up", format: formatILS },
    { key: "expenses", label: "הוצאות", value: s.expenses, good: "down", format: formatILS },
    {
      key: "netSavings",
      label: "חיסכון נטו",
      value: s.netSavings,
      good: "up",
      format: formatILS,
      strong: true,
      currentClass: (v) => (v >= 0 ? "text-emerald-600" : "text-red-600"),
    },
    {
      key: "savingsRate",
      label: "אחוז חיסכון",
      value: s.savingsRate,
      good: "up",
      format: formatPercentValue,
      asPercentagePoints: true,
    },
    {
      key: "investment",
      label: "הושקע",
      value: s.investment,
      good: "neutral",
      format: formatILS,
      currentClass: () => "text-blue-600",
    },
  ];
}

function SummaryTable({ report, label }: { report: MonthlyReport; label: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-right">מדד</TableHead>
          <TableHead className="text-left">{label}</TableHead>
          <TableHead className="text-left">אותו חודש אשתקד</TableHead>
          <TableHead className="text-left">שינוי</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {summaryMetrics(report.summary).map((m) => (
          <TableRow key={m.key} className={m.strong ? "font-semibold" : undefined}>
            <TableCell className={m.strong ? "font-semibold" : "font-medium"}>{m.label}</TableCell>
            <TableCell className={cn("text-left tabular-nums", m.currentClass?.(m.value.current))}>
              {m.format(m.value.current)}
            </TableCell>
            <TableCell className="text-muted-foreground text-left tabular-nums">
              {m.value.lastYear === null ? "—" : m.format(m.value.lastYear)}
            </TableCell>
            <TableCell className="text-left">
              <DeltaChip
                current={m.value.current}
                lastYear={m.value.lastYear}
                good={m.good}
                asPercentagePoints={m.asPercentagePoints}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ── month-close verdict section (issue #169 — BGR12) ──────────────────────
// Renders for closed months only, and only when there's something to show —
// `monthClose.monthClosed` is false for an in-progress month (no verdict yet;
// the Dashboard's live pace chips cover that case), and an all-empty closed
// result (no budgets, no savings target) hides the same way. Chip vocabulary
// and styling come straight from the Dashboard's budget card (BGR9) via
// `BudgetRow` / `SavingsVerdictChip` — no parallel chip implementation here.
function MonthCloseSection({ monthClose }: { monthClose: MonthCloseVerdicts }) {
  if (!monthClose.monthClosed) return null;
  if (monthClose.budgets.length === 0 && !monthClose.savingsTarget) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">תוצאות מול תקציבים ויעדים</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {monthClose.savingsTarget && (
          <div className="flex items-center justify-between border-b pb-3 text-sm">
            <span className="text-muted-foreground">יעד חיסכון נטו</span>
            <span className="flex items-center gap-2 tabular-nums">
              {formatILS(monthClose.savingsTarget.netSavings)} מתוך{" "}
              {formatILS(monthClose.savingsTarget.target)}
              <SavingsVerdictChip verdict={monthClose.savingsTarget.verdict} />
            </span>
          </div>
        )}
        {monthClose.budgets.length > 0 && (
          <div className="space-y-2">
            {monthClose.budgets.map((b) => (
              <BudgetRow key={b.id} budget={b} />
            ))}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          התוצאות מוצגות מול הגדרות התקציב והיעד הנוכחיות, גם אם השתנו מאז אותו חודש.
        </p>
      </CardContent>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function ReportsPanel() {
  const [months, setMonths] = React.useState<ReportMonth[] | null>(null);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<MonthlyReportWithVerdicts | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showGhost, setShowGhost] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/reports/months")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ReportMonth[]) => {
        setMonths(data);
        const def = defaultMonth(data);
        if (def) setSelectedKey(monthKey(def));
        else setLoading(false);
      })
      .catch(() => {
        setMonths([]);
        setLoading(false);
      });
  }, []);

  const selectedMonth = React.useMemo(
    () => months?.find((m) => monthKey(m) === selectedKey) ?? null,
    [months, selectedKey],
  );

  React.useEffect(() => {
    if (!selectedMonth) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors dashboard-panel's month-scoped fetch idiom
    setLoading(true);
    fetch(`/api/reports/monthly?year=${selectedMonth.year}&month=${selectedMonth.month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MonthlyReportWithVerdicts | null) => setReport(data))
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  const total = React.useMemo(
    () => (report ? report.breakdown.reduce((s, n) => s + n.amount, 0) : 0),
    [report],
  );
  const max = React.useMemo(
    () =>
      report
        ? Math.max(0, ...report.breakdown.map((n) => Math.max(n.amount, n.lastYearAmount ?? 0)))
        : 0,
    [report],
  );

  const csvHref = selectedMonth
    ? (() => {
        const { from, to } = monthDateRange(selectedMonth.year, selectedMonth.month);
        const params = buildFilterSearchParams({
          dateFrom: from,
          dateTo: to,
          categoryId: "",
          status: "",
          search: "",
        });
        return `/api/transactions/export?${params.toString()}`;
      })()
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">דוח חודשי</h2>
        <div className="flex items-center gap-2">
          {months && months.length > 0 && selectedKey && (
            <Select value={selectedKey} onValueChange={setSelectedKey}>
              <SelectTrigger className="w-40">
                {/* base-ui SelectValue renders the raw value; the codebase idiom
                    (transactions-table) puts the resolved label in the trigger. */}
                <span>{selectedMonth ? monthLabel(selectedMonth) : ""}</span>
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={monthKey(m)} value={monthKey(m)}>
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {csvHref && (
            <a
              href={csvHref}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}
            >
              <Download className="size-4" strokeWidth={1.5} />
              הורד שורות החודש
            </a>
          )}
        </div>
      </div>

      {/* Independent of hasData: a closed month can have a meaningful budget/target
          result (e.g. a ₪0-spend month still resolves comfortably-under) even with
          no transactions to show in the summary/breakdown below. */}
      {!loading && report && <MonthCloseSection monthClose={report.monthClose} />}

      {loading ? (
        <ReportSkeleton />
      ) : !months || months.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={FileBarChart}
              heading="אין נתונים"
              explainer="לא נטענו עסקאות. התחבר לבנק הראשון שלך כדי להתחיל."
              cta={{ label: "עבור להגדרות", href: "/settings" }}
            />
          </CardContent>
        </Card>
      ) : !report || !report.hasData ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={FileBarChart}
              heading="אין נתונים לחודש זה"
              explainer="לא נמצאו עסקאות בחודש שנבחר."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">סיכום</CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryTable
                report={report}
                label={selectedMonth ? monthLabel(selectedMonth) : ""}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">הוצאות לפי קטגוריה</CardTitle>
                <label
                  className={cn(
                    "text-muted-foreground flex items-center gap-2 text-xs",
                    report.hasLastYear ? "cursor-pointer" : "opacity-50",
                  )}
                >
                  <Checkbox
                    checked={showGhost}
                    onCheckedChange={(v) => setShowGhost(v === true)}
                    disabled={!report.hasLastYear}
                  />
                  הצג פסי אשתקד
                </label>
              </div>
            </CardHeader>
            <CardContent>
              {report.breakdown.length === 0 ? (
                <p className="text-muted-foreground text-sm">אין הוצאות מסווגות בחודש זה.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">קטגוריה</TableHead>
                        <TableHead className="text-right" />
                        <TableHead className="text-left">
                          {selectedMonth ? monthLabel(selectedMonth) : ""}
                        </TableHead>
                        <TableHead className="text-left">אשתקד</TableHead>
                        <TableHead className="text-left">שינוי</TableHead>
                        <TableHead className="text-left">נתח</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.breakdown.map((node) => (
                        <BreakdownRows
                          key={node.categoryId}
                          node={node}
                          total={total}
                          max={max}
                          showGhost={showGhost && report.hasLastYear}
                        />
                      ))}
                    </TableBody>
                  </Table>
                  {showGhost && report.hasLastYear && (
                    <p className="text-muted-foreground mt-3 text-xs">
                      קו מקווקו = ההוצאה באותו חודש אשתקד.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-muted-foreground text-xs">
        <Link href="/" className="hover:underline">
          לוח הבקרה
        </Link>{" "}
        מציג את החודש הנוכחי; כאן ניתן לעיין בכל חודש שעבר.
      </p>
    </div>
  );
}
