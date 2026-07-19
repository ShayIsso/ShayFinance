"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { VariantTabs } from "../variant-tabs";
import {
  SAMPLE_REPORTS,
  formatILS,
  computeDelta,
  formatDeltaPct,
  type SampleNode,
  type SampleLeaf,
  type Delta,
} from "../sample-data";

// PROTOTYPE ONLY (BGR11 #168) — variant A. Deleted before the implementation PR.

// Neutral, directional delta chip. Palette rule: emerald stays reserved for
// positive single-metric numbers, so YoY deltas render neutral with an arrow.
function DeltaChip({ delta, className }: { delta: Delta; className?: string }) {
  if (delta.pct === null) {
    return <span className={`text-muted-foreground text-xs ${className ?? ""}`}>— אשתקד</span>;
  }
  const Icon = delta.direction === "up" ? ArrowUp : delta.direction === "down" ? ArrowDown : Minus;
  return (
    <span
      className={`text-muted-foreground inline-flex items-center gap-0.5 text-xs tabular-nums ${className ?? ""}`}
    >
      <Icon className="size-3" strokeWidth={2} />
      {formatDeltaPct(delta)} מול אשתקד
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

function LeafRow({ leaf, max }: { leaf: SampleLeaf; max: number }) {
  const delta = computeDelta(leaf.amount, leaf.lastYear);
  return (
    <div className="flex items-center gap-3 py-1 pr-11">
      <CategoryDot color={leaf.color} />
      <span className="text-muted-foreground w-36 shrink-0 truncate text-sm">{leaf.name}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-50">
        <div
          className="h-full rounded-full bg-gray-300"
          style={{ width: max > 0 ? `${(leaf.amount / max) * 100}%` : "0%" }}
        />
      </div>
      <span className="text-muted-foreground w-20 shrink-0 text-left text-xs tabular-nums">
        {leaf.lastYear === null ? "—" : formatILS(leaf.lastYear)}
      </span>
      <Amount
        amount={leaf.amount}
        currency="ILS"
        colorize={false}
        fractionDigits={0}
        className="w-24 shrink-0 text-left text-sm tabular-nums"
      />
      <span className="w-14 shrink-0 text-left">
        <DeltaChip delta={delta} />
      </span>
    </div>
  );
}

function NodeRow({ node, total, max }: { node: SampleNode; total: number; max: number }) {
  const [open, setOpen] = React.useState(false);
  const isGroup = node.children.length > 0;
  const share = total > 0 ? Math.round((node.amount / total) * 100) : 0;
  const delta = computeDelta(node.amount, node.lastYear);

  const inner = (
    <>
      {isGroup ? (
        <ChevronDown
          className={`text-muted-foreground size-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          strokeWidth={1.5}
        />
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <CategoryDot color={node.color} />
      <span className="w-40 shrink-0 truncate text-sm font-medium">{node.name}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gray-400"
          style={{ width: max > 0 ? `${(node.amount / max) * 100}%` : "0%" }}
        />
      </div>
      <span className="text-muted-foreground w-20 shrink-0 text-left text-xs tabular-nums">
        {node.lastYear === null ? "—" : formatILS(node.lastYear)}
      </span>
      <Amount
        amount={node.amount}
        currency="ILS"
        colorize={false}
        fractionDigits={0}
        className="w-24 shrink-0 text-left text-sm font-semibold tabular-nums"
      />
      <span className="text-muted-foreground w-14 shrink-0 text-left text-xs tabular-nums">
        {share}%
      </span>
    </>
  );

  return (
    <div>
      {isGroup ? (
        <button
          className="hover:bg-muted/40 flex w-full items-center gap-3 rounded-md py-2.5 text-right"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {inner}
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 rounded-md py-2.5 text-right">{inner}</div>
      )}
      <div className="pr-40 pb-1">
        <DeltaChip delta={delta} />
      </div>
      {isGroup && open && (
        <div className="mb-1 space-y-1 pb-1">
          {node.children.map((leaf) => (
            <LeafRow key={leaf.id} leaf={leaf} max={max} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  lastYear,
  tone,
  isPercent,
}: {
  label: string;
  value: number;
  lastYear: number | null;
  tone?: "positive" | "negative" | "investment";
  isPercent?: boolean;
}) {
  const delta = computeDelta(value, lastYear);
  const toneClass =
    tone === "investment"
      ? "text-blue-600"
      : tone === "positive"
        ? value >= 0
          ? "text-emerald-600"
          : "text-red-600"
        : "text-foreground";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${toneClass}`}>
          {isPercent ? `${Math.round(value)}%` : formatILS(value)}
        </p>
        <div className="mt-1">
          <DeltaChip delta={delta} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function VariantA() {
  const [idx, setIdx] = React.useState(0);
  const report = SAMPLE_REPORTS[idx];
  const { totals, breakdown } = report;
  const total = breakdown.reduce((s, n) => s + n.amount, 0);
  const max = Math.max(0, ...breakdown.map((n) => n.amount));

  return (
    <div className="space-y-6">
      <VariantTabs />

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">דוח חודשי</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIdx((i) => Math.min(i + 1, SAMPLE_REPORTS.length - 1))}
            disabled={idx >= SAMPLE_REPORTS.length - 1}
            aria-label="חודש הבא"
          >
            <ChevronRight className="size-4" />
          </Button>
          <span className="min-w-32 text-center text-sm font-medium">{report.label}</span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIdx((i) => Math.max(i - 1, 0))}
            disabled={idx <= 0}
            aria-label="חודש קודם"
          >
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="חיסכון נטו"
          value={totals.netSavings}
          lastYear={totals.netSavingsLY}
          tone="positive"
        />
        <SummaryCard
          label="אחוז חיסכון"
          value={totals.savingsRate}
          lastYear={totals.savingsRateLY}
          tone="positive"
          isPercent
        />
        <SummaryCard
          label="הושקע"
          value={totals.investment}
          lastYear={totals.investmentLY}
          tone="investment"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryCard label="הכנסות" value={totals.income} lastYear={totals.incomeLY} />
        <SummaryCard label="הוצאות" value={totals.expenses} lastYear={totals.expensesLY} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">הוצאות לפי קטגוריה</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex items-center gap-3 pr-10 pb-2 text-xs">
            <span className="flex-1" />
            <span className="w-20 shrink-0 text-left">אשתקד</span>
            <span className="w-24 shrink-0 text-left">החודש</span>
            <span className="w-14 shrink-0 text-left">נתח</span>
          </div>
          <div className="min-w-0 flex-1 divide-y">
            {breakdown.map((node) => (
              <NodeRow key={node.id} node={node} total={total} max={max} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
