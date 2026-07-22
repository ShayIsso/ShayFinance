"use client";

/*
 * PROTOTYPE — design-system direction (#109). THROWAWAY, not production.
 *
 * One real screen (the Dashboard) held constant, restyled across three token
 * DIRECTIONS (A/B/C) with an orthogonal light/dark toggle — the deliberate
 * axis of variation is the visual language, not the layout. Switch direction
 * with the arrows (or ←/→), flip light/dark with the toggle. URL is
 * reload-stable (?variant=A&mode=dark). Everything is faux data.
 *
 * What this answers for the token sheet:
 *   1. token architecture — every var scoped on one wrapper; dark is a swap
 *   2. palette — neutral base + emerald-for-positive-only, per direction
 *   3. motion — duration/easing/travel per direction (hit "רענן" to replay)
 *   4. toast/feedback — hit "הצג הודעה"
 */

import * as React from "react";
import {
  LayoutDashboard,
  List,
  FileBarChart,
  Inbox,
  Repeat,
  RefreshCw,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  ArrowUpDown,
  Sparkles,
  Search,
  Check,
  AlertTriangle,
} from "lucide-react";

import "./prototype-tokens.css";

type Variant = "F" | "A" | "B" | "C";
type Mode = "light" | "dark";

const VARIANTS: { key: Variant; name: string; blurb: string }[] = [
  { key: "F", name: "מומלץ", blurb: "neutral zinc · subtle depth · unified dark · gentle rise" },
  { key: "A", name: "שקט", blurb: "warm ledger · borderless · airy · gentle" },
  { key: "B", name: "מכשור", blurb: "cool slate · dense · hairline rings · snappy" },
  { key: "C", name: "עומק רך", blurb: "zinc · soft shadow · rounded · scale-in" },
];

/* Category-identity dot colors — differentiation mechanism per the palette
 * law (neutral bars, category color lives in the dot). Fixed, not emerald. */
const CAT_COLORS = [
  "oklch(0.62 0.13 250)",
  "oklch(0.7 0.15 65)",
  "oklch(0.62 0.16 300)",
  "oklch(0.65 0.12 190)",
  "oklch(0.6 0.14 20)",
];

const fmt = (n: number) =>
  new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

// ── faux data ──────────────────────────────────────────────────────────────
const KPIS = [
  { label: "הכנסות", value: 24800, tone: "pos" as const },
  { label: "הוצאות", value: -17240, tone: "neg" as const },
  { label: "חיסכון נטו", value: 7560, tone: "pos" as const },
  { label: "שיעור חיסכון", value: 30.5, tone: "pct" as const },
];
const BUDGETS = [
  { name: "אוכל", spent: 3120, cap: 3000, verdict: "חריגה", tone: "neg", cat: 0 },
  { name: "פנאי וקניות", spent: 1980, cap: 2200, verdict: "בסיכון", tone: "warn", cat: 2 },
  { name: "תחבורה", spent: 640, cap: 1200, verdict: "בקצב", tone: "pos", cat: 3 },
  { name: "בית וחשבונות", spent: 4100, cap: 6000, verdict: "מתחת", tone: "muted", cat: 1 },
];
const GOALS = [
  { name: "קרן חירום", fill: 100, of: "40,000 ₪" },
  { name: "טיול ליפן", fill: 62, of: "18,000 ₪" },
  { name: "מקדמה לרכב", fill: 8, of: "60,000 ₪" },
];
const TXNS = [
  { date: "22 ביולי", merchant: "שופרסל דיל", cat: "אוכל", ci: 0, amount: -284.9 },
  { date: "21 ביולי", merchant: "משכורת — גיני", cat: "הכנסה", ci: 3, amount: 12400 },
  { date: "21 ביולי", merchant: "פז יעלים", cat: "תחבורה", ci: 3, amount: -212.0 },
  { date: "20 ביולי", merchant: "Netflix", cat: "פנאי וקניות", ci: 2, amount: -54.9 },
  { date: "19 ביולי", merchant: "סופר פארם", cat: "בריאות וטיפוח", ci: 1, amount: -139.4 },
];

// ── small styled primitives (token-driven, replicate the app's variants) ─────
function Btn({
  children,
  kind = "primary",
}: {
  children: React.ReactNode;
  kind?: "primary" | "secondary" | "ghost" | "destructive" | "outline";
}) {
  const styles: Record<string, string> = {
    primary: "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90",
    secondary: "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-80",
    ghost: "text-[var(--foreground)] hover:bg-[var(--muted)]",
    destructive:
      "bg-[var(--destructive)]/10 text-[var(--destructive)] hover:bg-[var(--destructive)]/20",
    outline: "border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]",
  };
  return (
    <button
      className={`inline-flex h-9 items-center gap-1.5 rounded-[calc(var(--radius)*0.75)] px-3.5 text-sm font-medium transition-all active:translate-y-px ${styles[kind]}`}
    >
      {children}
    </button>
  );
}

function VerdictPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const color =
    tone === "neg"
      ? "var(--proto-neg)"
      : tone === "warn"
        ? "var(--proto-warn)"
        : tone === "pos"
          ? "var(--proto-pos)"
          : "var(--muted-foreground)";
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ color, borderColor: color }}
    >
      {children}
    </span>
  );
}

export default function PrototypeDesignPage() {
  const [variant, setVariant] = React.useState<Variant>("F");
  const [mode, setMode] = React.useState<Mode>("light");
  const [animKey, setAnimKey] = React.useState(0);
  const [toasts, setToasts] = React.useState<{ id: number; tone: "pos" | "neg"; msg: string }[]>(
    [],
  );
  const toastId = React.useRef(0);

  // seed from URL, then keep URL in sync (reload-stable / shareable)
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("variant");
    const m = p.get("mode");
    if (v === "A" || v === "B" || v === "C") setVariant(v);
    if (m === "light" || m === "dark") setMode(m);
  }, []);
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set("variant", variant);
    p.set("mode", mode);
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [variant, mode]);

  const cycle = React.useCallback((dir: 1 | -1) => {
    setVariant((cur) => {
      const i = VARIANTS.findIndex((v) => v.key === cur);
      return VARIANTS[(i + dir + VARIANTS.length) % VARIANTS.length].key;
    });
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && ["INPUT", "TEXTAREA"].includes(el.tagName)) return;
      if (e.key === "ArrowLeft") cycle(1); // RTL: left = "next"
      if (e.key === "ArrowRight") cycle(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle]);

  const pushToast = (tone: "pos" | "neg") => {
    const id = ++toastId.current;
    const msg = tone === "pos" ? "הסנכרון הושלם — 42 תנועות חדשות" : "בנק מקס נכשל — נסה שוב";
    setToasts((t) => [...t, { id, tone, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

  const current = VARIANTS.find((v) => v.key === variant)!;

  return (
    <div data-proto={variant} data-mode={mode} className="proto-shell font-sans" dir="rtl">
      <div className="flex min-h-screen">
        {/* faux sidebar — faithful replica so density + RTL chrome are real */}
        <aside className="proto-sidebar fixed top-0 right-0 z-10 flex h-full w-56 flex-col">
          <div className="p-6" style={{ borderBottom: "1px solid var(--sidebar-border)" }}>
            <h1 className="text-lg font-bold tracking-tight text-[var(--foreground)]">
              ShayFinance
            </h1>
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {[
              [LayoutDashboard, "לוח בקרה", true],
              [List, "תנועות", false],
              [FileBarChart, "דוחות", false],
              [Inbox, "התאמות", false],
              [Repeat, "מנויים", false],
              [RefreshCw, "סנכרון", false],
              [Settings, "הגדרות", false],
            ].map(([Icon, label, active], i) => {
              const I = Icon as React.ComponentType<{ className?: string }>;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-[calc(var(--radius)*0.6)] px-3 py-2 text-sm font-medium"
                  style={
                    active
                      ? { background: "var(--accent)", color: "var(--accent-foreground)" }
                      : { color: "var(--muted-foreground)" }
                  }
                >
                  <I className="h-4 w-4" />
                  <span className="flex-1">{label as string}</span>
                </div>
              );
            })}
          </nav>
        </aside>

        {/* main */}
        <main className="mr-56 flex-1 p-8">
          <div key={animKey} className="proto-gap mx-auto flex max-w-5xl flex-col">
            {/* header */}
            <div
              className="proto-enter flex flex-wrap items-center justify-between gap-3"
              style={{ animationDelay: "0ms" }}
            >
              <div>
                <h2 className="text-2xl font-semibold text-[var(--foreground)]">לוח בקרה</h2>
                <p className="proto-label mt-0.5">יולי 2026 · עודכן לפני 4 שעות</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Btn kind="primary">
                  <RefreshCw className="h-4 w-4" /> סנכרן עכשיו
                </Btn>
                <Btn kind="secondary">ייצוא CSV</Btn>
                <Btn kind="outline">ניהול</Btn>
                <Btn kind="destructive">מחק</Btn>
              </div>
            </div>

            {/* form-input strip */}
            <div
              className="proto-enter flex flex-wrap items-center gap-2"
              style={{ animationDelay: "40ms" }}
            >
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <input
                  placeholder="חיפוש תנועות…"
                  className="h-9 w-56 rounded-[calc(var(--radius)*0.75)] border border-[var(--input)] bg-[var(--card)] pr-8 pl-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]/40"
                />
              </div>
              <select className="h-9 rounded-[calc(var(--radius)*0.75)] border border-[var(--input)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--ring)]/40">
                <option>כל הקטגוריות</option>
                <option>אוכל</option>
                <option>תחבורה</option>
              </select>
            </div>

            {/* KPI band */}
            <div
              className="proto-enter grid grid-cols-2 gap-3 md:grid-cols-4"
              style={{ animationDelay: "80ms" }}
            >
              {KPIS.map((k) => (
                <div key={k.label} className="proto-card flex flex-col gap-1">
                  <span className="proto-label">{k.label}</span>
                  <span
                    className={`proto-stat-num text-2xl ${k.tone === "pos" ? "proto-pos" : k.tone === "neg" ? "proto-neg" : "text-[var(--foreground)]"}`}
                  >
                    {k.tone === "pct" ? `${k.value}%` : fmt(k.value)}
                  </span>
                </div>
              ))}
            </div>

            {/* pace hero + budgets */}
            <div
              className="proto-enter grid gap-3 lg:grid-cols-[1.4fr_1fr]"
              style={{ animationDelay: "120ms" }}
            >
              <div className="proto-card flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="proto-label">קצב הוצאה מול תקרה חודשית</span>
                  <VerdictPill tone="warn">בסיכון</VerdictPill>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="proto-hero-num text-4xl text-[var(--foreground)]">
                    {fmt(17240)}
                  </span>
                  <span className="proto-label">מתוך {fmt(21000)}</span>
                </div>
                <div className="proto-track h-2.5 w-full">
                  <div
                    className="proto-fill"
                    style={{ width: "82%", background: "var(--proto-warn)" }}
                  />
                </div>
                <p className="proto-label">82% מהתקרה · 71% מהחודש חלף — מעט לפני הקצב</p>
              </div>

              <div className="proto-card flex flex-col gap-3">
                <span className="proto-label">תקציבים</span>
                <div className="flex flex-col gap-2.5">
                  {BUDGETS.map((b) => (
                    <div key={b.name} className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: CAT_COLORS[b.cat] }}
                      />
                      <span className="flex-1 truncate text-sm text-[var(--foreground)]">
                        {b.name}
                      </span>
                      <span className="proto-stat-num text-xs text-[var(--muted-foreground)]">
                        {fmt(b.spent)} / {fmt(b.cap)}
                      </span>
                      <VerdictPill tone={b.tone}>{b.verdict}</VerdictPill>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* goals ladder */}
            <div
              className="proto-enter proto-card flex flex-col gap-3"
              style={{ animationDelay: "160ms" }}
            >
              <div className="flex items-center justify-between">
                <span className="proto-label">יעדי חיסכון — סולם עדיפויות</span>
                <span className="proto-label">עודף ללא יעד: {fmt(1240)}</span>
              </div>
              {GOALS.map((g) => (
                <div key={g.name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--foreground)]">{g.name}</span>
                    <span className="proto-stat-num text-xs text-[var(--muted-foreground)]">
                      {g.fill}% · {g.of}
                    </span>
                  </div>
                  <div className="proto-track h-2 w-full">
                    <div
                      className="proto-fill"
                      style={{
                        width: `${g.fill}%`,
                        background: g.fill >= 100 ? "var(--proto-pos)" : "var(--muted-foreground)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* transactions table */}
            <div className="proto-enter proto-card !p-0" style={{ animationDelay: "200ms" }}>
              <div className="flex items-center justify-between px-[var(--proto-pad)] pt-[var(--proto-pad)] pb-3">
                <span className="proto-label">תנועות אחרונות</span>
                <button className="inline-flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                  <ArrowUpDown className="h-3.5 w-3.5" /> תאריך
                </button>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {TXNS.map((t, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-[var(--proto-pad)] py-2.5 whitespace-nowrap text-[var(--muted-foreground)] tabular-nums">
                        {t.date}
                      </td>
                      <td className="py-2.5 text-[var(--foreground)]">{t.merchant}</td>
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: CAT_COLORS[t.ci] }}
                          />
                          {t.cat}
                        </span>
                      </td>
                      <td
                        className={`proto-stat-num px-[var(--proto-pad)] py-2.5 text-left tabular-nums ${t.amount < 0 ? "proto-neg" : "proto-pos"}`}
                      >
                        {fmt(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* motion + toast demo triggers */}
            <div
              className="proto-enter flex items-center gap-2"
              style={{ animationDelay: "240ms" }}
            >
              <button
                onClick={() => setAnimKey((k) => k + 1)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[calc(var(--radius)*0.75)] border border-[var(--border)] px-3.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                <Sparkles className="h-4 w-4" /> רענן (הרצת תנועה)
              </button>
              <button
                onClick={() => pushToast("pos")}
                className="inline-flex h-9 items-center rounded-[calc(var(--radius)*0.75)] border border-[var(--border)] px-3.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                הצג הודעה
              </button>
              <button
                onClick={() => pushToast("neg")}
                className="inline-flex h-9 items-center rounded-[calc(var(--radius)*0.75)] border border-[var(--border)] px-3.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                הצג שגיאה
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* toast host */}
      <div className="fixed top-4 left-1/2 z-40 flex -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="proto-toast min-w-64 text-sm text-[var(--card-foreground)]"
            data-tone={t.tone}
          >
            <span className="proto-toast-icon">
              {t.tone === "pos" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
            </span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

      {/* ── prototype switcher (hidden in prod) ── */}
      {process.env.NODE_ENV !== "production" && (
        <div
          className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-2 py-1.5 text-white shadow-2xl"
          dir="ltr"
        >
          <button onClick={() => cycle(-1)} className="rounded-full p-1.5 hover:bg-white/15">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="px-2 text-center text-xs leading-tight">
            <div className="font-semibold">
              {current.key} — {current.name}
            </div>
            <div className="text-[10px] text-white/50">{current.blurb}</div>
          </div>
          <button onClick={() => cycle(1)} className="rounded-full p-1.5 hover:bg-white/15">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="mx-1 h-6 w-px bg-white/20" />
          <button
            onClick={() => setMode((m) => (m === "light" ? "dark" : "light"))}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs hover:bg-white/15"
          >
            {mode === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {mode === "light" ? "בהיר" : "כהה"}
          </button>
        </div>
      )}
    </div>
  );
}
