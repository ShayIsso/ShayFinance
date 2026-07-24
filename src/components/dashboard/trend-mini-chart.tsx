"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import type { TrendsMonthPoint } from "@/lib/reports";

export type TrendMiniChartProps = {
  /** Chronological month points from `/api/reports/trends` (12-month default). */
  months: TrendsMonthPoint[];
};

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

// Fixed pixel height; the width is measured from the container so the SVG
// coordinate space is 1:1 with rendered pixels (#170's lesson, mirrored from
// TrendsChart in reports-panel.tsx — a constant viewBox + preserveAspectRatio
// letterboxes on wide monitors).
const CHART_HEIGHT = 64;
const PLOT_PAD_Y = 6;

export type TrendBarGeometry = {
  x: number;
  width: number;
  y: number;
  height: number;
  positive: boolean;
};

export type TrendMiniLayout = {
  bars: TrendBarGeometry[];
  zeroY: number;
};

/**
 * Pure net-savings bar geometry — a compact echo of TrendsChart's yOf/zeroY
 * scaling in reports-panel.tsx, sized to a fixed small height with no axis
 * gutter. `months` and the returned `bars` are index-aligned. Exported for
 * node-only testing (repo vitest has no jsdom).
 */
export function computeTrendMiniLayout(
  months: Pick<TrendsMonthPoint, "netSavings">[],
  width: number,
  height: number = CHART_HEIGHT,
): TrendMiniLayout {
  const n = months.length;
  const plotTop = PLOT_PAD_Y;
  const plotBottom = height - PLOT_PAD_Y;
  const plotH = Math.max(1, plotBottom - plotTop);
  if (n === 0 || width <= 0) {
    return { bars: [], zeroY: plotTop + plotH / 2 };
  }

  const nets = months.map((m) => m.netSavings);
  const yMax = Math.max(0, ...nets);
  const yMin = Math.min(0, ...nets);
  const span = yMax - yMin || 1;
  const yOf = (v: number) => plotTop + ((yMax - v) / span) * plotH;
  const zeroY = yOf(0);

  const slot = width / n;
  const barWidth = Math.max(2, Math.min(14, slot * 0.6));
  const bars = nets.map((v) => {
    const y = yOf(v);
    const top = Math.min(y, zeroY);
    const barHeight = Math.max(1, Math.abs(y - zeroY));
    return { top, barHeight, positive: v >= 0 };
  });

  return {
    zeroY,
    bars: bars.map(({ top, barHeight, positive }, i) => ({
      x: slot * (i + 0.5) - barWidth / 2,
      width: barWidth,
      y: top,
      height: barHeight,
      positive,
    })),
  };
}

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

function monthLabel(m: Pick<TrendsMonthPoint, "year" | "month">): string {
  return `${HEBREW_MONTHS_SHORT[m.month - 1]} ${m.year}`;
}

/**
 * A′ trend widget — a compact 12-month net-savings mirror of the דוחות trends
 * page, deliberately at-a-glance only (#108: full trend analysis stays on
 * דוחות).
 */
export function TrendMiniChart({ months }: TrendMiniChartProps) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const n = months.length;
  const layout = React.useMemo(
    () => computeTrendMiniLayout(months, width, CHART_HEIGHT),
    [months, width],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="text-muted-foreground size-4" strokeWidth={1.5} />
          מגמת חיסכון נטו · 12 חודשים
        </CardTitle>
      </CardHeader>
      <CardContent>
        {n === 0 ? (
          <p className="text-muted-foreground text-sm">אין נתונים היסטוריים</p>
        ) : (
          <>
            {/* dir="ltr": time flows left→right (oldest→newest), the same
                convention TrendsChart uses in reports-panel.tsx — independent
                of the page's RTL, so this mirror never disagrees with דוחות
                on which side is "later". */}
            <div ref={ref} dir="ltr" className="relative w-full" style={{ height: CHART_HEIGHT }}>
              {width > 0 && (
                <svg
                  width={width}
                  height={CHART_HEIGHT}
                  viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
                  role="img"
                  aria-label="מגמת חיסכון נטו לפי חודש, 12 חודשים אחרונים"
                >
                  <line
                    x1={0}
                    x2={width}
                    y1={layout.zeroY}
                    y2={layout.zeroY}
                    className="stroke-border"
                    strokeWidth={1}
                  />
                  {months.map((m, i) => {
                    const bar = layout.bars[i];
                    if (!bar) return null;
                    return (
                      <rect
                        key={`${m.year}-${m.month}`}
                        x={bar.x}
                        y={bar.y}
                        width={bar.width}
                        height={bar.height}
                        rx={1.5}
                        className={bar.positive ? "fill-pos" : "fill-neg"}
                        // The last point is always the current, in-progress
                        // calendar month (same enumerateMonthRange invariant
                        // TrendsChart relies on) — faded to match its caption.
                        opacity={i === n - 1 ? 0.5 : 1}
                        onMouseEnter={() => setHover(i)}
                        onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                      />
                    );
                  })}
                </svg>
              )}
              {hover !== null && months[hover] && layout.bars[hover] && (
                <div
                  dir="rtl"
                  className="bg-popover text-popover-foreground pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-sm"
                  style={{ left: layout.bars[hover].x + layout.bars[hover].width / 2 }}
                >
                  <span className="font-medium">{monthLabel(months[hover])}</span>
                  <span className="text-muted-foreground"> · </span>
                  <Amount amount={months[hover].netSavings} fractionDigits={0} />
                </div>
              )}
            </div>
            <p dir="ltr" className="text-muted-foreground mt-2 flex justify-between text-xs">
              <span>{monthLabel(months[0])}</span>
              <span>{monthLabel(months[n - 1])}</span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
