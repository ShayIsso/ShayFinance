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
// Runtime helper comes from the DB-free leaf module; the report shapes are
// type-only imports (erased at build) so no DB code reaches the client bundle.
import { computeYoyDelta } from "@/lib/reports/yoy";
import type { MonthlyReport, MonthlyReportNode } from "@/lib/reports/monthly";

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

type ReportMonth = { year: number; month: number };

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

function monthRange(m: ReportMonth): { from: string; to: string } {
  const from = `${m.year}-${String(m.month).padStart(2, "0")}-01`;
  const lastDay = new Date(m.year, m.month, 0).getDate();
  const to = `${m.year}-${String(m.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

// ── delta chip (semantic coloring; owner change 1 at the prototype gate) ───────
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

// ── breakdown bar cell (owner change 2: ghost bar folded into the table) ───────
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

function SummaryTable({ report, label }: { report: MonthlyReport; label: string }) {
  const s = report.summary;
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
        <TableRow>
          <TableCell className="font-medium">הכנסות</TableCell>
          <TableCell className="text-left tabular-nums">{formatILS(s.income.current)}</TableCell>
          <TableCell className="text-muted-foreground text-left tabular-nums">
            {s.income.lastYear === null ? "—" : formatILS(s.income.lastYear)}
          </TableCell>
          <TableCell className="text-left">
            <DeltaChip current={s.income.current} lastYear={s.income.lastYear} good="up" />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">הוצאות</TableCell>
          <TableCell className="text-left tabular-nums">{formatILS(s.expenses.current)}</TableCell>
          <TableCell className="text-muted-foreground text-left tabular-nums">
            {s.expenses.lastYear === null ? "—" : formatILS(s.expenses.lastYear)}
          </TableCell>
          <TableCell className="text-left">
            <DeltaChip current={s.expenses.current} lastYear={s.expenses.lastYear} good="down" />
          </TableCell>
        </TableRow>
        <TableRow className="font-semibold">
          <TableCell className="font-semibold">חיסכון נטו</TableCell>
          <TableCell
            className={cn(
              "text-left tabular-nums",
              s.netSavings.current >= 0 ? "text-emerald-600" : "text-red-600",
            )}
          >
            {formatILS(s.netSavings.current)}
          </TableCell>
          <TableCell className="text-muted-foreground text-left tabular-nums">
            {s.netSavings.lastYear === null ? "—" : formatILS(s.netSavings.lastYear)}
          </TableCell>
          <TableCell className="text-left">
            <DeltaChip current={s.netSavings.current} lastYear={s.netSavings.lastYear} good="up" />
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">אחוז חיסכון</TableCell>
          <TableCell className="text-left tabular-nums">
            {formatPercentValue(s.savingsRate.current)}
          </TableCell>
          <TableCell className="text-muted-foreground text-left tabular-nums">
            {s.savingsRate.lastYear === null ? "—" : formatPercentValue(s.savingsRate.lastYear)}
          </TableCell>
          <TableCell className="text-left">
            <DeltaChip
              current={s.savingsRate.current}
              lastYear={s.savingsRate.lastYear}
              good="up"
              asPercentagePoints
            />
          </TableCell>
        </TableRow>
        <TableRow>
          {/* Investment delta stays neutral: more/less deployment of savings has
              no inherent good/bad direction (owner decision, prototype gate). */}
          <TableCell className="font-medium">הושקע</TableCell>
          <TableCell className="text-left text-blue-600 tabular-nums">
            {formatILS(s.investment.current)}
          </TableCell>
          <TableCell className="text-muted-foreground text-left tabular-nums">
            {s.investment.lastYear === null ? "—" : formatILS(s.investment.lastYear)}
          </TableCell>
          <TableCell className="text-left">
            <DeltaChip
              current={s.investment.current}
              lastYear={s.investment.lastYear}
              good="neutral"
            />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
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
  const [report, setReport] = React.useState<MonthlyReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showGhost, setShowGhost] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/reports/months")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ReportMonth[]) => {
        setMonths(data);
        if (data.length > 0) setSelectedKey(monthKey(data[0]));
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
      .then(setReport)
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
        const { from, to } = monthRange(selectedMonth);
        return `/api/transactions/export?dateFrom=${from}&dateTo=${to}`;
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
