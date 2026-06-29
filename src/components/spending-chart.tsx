"use client";

import * as React from "react";
import { PieChart as PieChartIcon } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Amount } from "@/components/ui/amount";
import { EmptyState } from "@/components/empty-state";
import type { CategorySpending } from "@/lib/analytics";

/**
 * Spending-by-category chart (Phase 2 F3, issue #51).
 *
 * Always a horizontal bar chart (categories on the Y-axis, amounts on the
 * X-axis) so long Hebrew category labels never overlap regardless of count.
 *
 * Sizing strategy:
 *   - ≤ SCROLL_THRESHOLD categories → bars fill a fixed-height area; the chart
 *     auto-sizes within it so a handful of categories read comfortably.
 *   - >  SCROLL_THRESHOLD categories → the chart grows by ROW_HEIGHT per row
 *     and lives inside a vertically-scrolling container capped at MAX_SCROLL_H,
 *     so a long tail stays readable instead of being crushed.
 *
 * Labels truncate with an ellipsis on the axis; the FULL name appears in the
 * hover tooltip alongside the amount and its share of total spending.
 *
 * RTL: the chart is rendered inside the app's `dir="rtl"` tree, so Recharts
 * orients the category (Y) axis on the RIGHT and bars grow leftward — exactly
 * what Hebrew readers expect. The YAxis is given `orientation="right"` to lock
 * this regardless of how Recharts resolves direction.
 *
 * Color: bars use the F3 emerald accent (emerald-600) rather than the
 * per-category `color` from the API. A single accent keeps the dashboard calm
 * (Monarch/Linear aesthetic) and avoids a rainbow of saturated hues; the
 * category identity is carried by the axis label, not the bar fill.
 */

const SCROLL_THRESHOLD = 8;
const ROW_HEIGHT = 44; // px per category row in the scrolling variant
const MAX_SCROLL_HEIGHT = 360; // px — scroll container cap (~8 rows visible)
const FIXED_HEIGHT = 288; // px — non-scrolling variant height (h-72)
const LABEL_MAX_CHARS = 14;
const EMERALD_600 = "#059669";

function truncateLabel(label: string): string {
  if (label.length <= LABEL_MAX_CHARS) return label;
  return `${label.slice(0, LABEL_MAX_CHARS - 1)}…`;
}

type ChartDatum = {
  id: string;
  name: string;
  amount: number;
  percent: number;
};

/** Custom Y-axis tick that truncates long category names with an ellipsis. */
function TruncatedYAxisTick(props: { x?: number; y?: number; payload?: { value?: string } }) {
  const { x, y, payload } = props;
  const value = payload?.value ?? "";
  return (
    <text x={x} y={y} dy={4} textAnchor="end" className="fill-muted-foreground" fontSize={12}>
      {truncateLabel(value)}
    </text>
  );
}

/** Tooltip: full category name + amount (<Amount>) + % of period spending. */
function SpendingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;

  return (
    <div className="border-border/50 bg-background grid min-w-40 gap-1 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
      <div className="text-foreground font-medium">{datum.name}</div>
      <div className="flex items-center justify-between gap-4">
        <Amount
          amount={datum.amount}
          currency="ILS"
          colorize={false}
          fractionDigits={0}
          className="text-foreground font-medium"
        />
        <span className="text-muted-foreground tabular-nums">{datum.percent}% מסך ההוצאות</span>
      </div>
    </div>
  );
}

export function SpendingChart({ spending }: { spending: CategorySpending[] }) {
  const total = React.useMemo(() => spending.reduce((sum, s) => sum + s.amount, 0), [spending]);

  const data: ChartDatum[] = React.useMemo(
    () =>
      spending.map((s) => ({
        id: s.categoryId,
        name: s.categoryName,
        amount: s.amount,
        percent: total > 0 ? Math.round((s.amount / total) * 100) : 0,
      })),
    [spending, total],
  );

  const chartConfig: ChartConfig = React.useMemo(
    () =>
      data.reduce<ChartConfig>((cfg, item) => {
        cfg[item.id] = { label: item.name, color: EMERALD_600 };
        return cfg;
      }, {}),
    [data],
  );

  if (spending.length === 0) {
    return (
      <EmptyState
        icon={PieChartIcon}
        heading="אין הוצאות בחודש זה"
        explainer="לא נמצאו עסקאות הוצאה מסווגות לתקופה שנבחרה."
      />
    );
  }

  const isScrolling = data.length > SCROLL_THRESHOLD;
  const chartHeight = isScrolling ? data.length * ROW_HEIGHT : FIXED_HEIGHT;

  const chart = (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto w-full"
      style={{ height: chartHeight }}
    >
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <XAxis
          type="number"
          tickFormatter={(v: number) =>
            new Intl.NumberFormat("he-IL", {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(v)
          }
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          orientation="right"
          width={110}
          tick={<TruncatedYAxisTick />}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <ChartTooltip cursor={{ className: "fill-muted/40" }} content={<SpendingTooltip />} />
        <Bar dataKey="amount" fill={EMERALD_600} radius={[4, 0, 0, 4]} />
      </BarChart>
    </ChartContainer>
  );

  if (isScrolling) {
    return (
      <div className="overflow-y-auto" style={{ maxHeight: MAX_SCROLL_HEIGHT }}>
        {chart}
      </div>
    );
  }

  return chart;
}
