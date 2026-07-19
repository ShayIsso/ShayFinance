"use client";

import * as React from "react";
import { ChevronDown, ArrowUp, ArrowDown, Minus, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VariantTabs } from "../variant-tabs";
import {
  SAMPLE_REPORTS,
  formatILS,
  computeDelta,
  formatDeltaPct,
  type SampleNode,
  type Delta,
} from "../sample-data";

// PROTOTYPE ONLY (BGR11 #168) — variant B. Deleted before the implementation PR.

function DeltaCell({ delta }: { delta: Delta }) {
  if (delta.pct === null) return <span className="text-muted-foreground">—</span>;
  const Icon = delta.direction === "up" ? ArrowUp : delta.direction === "down" ? ArrowDown : Minus;
  return (
    <span className="text-muted-foreground inline-flex items-center justify-end gap-0.5 tabular-nums">
      <Icon className="size-3" strokeWidth={2} />
      {formatDeltaPct(delta)}
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
  return v === null ? "—" : formatILS(v);
}

function BreakdownGroupRows({ node, total }: { node: SampleNode; total: number }) {
  const [open, setOpen] = React.useState(false);
  const isGroup = node.children.length > 0;
  const share = total > 0 ? Math.round((node.amount / total) * 100) : 0;
  const delta = computeDelta(node.amount, node.lastYear);

  return (
    <>
      <TableRow
        className={isGroup ? "cursor-pointer" : ""}
        onClick={() => isGroup && setOpen((o) => !o)}
      >
        <TableCell className="font-medium">
          <span className="flex items-center gap-2">
            {isGroup ? (
              <ChevronDown
                className={`text-muted-foreground size-4 transition-transform ${open ? "" : "-rotate-90"}`}
                strokeWidth={1.5}
              />
            ) : (
              <span className="size-4" />
            )}
            <CategoryDot color={node.color} />
            {node.name}
          </span>
        </TableCell>
        <TableCell className="text-left tabular-nums">{formatILS(node.amount)}</TableCell>
        <TableCell className="text-muted-foreground text-left tabular-nums">
          {amountOrDash(node.lastYear)}
        </TableCell>
        <TableCell className="text-left">
          <DeltaCell delta={delta} />
        </TableCell>
        <TableCell className="text-muted-foreground text-left tabular-nums">{share}%</TableCell>
      </TableRow>
      {isGroup &&
        open &&
        node.children.map((leaf) => {
          const ld = computeDelta(leaf.amount, leaf.lastYear);
          return (
            <TableRow key={leaf.id} className="bg-muted/20">
              <TableCell className="text-muted-foreground pr-12">
                <span className="flex items-center gap-2">
                  <CategoryDot color={leaf.color} />
                  {leaf.name}
                </span>
              </TableCell>
              <TableCell className="text-left tabular-nums">{formatILS(leaf.amount)}</TableCell>
              <TableCell className="text-muted-foreground text-left tabular-nums">
                {amountOrDash(leaf.lastYear)}
              </TableCell>
              <TableCell className="text-left">
                <DeltaCell delta={ld} />
              </TableCell>
              <TableCell />
            </TableRow>
          );
        })}
    </>
  );
}

function TotalsRow({
  label,
  value,
  lastYear,
  isPercent,
  strong,
}: {
  label: string;
  value: number;
  lastYear: number | null;
  isPercent?: boolean;
  strong?: boolean;
}) {
  const delta = computeDelta(value, lastYear);
  const fmt = (v: number) => (isPercent ? `${Math.round(v)}%` : formatILS(v));
  return (
    <TableRow className={strong ? "font-semibold" : ""}>
      <TableCell className={strong ? "font-semibold" : "font-medium"}>{label}</TableCell>
      <TableCell className="text-left tabular-nums">{fmt(value)}</TableCell>
      <TableCell className="text-muted-foreground text-left tabular-nums">
        {lastYear === null ? "—" : fmt(lastYear)}
      </TableCell>
      <TableCell className="text-left">
        <DeltaCell delta={delta} />
      </TableCell>
    </TableRow>
  );
}

export default function VariantB() {
  const [key, setKey] = React.useState(SAMPLE_REPORTS[0].key);
  const report = SAMPLE_REPORTS.find((r) => r.key === key) ?? SAMPLE_REPORTS[0];
  const { totals, breakdown } = report;
  const total = breakdown.reduce((s, n) => s + n.amount, 0);

  return (
    <div className="space-y-6">
      <VariantTabs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">דוח חודשי</h2>
        <div className="flex items-center gap-2">
          <Select value={key} onValueChange={setKey}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SAMPLE_REPORTS.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <Download className="size-4" />
            הורד שורות החודש
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">סיכום</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">מדד</TableHead>
                <TableHead className="text-left">{report.label}</TableHead>
                <TableHead className="text-left">אותו חודש אשתקד</TableHead>
                <TableHead className="text-left">שינוי</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TotalsRow label="הכנסות" value={totals.income} lastYear={totals.incomeLY} />
              <TotalsRow label="הוצאות" value={totals.expenses} lastYear={totals.expensesLY} />
              <TotalsRow
                label="חיסכון נטו"
                value={totals.netSavings}
                lastYear={totals.netSavingsLY}
                strong
              />
              <TotalsRow
                label="אחוז חיסכון"
                value={totals.savingsRate}
                lastYear={totals.savingsRateLY}
                isPercent
              />
              <TotalsRow label="הושקע" value={totals.investment} lastYear={totals.investmentLY} />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">הוצאות לפי קטגוריה</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">קטגוריה</TableHead>
                <TableHead className="text-left">{report.label}</TableHead>
                <TableHead className="text-left">אשתקד</TableHead>
                <TableHead className="text-left">שינוי</TableHead>
                <TableHead className="text-left">נתח</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.map((node) => (
                <BreakdownGroupRows key={node.id} node={node} total={total} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
