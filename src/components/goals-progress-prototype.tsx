"use client";

/**
 * PROTOTYPE — throwaway (BGR10, #167). Three structurally different
 * treatments of the Dashboard goals progress card, switchable via `?variant=`
 * on the real "/" route (sub-shape A per the prototype skill — real header,
 * real month strip, fake goal data). Owner reaction pass happens BEFORE the
 * real card is implemented (the map's binding UI rule). Never merges past
 * this reaction-pass commit — the winner gets rewritten against live
 * getGoalStatuses() data, this file and the switcher get dropped from main.
 *
 * Fake data intentionally includes one goal with a bad month (רכב חדש) so a
 * negative contribution's honest, unclamped drag on progress is visible —
 * CONTEXT.md "savings goal": progress is opening + cumulative Net Savings,
 * never floored at 0 or the opening amount.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ChevronLeft, Target, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";

type FakeGoal = {
  id: string;
  name: string;
  startMonth: string;
  targetMonth: string | null;
  opening: number;
  target: number;
  current: number;
  expected: number | null;
  /** Illustrative only — one negative entry per the "bad month" requirement. */
  monthlyNetSavings: number[];
};

const CURRENT_MONTH_LABEL = "יולי 2026";

// "רכב חדש" carries a -4200 month (car repair) inside its 7-month run — the
// cumulative sum still honestly reflects it: current sits well under the
// linear pace line, with no clamping back up.
export const FAKE_GOALS: FakeGoal[] = [
  {
    id: "fake-1",
    name: "קרן חירום",
    startMonth: "2026-01",
    targetMonth: "2026-12",
    opening: 5000,
    target: 30000,
    current: 19600,
    expected: 19583.33,
    monthlyNetSavings: [2400, 2100, 1900, 2600, 1800, 2000, 1800],
  },
  {
    id: "fake-2",
    name: "חופשה בקיץ",
    startMonth: "2026-03",
    targetMonth: null,
    opening: 0,
    target: 8000,
    current: 3200,
    expected: null,
    monthlyNetSavings: [900, 700, 850, 750],
  },
  {
    id: "fake-3",
    name: "רכב חדש",
    startMonth: "2026-01",
    targetMonth: "2027-06",
    opening: 0,
    target: 60000,
    current: 8000,
    expected: 23333.33,
    monthlyNetSavings: [3200, 3400, 2900, -4200, 1600, 1100, 0],
  },
];

function pct(current: number, target: number): number {
  return (current / target) * 100;
}

/** Visual bar fill only — clamped 0-100 for layout; the printed number never is. */
function clampedFill(current: number, target: number): number {
  return Math.max(0, Math.min(100, pct(current, target)));
}

function paceLabel(current: number, expected: number | null): { text: string; tone: string } {
  if (expected === null) return { text: "ללא יעד זמן", tone: "text-muted-foreground" };
  const diff = current - expected;
  if (diff >= -1) return { text: "בקצב או לפני הקצב", tone: "text-emerald-700" };
  return { text: "מאחורי הקצב", tone: "text-red-700" };
}

// ── Variant A — compact multi-goal list ─────────────────────────────────────

function VariantA() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4" strokeWidth={1.5} />
          יעדי חיסכון
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {FAKE_GOALS.map((g) => {
          const pace = paceLabel(g.current, g.expected);
          const percent = pct(g.current, g.target);
          return (
            <div key={g.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{g.name}</span>
                <span className="text-muted-foreground tabular-nums">{Math.round(percent)}%</span>
              </div>
              <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full ${g.current < 0 ? "bg-red-500" : "bg-emerald-500"}`}
                  style={{ width: `${clampedFill(g.current, g.target)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  <Amount amount={g.current} fractionDigits={0} /> מתוך{" "}
                  <Amount amount={g.target} colorize={false} fractionDigits={0} />
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 font-medium ${pace.tone} ${g.expected === null ? "border-muted" : diffBorder(g.current, g.expected)}`}
                >
                  {pace.text}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function diffBorder(current: number, expected: number): string {
  return current - expected >= -1 ? "border-emerald-200" : "border-red-200";
}

// ── Variant B — single-goal hero with ring + deadline pace line ────────────

function ProgressRing({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const negative = percent < 0;
  const size = 128;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={negative ? "#dc2626" : "#10b981"}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function VariantB() {
  // Featured goal: the one with a deadline furthest behind pace — reads as
  // "the goal that most needs your attention" for a single-goal hero.
  const featured = FAKE_GOALS[2];
  const percent = pct(featured.current, featured.target);
  const pace = paceLabel(featured.current, featured.expected);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4" strokeWidth={1.5} />
          {featured.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className="relative flex shrink-0 items-center justify-center">
            <ProgressRing percent={percent} />
            <span className="absolute text-lg font-semibold tabular-nums">
              {Math.round(percent)}%
            </span>
          </div>
          <div className="flex-1 space-y-2">
            <div>
              <Amount amount={featured.current} className="text-2xl font-semibold" />
              <span className="text-muted-foreground text-sm"> מתוך </span>
              <Amount
                amount={featured.target}
                colorize={false}
                className="text-muted-foreground text-sm"
              />
            </div>
            {featured.expected !== null && (
              <p className={`text-sm font-medium ${pace.tone}`}>
                {pace.text} — צפי לינארי כה: <Amount amount={featured.expected} colorize={false} />
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              יעד: <Amount amount={featured.target - featured.current} colorize={false} /> נותרו
            </p>
            {/* Monthly sparkline — the negative bar is the point of this fake dataset. */}
            <div className="flex h-8 items-end gap-1 pt-2">
              {featured.monthlyNetSavings.map((m, i) => {
                const max = Math.max(...featured.monthlyNetSavings.map(Math.abs), 1);
                const height = Math.max(4, (Math.abs(m) / max) * 32);
                return (
                  <div
                    key={i}
                    title={`${m}`}
                    className={`w-3 rounded-sm ${m < 0 ? "bg-red-500" : "bg-emerald-400"}`}
                    style={{ height }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Variant C — stacked full cards, one per goal ────────────────────────────

function VariantC() {
  return (
    <div className="space-y-3">
      {FAKE_GOALS.map((g) => {
        const percent = pct(g.current, g.target);
        const pace = paceLabel(g.current, g.expected);
        const behind = g.expected !== null && g.current - g.expected < -1;
        return (
          <Card key={g.id}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="text-muted-foreground size-4" strokeWidth={1.5} />
                  <span className="font-medium">{g.name}</span>
                </div>
                {behind ? (
                  <TrendingDown className="size-4 text-red-600" strokeWidth={1.5} />
                ) : (
                  <TrendingUp className="size-4 text-emerald-600" strokeWidth={1.5} />
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-muted-foreground text-xs">התקדמות</div>
                  <Amount amount={g.current} className="text-lg font-semibold" />
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">יעד</div>
                  <Amount amount={g.target} colorize={false} className="text-lg font-semibold" />
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">נותר</div>
                  <Amount
                    amount={g.target - g.current}
                    colorize={false}
                    className="text-lg font-semibold"
                  />
                </div>
              </div>
              <div className="bg-muted mt-3 h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full ${g.current < 0 ? "bg-red-500" : "bg-emerald-500"}`}
                  style={{ width: `${clampedFill(g.current, g.target)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{Math.round(percent)}%</span>
                <span className={pace.tone}>{pace.text}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const VARIANTS = [
  { key: "A", label: "רשימה קומפקטית", Component: VariantA },
  { key: "B", label: "כרטיס יחיד מוגדל", Component: VariantB },
  { key: "C", label: "כרטיסי מדף", Component: VariantC },
];

export function GoalsProgressPrototype() {
  const searchParams = useSearchParams();
  const current = searchParams.get("variant") ?? VARIANTS[0].key;
  const active = VARIANTS.find((v) => v.key === current) ?? VARIANTS[0];

  return (
    <div id="goals-progress-prototype">
      <p className="text-muted-foreground mb-2 text-xs">
        PROTOTYPE — יעדי חיסכון ({CURRENT_MONTH_LABEL}, נתונים בדויים)
      </p>
      <active.Component />
    </div>
  );
}

export function GoalsProgressPrototypeSwitcher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("variant") ?? VARIANTS[0].key;
  const index = Math.max(
    0,
    VARIANTS.findIndex((v) => v.key === current),
  );

  const go = React.useCallback(
    (delta: number) => {
      const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", next.key);
      router.replace(`?${params.toString()}`);
    },
    [index, searchParams, router],
  );

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") go(1);
      if (e.key === "ArrowRight") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
      <button type="button" onClick={() => go(-1)} aria-label="הקודם" className="p-0.5">
        <ChevronRight className="size-4" />
      </button>
      <span className="min-w-44 text-center tabular-nums">
        {VARIANTS[index].key} — {VARIANTS[index].label}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="הבא" className="p-0.5">
        <ChevronLeft className="size-4" />
      </button>
    </div>
  );
}
