"use client";

/*
 * PROTOTYPE — design-system direction (#109). THROWAWAY, not production.
 *
 * Wraps the REAL (dashboard) layout so the actual widgets (goals, budgets,
 * KPIs, tables — everything Shay already has) re-skin under each token
 * direction. This is the honest test: same widgets, same layout, same font
 * family — only the token layer changes. Includes an "מקורי" (Original) state
 * that applies no tokens, so it's a true A/B against today's design.
 *
 * Dev-only: in production it renders children untouched.
 */

import * as React from "react";
import { ChevronLeft, ChevronRight, Sun, Moon, Play } from "lucide-react";

import "./prototype-tokens.css";

type Dir = "off" | "F" | "A" | "B" | "C";
type Mode = "light" | "dark";

const DIRS: { key: Dir; name: string; blurb: string }[] = [
  { key: "off", name: "מקורי", blurb: "today's design — no tokens applied" },
  { key: "F", name: "מומלץ", blurb: "neutral zinc · subtle depth · unified dark · gentle rise" },
  { key: "A", name: "שקט", blurb: "warm ledger · borderless · airy · gentle" },
  { key: "B", name: "מכשור", blurb: "cool slate · dense · hairline rings · snappy" },
  { key: "C", name: "עומק רך", blurb: "zinc · soft shadow · rounded · scale-in" },
];

export function ProtoScope({ children }: { children: React.ReactNode }) {
  const isDev = process.env.NODE_ENV !== "production";
  const [dir, setDir] = React.useState<Dir>("F");
  const [mode, setMode] = React.useState<Mode>("light");
  const [replayKey, setReplayKey] = React.useState(0);

  // Read persisted choice once on mount. Persistence happens in the handlers
  // below, NOT in an effect — a mount-time write effect clobbers the stored
  // value with the initial default before this read can apply it.
  React.useEffect(() => {
    const d = localStorage.getItem("proto-dir");
    const m = localStorage.getItem("proto-mode");
    if (d === "F" || d === "A" || d === "B" || d === "C" || d === "off") setDir(d);
    if (m === "light" || m === "dark") setMode(m);
  }, []);

  const cycle = React.useCallback((step: 1 | -1) => {
    setDir((cur) => {
      const i = DIRS.findIndex((d) => d.key === cur);
      const next = DIRS[(i + step + DIRS.length) % DIRS.length].key;
      localStorage.setItem("proto-dir", next);
      return next;
    });
  }, []);

  const toggleMode = React.useCallback(() => {
    setMode((m) => {
      const next = m === "light" ? "dark" : "light";
      localStorage.setItem("proto-mode", next);
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (!isDev) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (e.key === "ArrowLeft") cycle(1); // RTL: left = next
      if (e.key === "ArrowRight") cycle(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle, isDev]);

  if (!isDev) return <>{children}</>;

  const active = dir !== "off";
  const current = DIRS.find((d) => d.key === dir)!;

  return (
    <div
      {...(active ? { "data-proto": dir, "data-mode": mode } : {})}
      className={active ? "proto-shell" : undefined}
    >
      {/* keyed remount re-runs the CSS enter animations (motion replay) */}
      <div key={replayKey} className="contents">
        {children}
      </div>

      <div
        className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-2 py-1.5 text-white shadow-2xl"
        dir="ltr"
      >
        <button onClick={() => cycle(-1)} className="rounded-full p-1.5 hover:bg-white/15">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-[168px] px-2 text-center text-xs leading-tight">
          <div className="font-semibold">
            {current.key === "off" ? current.name : `${current.key} — ${current.name}`}
          </div>
          <div className="text-[10px] text-white/50">{current.blurb}</div>
        </div>
        <button onClick={() => cycle(1)} className="rounded-full p-1.5 hover:bg-white/15">
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="mx-1 h-6 w-px bg-white/20" />
        <button
          onClick={toggleMode}
          disabled={!active}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs hover:bg-white/15 disabled:opacity-30"
        >
          {mode === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {mode === "light" ? "בהיר" : "כהה"}
        </button>
        <button
          onClick={() => setReplayKey((k) => k + 1)}
          disabled={!active}
          title="הרץ תנועה מחדש"
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs hover:bg-white/15 disabled:opacity-30"
        >
          <Play className="h-4 w-4" />
          תנועה
        </button>
      </div>
    </div>
  );
}
