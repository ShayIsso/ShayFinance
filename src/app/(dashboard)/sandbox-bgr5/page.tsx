"use client";

/**
 * THROWAWAY prototype sandbox for BGR5 (#162) — group-first spending breakdown
 * with drill-down. Delete this route (and its screenshot script) once the owner
 * picks a variant. Uses inline fake data resembling the real 17-leaf / 3-group
 * taxonomy; no API, no real analytics wiring.
 */

import * as React from "react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Leaf = { id: string; name: string; amount: number; color: string };
type Node = { id: string; name: string; amount: number; color: string; children: Leaf[] };

// Fake month, group-first, resembling the real taxonomy (groups: אוכל, בית
// וחשבונות, פנאי וקניות; root leaves: תחבורה, בריאות וטיפוח, מזומן ומשיכות).
const DATA: Node[] = [
  {
    id: "g-home",
    name: "בית וחשבונות",
    amount: 5520,
    color: "#2563eb",
    children: [
      { id: "l-rent", name: "דיור ושכירות", amount: 4500, color: "#2563eb" },
      { id: "l-utils", name: "חשבונות ושירותים", amount: 780, color: "#3b82f6" },
      { id: "l-subs", name: "מנויים", amount: 240, color: "#60a5fa" },
    ],
  },
  {
    id: "g-food",
    name: "אוכל",
    amount: 3250,
    color: "#dc2626",
    children: [
      { id: "l-groceries", name: "מזון וסופר", amount: 2400, color: "#dc2626" },
      { id: "l-rest", name: "מסעדות וקפה", amount: 850, color: "#ef4444" },
    ],
  },
  {
    id: "g-leisure",
    name: "פנאי וקניות",
    amount: 2020,
    color: "#9333ea",
    children: [
      { id: "l-shop", name: "קניות וביגוד", amount: 1100, color: "#9333ea" },
      { id: "l-fun", name: "בילויים ופנאי", amount: 620, color: "#a855f7" },
      { id: "l-gifts", name: "מתנות ואירועים", amount: 300, color: "#c084fc" },
    ],
  },
  { id: "l-transport", name: "תחבורה", amount: 900, color: "#0d9488", children: [] },
  { id: "l-cash", name: "מזומן ומשיכות", amount: 500, color: "#64748b", children: [] },
  { id: "l-health", name: "בריאות וטיפוח", amount: 430, color: "#db2777", children: [] },
];

const TOTAL = DATA.reduce((s, n) => s + n.amount, 0);

function shekel(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number): number {
  return Math.round((n / TOTAL) * 100);
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant A — two-level expandable list (calm, dense; drill in place)
// ─────────────────────────────────────────────────────────────────────────────

function VariantA({ initialOpen }: { initialOpen: string[] }) {
  const [open, setOpen] = React.useState<Set<string>>(new Set(initialOpen));
  const max = Math.max(...DATA.map((n) => n.amount));

  return (
    <div className="divide-y">
      {DATA.map((node) => {
        const isGroup = node.children.length > 0;
        const isOpen = open.has(node.id);
        return (
          <div key={node.id}>
            <button
              className="flex w-full items-center gap-3 py-2.5 text-right"
              onClick={() =>
                isGroup &&
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                })
              }
            >
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
              <Dot color={node.color} />
              <span className="w-40 shrink-0 truncate text-sm font-medium">{node.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gray-400"
                  style={{ width: `${(node.amount / max) * 100}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-left text-sm font-semibold tabular-nums">
                {shekel(node.amount)}
              </span>
              <span className="text-muted-foreground w-9 shrink-0 text-left text-xs tabular-nums">
                {pct(node.amount)}%
              </span>
            </button>
            {isGroup && isOpen && (
              <div className="mb-1 space-y-1 pb-1">
                {node.children.map((leaf) => (
                  <div key={leaf.id} className="flex items-center gap-3 py-1 pr-11">
                    <Dot color={leaf.color} />
                    <span className="text-muted-foreground w-36 shrink-0 truncate text-sm">
                      {leaf.name}
                    </span>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-50">
                      <div
                        className="h-full rounded-full bg-gray-300"
                        style={{ width: `${(leaf.amount / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-left text-sm tabular-nums">
                      {shekel(leaf.amount)}
                    </span>
                    <span className="w-9 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant B — group bars that expand to nested leaf sub-bars in place
// ─────────────────────────────────────────────────────────────────────────────

function VariantB({ initialOpen }: { initialOpen: string[] }) {
  const [open, setOpen] = React.useState<Set<string>>(new Set(initialOpen));
  const max = Math.max(...DATA.map((n) => n.amount));

  return (
    <div className="space-y-2.5">
      {DATA.map((node) => {
        const isGroup = node.children.length > 0;
        const isOpen = open.has(node.id);
        return (
          <div key={node.id}>
            <button
              className="group flex w-full items-center gap-2 text-right"
              onClick={() =>
                isGroup &&
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                })
              }
            >
              <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-gray-100">
                <div
                  className="h-full rounded-md"
                  style={{
                    width: `${(node.amount / max) * 100}%`,
                    backgroundColor: isGroup ? "#334155" : "#94a3b8",
                  }}
                />
                <span className="absolute inset-y-0 right-3 flex items-center gap-2 text-sm font-medium text-white mix-blend-normal">
                  {isGroup && (
                    <ChevronDown
                      className={`size-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                      strokeWidth={2}
                    />
                  )}
                  <Dot color={node.color} />
                  {node.name}
                </span>
              </div>
              <span className="w-24 shrink-0 text-left text-sm font-semibold tabular-nums">
                {shekel(node.amount)}
              </span>
            </button>
            {isGroup && isOpen && (
              <div className="mt-1.5 space-y-1.5 pr-6">
                {node.children.map((leaf) => (
                  <div key={leaf.id} className="flex items-center gap-2">
                    <div className="relative h-6 flex-1 overflow-hidden rounded bg-gray-50">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${(leaf.amount / max) * 100}%`,
                          backgroundColor: leaf.color,
                          opacity: 0.55,
                        }}
                      />
                      <span className="text-foreground absolute inset-y-0 right-2.5 flex items-center text-xs font-medium">
                        {leaf.name}
                      </span>
                    </div>
                    <span className="w-24 shrink-0 text-left text-xs tabular-nums">
                      {shekel(leaf.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant C — tap-to-drill donut (group ring → leaf ring, with back)
// ─────────────────────────────────────────────────────────────────────────────

function donutSegments(items: { amount: number; color: string }[], total: number) {
  const R = 80;
  const r = 52;
  const cx = 100;
  const cy = 100;
  let angle = -Math.PI / 2;
  return items.map((it) => {
    const frac = it.amount / total;
    const start = angle;
    const end = angle + frac * Math.PI * 2;
    angle = end;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(start);
    const y1 = cy + R * Math.sin(start);
    const x2 = cx + R * Math.cos(end);
    const y2 = cy + R * Math.sin(end);
    const xi2 = cx + r * Math.cos(end);
    const yi2 = cy + r * Math.sin(end);
    const xi1 = cx + r * Math.cos(start);
    const yi1 = cy + r * Math.sin(start);
    const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${large} 0 ${xi1} ${yi1} Z`;
    return { d, color: it.color };
  });
}

function VariantC({ initialDrill }: { initialDrill?: string }) {
  const [drill, setDrill] = React.useState<string | undefined>(initialDrill);
  const drilled = drill ? DATA.find((n) => n.id === drill) : undefined;

  const items = drilled ? drilled.children : DATA;
  const total = drilled ? drilled.amount : TOTAL;
  const segments = donutSegments(items, total);

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <svg viewBox="0 0 200 200" className="size-52">
          {segments.map((seg, i) => (
            <path key={i} d={seg.d} fill={seg.color} stroke="#fff" strokeWidth={1.5} />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-muted-foreground text-xs">
            {drilled ? drilled.name : "סך הוצאות"}
          </span>
          <span className="text-lg font-bold tabular-nums">{shekel(total)}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {drilled && (
          <button
            onClick={() => setDrill(undefined)}
            className="text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1 text-xs"
          >
            <ChevronLeft className="size-3.5" strokeWidth={1.5} />
            חזרה לכל הקטגוריות
          </button>
        )}
        <div className="space-y-0.5">
          {items.map((it) => {
            const isGroup = "children" in it && (it as Node).children.length > 0;
            return (
              <button
                key={it.id}
                onClick={() => isGroup && setDrill(it.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-right text-sm ${
                  isGroup ? "hover:bg-gray-50" : "cursor-default"
                }`}
              >
                <Dot color={it.color} />
                <span className="flex-1 truncate">{it.name}</span>
                <span className="font-semibold tabular-nums">{shekel(it.amount)}</span>
                <span className="text-muted-foreground w-9 text-left text-xs tabular-nums">
                  {Math.round((it.amount / total) * 100)}%
                </span>
                {isGroup && (
                  <ChevronLeft className="text-muted-foreground size-3.5" strokeWidth={1.5} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function VariantCard({
  id,
  tag,
  title,
  note,
  children,
}: {
  id: string;
  tag: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-900 px-1.5 py-0.5 text-xs font-medium text-white">
            {tag}
          </span>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
        <p className="text-muted-foreground text-sm">{note}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function SandboxBgr5Page() {
  return (
    <div className="mx-auto max-w-3xl space-y-6" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">BGR5 · פירוט הוצאות לפי קבוצה</h2>
        <p className="text-muted-foreground text-sm">
          שלוש גרסאות אב-טיפוס לפירוט קבוצה-תחילה עם צלילה לרמת עלה. נתוני דמה.
        </p>
      </div>

      <VariantCard
        id="variant-a"
        tag="גרסה א׳"
        title="רשימה נפתחת דו-שכבתית"
        note="קבוצות עם סרגל חלק ואחוז; לחיצה פותחת את העלים במקום. שקט וצפוף."
      >
        <VariantA initialOpen={["g-food"]} />
      </VariantCard>

      <VariantCard
        id="variant-b"
        tag="גרסה ב׳"
        title="עמודות קבוצה עם צלילה מקוננת"
        note="עמודה אופקית לכל קבוצה; לחיצה חושפת עמודות-משנה של העלים מתחתיה."
      >
        <VariantB initialOpen={["g-home"]} />
      </VariantCard>

      <VariantCard
        id="variant-c"
        tag="גרסה ג׳"
        title="טבעת עם צלילה בלחיצה"
        note="טבעת ברמת קבוצה; בחירת קבוצה מחליפה את הטבעת לעלים שלה, עם חזרה."
      >
        <div className="space-y-6">
          <VariantC />
          <div className="border-t pt-4">
            <p className="text-muted-foreground mb-3 text-xs">מצב לאחר צלילה לקבוצת אוכל:</p>
            <VariantC initialDrill="g-food" />
          </div>
        </div>
      </VariantCard>
    </div>
  );
}
