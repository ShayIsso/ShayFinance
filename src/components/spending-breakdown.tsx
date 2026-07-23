"use client";

import * as React from "react";
import { PieChart as PieChartIcon, ChevronDown } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Amount } from "@/components/ui/amount";
import type { CategorySpendingNode } from "@/lib/analytics";

/**
 * Group-first expense breakdown (BGR5 #162, ADR-0011 §4 aggregation lens).
 * Primary surface is a two-level list: top level is groups + root leaves, each
 * with a share bar / amount / %, and a group expands its leaves in place. All
 * drill-down happens ONLY in the list.
 *
 * A compact donut sits beside it as a purely visual summary — its slices mirror
 * the list's top level and its center shows the period total. It is a mirror,
 * never a control: no tap-to-drill, no mode switch. Hovering (or expanding) a
 * list row emphasizes the matching slice by dimming the others; that is the
 * only state the donut reads.
 *
 * Bars are neutral gray (calm dashboard palette); a category-color dot carries
 * identity so a dot and its donut slice correspond. Emerald stays reserved for
 * positive numbers elsewhere — an expense breakdown has none.
 */

function formatPercent(amount: number, total: number): number {
  return total > 0 ? Math.round((amount / total) * 100) : 0;
}

function CategoryDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full ${className ?? ""}`}
      style={{ backgroundColor: color }}
    />
  );
}

// ── Donut (visual mirror of the list's top level) ─────────────────────────────

const DONUT_OUTER = 80;
const DONUT_INNER = 52;
const DONUT_CENTER = 100;

type DonutSegment = { id: string; d: string; color: string };

function donutSegments(nodes: CategorySpendingNode[], total: number): DonutSegment[] {
  let angle = -Math.PI / 2;
  return nodes.map((node) => {
    const fraction = total > 0 ? node.amount / total : 0;
    const start = angle;
    const end = angle + fraction * Math.PI * 2;
    angle = end;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = DONUT_CENTER + DONUT_OUTER * Math.cos(start);
    const y1 = DONUT_CENTER + DONUT_OUTER * Math.sin(start);
    const x2 = DONUT_CENTER + DONUT_OUTER * Math.cos(end);
    const y2 = DONUT_CENTER + DONUT_OUTER * Math.sin(end);
    const xi2 = DONUT_CENTER + DONUT_INNER * Math.cos(end);
    const yi2 = DONUT_CENTER + DONUT_INNER * Math.sin(end);
    const xi1 = DONUT_CENTER + DONUT_INNER * Math.cos(start);
    const yi1 = DONUT_CENTER + DONUT_INNER * Math.sin(start);
    const d = `M ${x1} ${y1} A ${DONUT_OUTER} ${DONUT_OUTER} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${DONUT_INNER} ${DONUT_INNER} 0 ${large} 0 ${xi1} ${yi1} Z`;
    return { id: node.categoryId, d, color: node.color };
  });
}

function Donut({
  nodes,
  total,
  emphasizedId,
}: {
  nodes: CategorySpendingNode[];
  total: number;
  emphasizedId: string | null;
}) {
  // A lone 100% slice degenerates to a zero-length arc; draw a full ring instead.
  const single = nodes.length === 1 ? nodes[0] : null;
  const segments = single ? [] : donutSegments(nodes, total);

  return (
    <div className="relative shrink-0" aria-hidden>
      <svg viewBox="0 0 200 200" className="size-44">
        {single ? (
          <>
            <circle cx={DONUT_CENTER} cy={DONUT_CENTER} r={DONUT_OUTER} fill={single.color} />
            <circle cx={DONUT_CENTER} cy={DONUT_CENTER} r={DONUT_INNER} fill="#fff" />
          </>
        ) : (
          segments.map((seg) => (
            <path
              key={seg.id}
              d={seg.d}
              fill={seg.color}
              stroke="#fff"
              strokeWidth={1.5}
              className="transition-opacity duration-150"
              style={{ opacity: emphasizedId && emphasizedId !== seg.id ? 0.3 : 1 }}
            />
          ))
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-muted-foreground text-xs">סך הוצאות</span>
        <Amount
          amount={total}
          currency="ILS"
          colorize={false}
          fractionDigits={0}
          className="text-lg font-bold"
        />
      </div>
    </div>
  );
}

// ── List (primary surface; the only place drill-down happens) ─────────────────

function LeafRow({
  leaf,
  max,
  onEmphasize,
  onClearEmphasis,
}: {
  leaf: CategorySpendingNode["children"][number];
  max: number;
  onEmphasize: () => void;
  onClearEmphasis: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 py-1 pr-11"
      onMouseEnter={onEmphasize}
      onMouseLeave={onClearEmphasis}
    >
      <CategoryDot color={leaf.color} />
      <span className="text-muted-foreground w-36 shrink-0 truncate text-sm">
        {leaf.categoryName}
      </span>
      <div className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
        <div
          className="bg-bar h-full rounded-full"
          style={{ width: max > 0 ? `${(leaf.amount / max) * 100}%` : "0%" }}
        />
      </div>
      <Amount
        amount={leaf.amount}
        currency="ILS"
        colorize={false}
        fractionDigits={0}
        className="w-24 shrink-0 text-left text-sm tabular-nums"
      />
      <span className="w-9 shrink-0" />
    </div>
  );
}

function NodeRow({
  node,
  total,
  max,
  isOpen,
  onToggle,
  onEmphasize,
  onClearEmphasis,
}: {
  node: CategorySpendingNode;
  total: number;
  max: number;
  isOpen: boolean;
  onToggle: () => void;
  onEmphasize: () => void;
  onClearEmphasis: () => void;
}) {
  const isGroup = node.children.length > 0;
  const share = formatPercent(node.amount, total);

  const label = (
    <>
      {isGroup ? (
        <ChevronDown
          className={`text-muted-foreground size-4 shrink-0 transition-transform ${
            isOpen ? "" : "-rotate-90"
          }`}
          strokeWidth={1.5}
        />
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <CategoryDot color={node.color} />
      <span className="w-40 shrink-0 truncate text-sm font-medium">{node.categoryName}</span>
      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
        <div
          className="bg-bar-strong h-full rounded-full"
          style={{ width: max > 0 ? `${(node.amount / max) * 100}%` : "0%" }}
        />
      </div>
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
          onClick={onToggle}
          onMouseEnter={onEmphasize}
          onMouseLeave={onClearEmphasis}
          aria-expanded={isOpen}
        >
          {label}
        </button>
      ) : (
        <div
          className="flex w-full items-center gap-3 rounded-md py-2.5 text-right"
          onMouseEnter={onEmphasize}
          onMouseLeave={onClearEmphasis}
        >
          {label}
        </div>
      )}
      {isGroup && isOpen && (
        <div className="mb-1 space-y-1 pb-1">
          {node.children.map((leaf) => (
            <LeafRow
              key={leaf.categoryId}
              leaf={leaf}
              max={max}
              onEmphasize={onEmphasize}
              onClearEmphasis={onClearEmphasis}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function SpendingBreakdown({ nodes }: { nodes: CategorySpendingNode[] }) {
  const [openIds, setOpenIds] = React.useState<Set<string>>(new Set());
  const [emphasizedId, setEmphasizedId] = React.useState<string | null>(null);

  const total = React.useMemo(() => nodes.reduce((sum, n) => sum + n.amount, 0), [nodes]);
  const max = React.useMemo(() => Math.max(0, ...nodes.map((n) => n.amount)), [nodes]);

  if (nodes.length === 0) {
    return (
      <EmptyState
        icon={PieChartIcon}
        heading="אין הוצאות בחודש זה"
        explainer="לא נמצאו עסקאות הוצאה מסווגות לתקופה שנבחרה."
      />
    );
  }

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Touch/click emphasis (no hover to rely on): mirror the toggled group.
    setEmphasizedId(id);
  }

  return (
    <div
      data-testid="spending-breakdown"
      className="flex flex-col gap-6 md:flex-row md:items-start"
    >
      <div className="mx-auto md:mx-0">
        <Donut nodes={nodes} total={total} emphasizedId={emphasizedId} />
      </div>
      <div className="min-w-0 flex-1 divide-y">
        {nodes.map((node) => (
          <NodeRow
            key={node.categoryId}
            node={node}
            total={total}
            max={max}
            isOpen={openIds.has(node.categoryId)}
            onToggle={() => toggle(node.categoryId)}
            onEmphasize={() => setEmphasizedId(node.categoryId)}
            onClearEmphasis={() => setEmphasizedId(null)}
          />
        ))}
      </div>
    </div>
  );
}
