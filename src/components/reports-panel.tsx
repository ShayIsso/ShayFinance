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
import type {
  TrendsReport,
  TrendsMonthPoint,
  TrendsGroupSeries,
  TrendsCategorySeries,
  TrendsYearRow,
} from "@/lib/reports/trends";

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

const HEBREW_MONTHS_SHORT = [
  "ינו",
  "פבר",
  "מרץ",
  "אפר",
  "מאי",
  "יונ",
  "יול",
  "אוג",
  "ספט",
  "אוק",
  "נוב",
  "דצמ",
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
        "bg-muted relative w-full overflow-hidden rounded-full",
        strong ? "h-1.5" : "h-1",
      )}
    >
      {showGhost && lastYear !== null && lastYear > 0 && (
        <div
          className="border-bar-strong absolute inset-y-0 right-0 rounded-full border border-dashed"
          style={{ width: max > 0 ? `${(lastYear / max) * 100}%` : "0%" }}
        />
      )}
      <div
        className={cn("h-full rounded-full", strong ? "bg-bar-strong" : "bg-bar")}
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

function MonthlyReportView() {
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
      <div className="flex flex-wrap items-center justify-end gap-3">
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

// ── trends report (issue #170 — BGR13) ───────────────────────────────────────

const RANGE_OPTIONS = [6, 12, 24];

// Palette laws (locked): the net-savings hero uses emerald/red by sign — a
// single emphasized metric colored semantically, exactly like the summary
// table's net-savings cell. Income and expenses stay neutral (grays),
// differentiated by their legend dot and line style — never a second saturated
// hue competing with the hero.
const NET_POS = "#10b981"; // emerald-500
const NET_NEG = "#ef4444"; // red-500
const INCOME_NEUTRAL = "#9ca3af"; // gray-400
const EXPENSE_NEUTRAL = "#4b5563"; // gray-600

// Fixed pixel height; the width is MEASURED from the container so the SVG
// coordinate space is 1:1 with rendered pixels. That fills the card width at
// any screen size (wide external monitor included) with no letterboxing and no
// distortion — the failure mode of a constant viewBox + preserveAspectRatio,
// which shrinks-and-centers on wide screens, and of preserveAspectRatio="none",
// which stretches strokes/dots into ellipses. Switching range (6/12/24) only
// changes internal density, never the frame size.
const CHART_H = 256;
const CHART_PAD_X = 24;
const CHART_PLOT_TOP = 16;
const CHART_PLOT_BOTTOM = 206;

/** Tracks the live pixel width of a container via ResizeObserver (client-only). */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function TrendsChart({ points }: { points: TrendsMonthPoint[] }) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const n = points.length;
  const plotH = CHART_PLOT_BOTTOM - CHART_PLOT_TOP;
  const slot = n > 0 ? (width - 2 * CHART_PAD_X) / n : 0;
  const barW = Math.min(18, slot * 0.55);
  const cx = (i: number) => CHART_PAD_X + slot * (i + 0.5);

  const incomes = points.map((p) => p.income);
  const expenses = points.map((p) => p.expenses);
  const nets = points.map((p) => p.netSavings);
  const yMax = Math.max(0, ...incomes, ...expenses, ...nets);
  const yMin = Math.min(0, ...nets);
  const span = yMax - yMin || 1;
  const yOf = (v: number) => CHART_PLOT_TOP + ((yMax - v) / span) * plotH;
  const zeroY = yOf(0);
  const linePath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${cx(i)},${yOf(v)}`).join(" ");

  // Thin month labels out when the range is dense so they never overlap.
  const labelStep = n > 14 ? 2 : 1;

  return (
    // dir="ltr": time flows left→right (oldest→newest) — the universal chart
    // convention, independent of the page's RTL, so months read in order.
    <div ref={ref} dir="ltr" className="w-full" style={{ height: CHART_H }}>
      {width > 0 && (
        <svg
          width={width}
          height={CHART_H}
          viewBox={`0 0 ${width} ${CHART_H}`}
          role="img"
          aria-label="מגמת הכנסות, הוצאות וחיסכון נטו לפי חודש"
        >
          <line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke="#d1d5db" strokeWidth={1} />
          {points.map((p, i) => {
            const y = yOf(p.netSavings);
            const top = Math.min(y, zeroY);
            const h = Math.max(1, Math.abs(y - zeroY));
            return (
              <rect
                key={i}
                x={cx(i) - barW / 2}
                y={top}
                width={barW}
                height={h}
                rx={2}
                fill={p.netSavings >= 0 ? NET_POS : NET_NEG}
                // The last point is always the current calendar month
                // (enumerateMonthRange ends at today's month) — it is still
                // in progress, so it renders faded to match the caption.
                opacity={i === n - 1 ? 0.5 : 1}
              />
            );
          })}
          <path d={linePath(incomes)} fill="none" stroke={INCOME_NEUTRAL} strokeWidth={1.75} />
          <path
            d={linePath(expenses)}
            fill="none"
            stroke={EXPENSE_NEUTRAL}
            strokeWidth={1.75}
            strokeDasharray="5 3"
          />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={cx(i)} cy={yOf(p.income)} r={2.5} fill={INCOME_NEUTRAL} />
              <circle cx={cx(i)} cy={yOf(p.expenses)} r={2.5} fill={EXPENSE_NEUTRAL} />
            </g>
          ))}
          {points.map((p, i) =>
            i % labelStep === 0 ? (
              <text
                key={`m${i}`}
                x={cx(i)}
                y={CHART_PLOT_BOTTOM + 20}
                textAnchor="middle"
                className="text-muted-foreground"
                fill="currentColor"
                fontSize={11}
              >
                {HEBREW_MONTHS_SHORT[p.month - 1]}
              </text>
            ) : null,
          )}
          {points.map((p, i) =>
            i === 0 || p.month === 1 ? (
              <text
                key={`y${i}`}
                x={cx(i)}
                y={CHART_PLOT_BOTTOM + 36}
                textAnchor="middle"
                className="text-muted-foreground"
                fill="currentColor"
                fontSize={10}
              >
                {p.year}
              </text>
            ) : null,
          )}
        </svg>
      )}
    </div>
  );
}

function LegendSwatch({
  color,
  colorNeg,
  label,
  variant,
}: {
  color: string;
  colorNeg?: string;
  label: string;
  variant: "bar" | "split" | "line" | "dashed";
}) {
  return (
    <span className="flex items-center gap-1.5">
      {variant === "split" ? (
        // Net savings is green when positive AND red when negative — the marker
        // conveys both states, not a single-colour dot.
        <span className="inline-flex h-3 w-3 overflow-hidden rounded-sm">
          <span className="w-1/2" style={{ backgroundColor: color }} />
          <span className="w-1/2" style={{ backgroundColor: colorNeg }} />
        </span>
      ) : variant === "bar" ? (
        <span className="inline-block h-3 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      ) : (
        <span
          className="inline-block h-0 w-4"
          style={{ borderTop: `2px ${variant === "dashed" ? "dashed" : "solid"} ${color}` }}
        />
      )}
      {label}
    </span>
  );
}

// Neutral sparkline bars; the category dot on the row is the differentiation
// mechanism (palette law), so every bar here stays gray. This is NOT a skeleton
// — bg-gray-400 keeps the bars clearly readable (bg-gray-200 read as a loading
// placeholder). Each row normalizes to its own max so the trend SHAPE reads;
// magnitude is the amount + delta columns beside it. Hovering a bar surfaces its
// month + that month's amount (client-side formatting, RTL).
function MiniBars({ amounts, months }: { amounts: number[]; months: ReportMonth[] }) {
  const max = Math.max(0, ...amounts);
  const [hover, setHover] = React.useState<number | null>(null);
  return (
    <div dir="ltr" className="relative flex h-7 items-end gap-0.5">
      {amounts.map((a, i) => (
        <div
          key={i}
          className="min-w-[3px] flex-1 rounded-sm bg-gray-400 hover:bg-gray-500"
          style={{ height: max > 0 ? `${Math.max(8, (a / max) * 100)}%` : "8%" }}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover((h) => (h === i ? null : h))}
        />
      ))}
      {hover !== null && months[hover] && (
        <div
          dir="rtl"
          className="bg-popover text-popover-foreground pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-sm"
          style={{ left: `${((hover + 0.5) / amounts.length) * 100}%` }}
        >
          <span className="font-medium">
            {HEBREW_MONTHS[months[hover].month - 1]} {months[hover].year}
          </span>
          <span className="text-muted-foreground"> · </span>
          <span className="tabular-nums">{formatILS(amounts[hover])}</span>
        </div>
      )}
    </div>
  );
}

/** Latest-month amount and the month-over-month delta chip (expenses: good = down). */
function TrendsAmountCells({ amounts }: { amounts: number[] }) {
  const current = amounts[amounts.length - 1] ?? 0;
  const previous = amounts.length > 1 ? amounts[amounts.length - 2] : null;
  return (
    <>
      <TableCell className="text-left font-semibold tabular-nums">{formatILS(current)}</TableCell>
      <TableCell className="text-left">
        <DeltaChip current={current} lastYear={previous} good="down" />
      </TableCell>
    </>
  );
}

function TrendsBreakdownRow({
  series,
  months,
}: {
  series: TrendsGroupSeries;
  months: ReportMonth[];
}) {
  const [open, setOpen] = React.useState(false);
  const isGroup = series.children.length > 0;
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
            <CategoryDot color={series.color} />
            <span className="truncate">{series.categoryName}</span>
          </span>
        </TableCell>
        <TableCell className="w-40">
          <MiniBars amounts={series.amounts} months={months} />
        </TableCell>
        <TrendsAmountCells amounts={series.amounts} />
      </TableRow>
      {isGroup &&
        open &&
        series.children.map((leaf: TrendsCategorySeries) => (
          <TableRow key={leaf.categoryId} className="bg-muted/20">
            <TableCell className="text-muted-foreground pr-12">
              <span className="flex items-center gap-2">
                <CategoryDot color={leaf.color} />
                <span className="truncate">{leaf.categoryName}</span>
              </span>
            </TableCell>
            <TableCell className="w-40">
              <MiniBars amounts={leaf.amounts} months={months} />
            </TableCell>
            <TrendsAmountCells amounts={leaf.amounts} />
          </TableRow>
        ))}
    </>
  );
}

function YearRowsTable({ years }: { years: TrendsYearRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-right">שנה</TableHead>
          <TableHead className="text-left">הכנסות</TableHead>
          <TableHead className="text-left">הוצאות</TableHead>
          <TableHead className="text-left">חיסכון נטו</TableHead>
          <TableHead className="text-left">הושקע</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {years.map((y) => (
          <TableRow key={y.year}>
            <TableCell className="font-medium">
              {y.year}
              {y.monthCount < 12 && (
                <span className="text-muted-foreground mr-1 text-xs">({y.monthCount} ח׳)</span>
              )}
            </TableCell>
            <TableCell className="text-left tabular-nums">{formatILS(y.income)}</TableCell>
            <TableCell className="text-left tabular-nums">{formatILS(y.expenses)}</TableCell>
            <TableCell
              className={cn(
                "text-left font-semibold tabular-nums",
                y.netSavings >= 0 ? "text-emerald-600" : "text-red-600",
              )}
            >
              {formatILS(y.netSavings)}
            </TableCell>
            <TableCell className="text-left text-blue-600 tabular-nums">
              {formatILS(y.investment)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TrendsView() {
  const [range, setRange] = React.useState(12);
  const [report, setReport] = React.useState<TrendsReport | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the monthly view's range-scoped fetch idiom
    setLoading(true);
    fetch(`/api/reports/trends?range=${range}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TrendsReport | null) => setReport(data))
      .finally(() => setLoading(false));
  }, [range]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Select value={String(range)} onValueChange={(v) => setRange(Number(v))}>
          <SelectTrigger className="w-40">
            <span>{range} חודשים אחרונים</span>
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} חודשים אחרונים
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <ReportSkeleton />
      ) : !report || !report.hasData ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={FileBarChart}
              heading="אין נתונים לטווח זה"
              explainer="לא נמצאו עסקאות בטווח החודשים שנבחר."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base font-semibold">מגמה חודשית</CardTitle>
                <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
                  <LegendSwatch
                    color={NET_POS}
                    colorNeg={NET_NEG}
                    label="חיסכון נטו"
                    variant="split"
                  />
                  <LegendSwatch color={INCOME_NEUTRAL} label="הכנסות" variant="line" />
                  <LegendSwatch color={EXPENSE_NEUTRAL} label="הוצאות" variant="dashed" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <TrendsChart points={report.months} />
              <p className="text-muted-foreground mt-3 text-xs">
                עמודות = חיסכון נטו (ירוק חיובי, אדום שלילי); הקווים = הכנסות והוצאות. החודש הנוכחי
                חלקי ומוצג בשקיפות.
              </p>
            </CardContent>
          </Card>

          {report.years.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">סיכום שנתי</CardTitle>
              </CardHeader>
              <CardContent>
                <YearRowsTable years={report.years} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">מגמה לפי קטגוריה</CardTitle>
            </CardHeader>
            <CardContent>
              {report.breakdown.length === 0 ? (
                <p className="text-muted-foreground text-sm">אין הוצאות מסווגות בטווח זה.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">קטגוריה</TableHead>
                      <TableHead className="text-right">מגמה</TableHead>
                      <TableHead className="text-left">חודש אחרון</TableHead>
                      <TableHead className="text-left">שינוי</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.breakdown.map((series) => (
                      <TrendsBreakdownRow
                        key={series.categoryId}
                        series={series}
                        months={report.months}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-muted-foreground text-xs">
        פתחו קבוצה כדי לראות את מגמת הקטגוריות שבתוכה. סכום הקבוצה שווה תמיד לסכום הקטגוריות שבה.
      </p>
    </div>
  );
}

function SegmentedTabs({
  value,
  onChange,
}: {
  value: "monthly" | "trends";
  onChange: (v: "monthly" | "trends") => void;
}) {
  const tabs: { key: "monthly" | "trends"; label: string }[] = [
    { key: "monthly", label: "דוח חודשי" },
    { key: "trends", label: "מגמות" },
  ];
  return (
    <div className="bg-muted inline-flex rounded-lg p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          aria-pressed={value === t.key}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            value === t.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ReportsPanel() {
  const [tab, setTab] = React.useState<"monthly" | "trends">("monthly");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">דוחות</h1>
        <SegmentedTabs value={tab} onChange={setTab} />
      </div>
      {tab === "monthly" ? <MonthlyReportView /> : <TrendsView />}
    </div>
  );
}
