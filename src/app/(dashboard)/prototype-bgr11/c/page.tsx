"use client";

import * as React from "react";
import { ChevronDown, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Amount } from "@/components/ui/amount";
import { cn } from "@/lib/utils";
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

// PROTOTYPE ONLY (BGR11 #168) — variant C. Deleted before the implementation PR.

function DeltaBadge({ delta, label }: { delta: Delta; label: string }) {
  const noData = delta.pct === null;
  const Icon = delta.direction === "up" ? ArrowUp : delta.direction === "down" ? ArrowDown : Minus;
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      {noData ? (
        <p className="text-muted-foreground mt-1 text-sm">אין נתונים אשתקד</p>
      ) : (
        <p className="text-foreground mt-1 inline-flex items-center gap-1 text-lg font-semibold tabular-nums">
          <Icon className="size-4" strokeWidth={2} />
          {formatDeltaPct(delta)}
        </p>
      )}
    </div>
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

// Row bar with an optional last-year "ghost" underlay for at-a-glance YoY.
function BarWithGhost({
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
      className={`relative flex-1 overflow-hidden rounded-full bg-gray-100 ${strong ? "h-1.5" : "h-1"}`}
    >
      {showGhost && lastYear !== null && (
        <div
          className="absolute inset-y-0 rounded-full border border-dashed border-gray-400 bg-transparent"
          style={{ width: max > 0 ? `${(lastYear / max) * 100}%` : "0%" }}
        />
      )}
      <div
        className={`h-full rounded-full ${strong ? "bg-gray-400" : "bg-gray-300"}`}
        style={{ width: max > 0 ? `${(amount / max) * 100}%` : "0%" }}
      />
    </div>
  );
}

function LeafRow({ leaf, max, showGhost }: { leaf: SampleLeaf; max: number; showGhost: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1 pr-11">
      <CategoryDot color={leaf.color} />
      <span className="text-muted-foreground w-36 shrink-0 truncate text-sm">{leaf.name}</span>
      <BarWithGhost amount={leaf.amount} lastYear={leaf.lastYear} max={max} showGhost={showGhost} />
      <Amount
        amount={leaf.amount}
        currency="ILS"
        colorize={false}
        fractionDigits={0}
        className="w-24 shrink-0 text-left text-sm tabular-nums"
      />
    </div>
  );
}

function NodeRow({
  node,
  total,
  max,
  showGhost,
}: {
  node: SampleNode;
  total: number;
  max: number;
  showGhost: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const isGroup = node.children.length > 0;
  const share = total > 0 ? Math.round((node.amount / total) * 100) : 0;

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
      <BarWithGhost
        amount={node.amount}
        lastYear={node.lastYear}
        max={max}
        showGhost={showGhost}
        strong
      />
      <Amount
        amount={node.amount}
        currency="ILS"
        colorize={false}
        fractionDigits={0}
        className="w-24 shrink-0 text-left text-sm font-semibold tabular-nums"
      />
      <span className="text-muted-foreground w-9 shrink-0 text-left text-xs tabular-nums">
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
      {isGroup && open && (
        <div className="mb-1 space-y-1 pb-1">
          {node.children.map((leaf) => (
            <LeafRow key={leaf.id} leaf={leaf} max={max} showGhost={showGhost} />
          ))}
        </div>
      )}
    </div>
  );
}

function CleanCard({
  label,
  value,
  tone,
  isPercent,
}: {
  label: string;
  value: number;
  tone?: "positive" | "investment";
  isPercent?: boolean;
}) {
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
      </CardContent>
    </Card>
  );
}

export default function VariantC() {
  const [idx, setIdx] = React.useState(0);
  const [showGhost, setShowGhost] = React.useState(true);
  const report = SAMPLE_REPORTS[idx];
  const { totals, breakdown } = report;
  const total = breakdown.reduce((s, n) => s + n.amount, 0);
  const max = Math.max(0, ...breakdown.map((n) => n.amount));

  const anyLY = totals.incomeLY !== null;

  return (
    <div className="space-y-6">
      <VariantTabs />

      <h2 className="text-2xl font-bold tracking-tight">דוח חודשי</h2>

      {/* Month strip */}
      <div className="flex flex-wrap gap-2">
        {SAMPLE_REPORTS.map((r, i) => (
          <button
            key={r.key}
            onClick={() => setIdx(i)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              i === idx
                ? "border-foreground bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Clean headline cards (no inline YoY) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CleanCard label="חיסכון נטו" value={totals.netSavings} tone="positive" />
        <CleanCard label="אחוז חיסכון" value={totals.savingsRate} tone="positive" isPercent />
        <CleanCard label="הושקע" value={totals.investment} tone="investment" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CleanCard label="הכנסות" value={totals.income} />
        <CleanCard label="הוצאות" value={totals.expenses} />
      </div>

      {/* Dedicated YoY comparison section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">לעומת אשתקד</CardTitle>
        </CardHeader>
        <CardContent>
          {anyLY ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <DeltaBadge label="הכנסות" delta={computeDelta(totals.income, totals.incomeLY)} />
              <DeltaBadge label="הוצאות" delta={computeDelta(totals.expenses, totals.expensesLY)} />
              <DeltaBadge
                label="חיסכון נטו"
                delta={computeDelta(totals.netSavings, totals.netSavingsLY)}
              />
              <DeltaBadge
                label="אחוז חיסכון"
                delta={computeDelta(totals.savingsRate, totals.savingsRateLY)}
              />
              <DeltaBadge
                label="הושקע"
                delta={computeDelta(totals.investment, totals.investmentLY)}
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              אין נתונים לאותו חודש אשתקד — זהו החודש המוקדם ביותר עם נתונים.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Breakdown with ghost-bar overlay toggle */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">הוצאות לפי קטגוריה</CardTitle>
            <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox
                checked={showGhost}
                onCheckedChange={(v) => setShowGhost(v === true)}
                disabled={!anyLY}
              />
              הצג פסי אשתקד
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <div className="min-w-0 flex-1 divide-y">
            {breakdown.map((node) => (
              <NodeRow
                key={node.id}
                node={node}
                total={total}
                max={max}
                showGhost={showGhost && anyLY}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
