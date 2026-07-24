"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, AlertTriangle } from "lucide-react";
import type { SyncRunSummary } from "@/lib/sync/runs";

export type SyncFreshnessPillProps = {
  /** Last run per bank (`getLastRunPerBank`). Aggregate freshness only. */
  runs: SyncRunSummary[];
};

// Sync is on-demand only, never scheduled (CLAUDE.md "Scraper Execution"), so
// a gap of a day or two between manual runs is normal, not a problem — these
// thresholds separate "normal gap" from "the dashboard's numbers might be
// stale enough to double-check on /sync".
const FRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // same-day sync
const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000; // beyond a long weekend

export type SyncFreshnessLevel = "fresh" | "aging" | "stale" | "otp_skipped" | "error" | "never";

// Discriminated on level (not an optional `ageMs?`) so "never" — the one
// case with no run to measure — can't be read as if it had an age.
export type SyncFreshnessVerdict =
  | { level: "never" }
  | { level: Exclude<SyncFreshnessLevel, "never">; ageMs: number };

// Worst-first: an unrecoverable failure outranks a stale-but-succeeding bank,
// and "never synced" outranks everything (no data at all beats old data).
const LEVEL_SEVERITY: Record<SyncFreshnessLevel, number> = {
  fresh: 0,
  aging: 1,
  stale: 2,
  otp_skipped: 3,
  error: 4,
  never: 5,
};

function classifyRun(run: SyncRunSummary, nowMs: number): SyncFreshnessVerdict {
  const ageMs = nowMs - new Date(run.startedAt).getTime();

  if (run.status === "error") return { level: "error", ageMs };
  if (run.status === "otp_skipped") return { level: "otp_skipped", ageMs };
  if (ageMs <= FRESH_THRESHOLD_MS) return { level: "fresh", ageMs };
  if (ageMs <= STALE_THRESHOLD_MS) return { level: "aging", ageMs };
  return { level: "stale", ageMs };
}

/**
 * Aggregate freshness across every bank's last run — the *most stale* bank,
 * never an average, so one fresh account can't hide another's failed or
 * stale one (worst-case honesty over reassurance). Pure and clock-free: the
 * caller supplies `nowMs` so this is node-testable and never runs during SSR.
 */
export function classifySyncFreshness(runs: SyncRunSummary[], nowMs: number): SyncFreshnessVerdict {
  if (runs.length === 0) return { level: "never" };

  return runs
    .map((run) => classifyRun(run, nowMs))
    .reduce((worst, next) =>
      LEVEL_SEVERITY[next.level] > LEVEL_SEVERITY[worst.level] ? next : worst,
    );
}

/** True for any level the pill should flag with the amber attention fill. */
function needsAttention(level: SyncFreshnessLevel): boolean {
  return level === "stale" || level === "otp_skipped" || level === "error";
}

function formatRelativeAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / (60 * 1000));
  if (minutes < 1) return "לפני פחות מדקה";
  if (minutes < 60) return `לפני ${minutes} דקות`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}

function verdictText(verdict: SyncFreshnessVerdict): string {
  switch (verdict.level) {
    case "never":
      return "עדיין לא בוצע סנכרון";
    case "error":
      return "הסנכרון האחרון נכשל";
    case "otp_skipped":
      return "נדרש קוד אימות לסנכרון";
    case "stale":
      return `סנכרון מיושן · ${formatRelativeAge(verdict.ageMs)}`;
    case "fresh":
    case "aging":
      return `עודכן ${formatRelativeAge(verdict.ageMs)}`;
  }
}

/**
 * A′ header sync pill — aggregate staleness at a glance, per-account detail
 * on /sync, which it links to.
 *
 * SSR always renders the neutral no-age form: `nowMs` only exists once a
 * mount effect sets it, so the classification (and the `new Date()` reads
 * inside it) never runs during server rendering or the hydration pass —
 * reintroducing a clock read in the render path is exactly bug #193.
 */
export function SyncFreshnessPill({ runs }: SyncFreshnessPillProps) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount flag so SSR/hydration render a clock-free placeholder (bug #193's pattern); see dashboard-panel.tsx's analogous post-mount state seed
    setNowMs(Date.now());
  }, []);

  if (nowMs === null) {
    return (
      <span
        data-testid="sync-freshness-pill"
        className="border-border text-muted-foreground flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs"
      >
        <RefreshCw className="size-3.5 shrink-0" strokeWidth={1.5} />
        רעננות סנכרון
      </span>
    );
  }

  const verdict = classifySyncFreshness(runs, nowMs);
  const attention = needsAttention(verdict.level);

  return (
    <Link
      href="/sync"
      data-testid="sync-freshness-pill"
      className={[
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
        attention
          ? "bg-warning text-warning-foreground border-transparent hover:opacity-90"
          : "border-border text-muted-foreground hover:bg-muted",
      ].join(" ")}
    >
      {attention ? (
        <AlertTriangle className="size-3.5 shrink-0" strokeWidth={1.5} />
      ) : (
        <RefreshCw className="size-3.5 shrink-0" strokeWidth={1.5} />
      )}
      {verdictText(verdict)}
    </Link>
  );
}
