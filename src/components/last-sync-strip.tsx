"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SyncRunSummary } from "@/lib/sync/runs";

const BANK_LABELS: Record<string, string> = {
  discount: "דיסקונט",
  max: "מקס",
  visaCal: "ויזה כאל",
};

/** Returns a Hebrew relative-time string. All formatting happens client-side. */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "לפני פחות מדקה";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `לפני ${diffMin} דקות`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `לפני ${diffHour} שעות`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return "אתמול";
  if (diffDay < 30) return `לפני ${diffDay} ימים`;

  return date.toLocaleDateString("he-IL", { day: "numeric", month: "long" });
}

type RunRowProps = {
  run: SyncRunSummary;
};

function RunRow({ run }: RunRowProps) {
  const router = useRouter();
  const isClickable = run.status === "error" || run.status === "otp_skipped";

  function handleClick() {
    if (isClickable) {
      router.push(`/sync?bank=${run.bank}`);
    }
  }

  const relativeTime = run.startedAt ? formatRelativeTime(new Date(run.startedAt)) : null;

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
      className={[
        "flex items-center justify-between gap-3 px-4 py-3",
        isClickable
          ? "cursor-pointer transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:outline-none"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Status icon */}
      <span className="shrink-0">
        {run.status === "success" && (
          <Check
            className="h-4 w-4 text-emerald-600"
            strokeWidth={1.5}
            aria-label="הסנכרון הצליח"
          />
        )}
        {run.status === "otp_skipped" && (
          <Lock
            className="h-4 w-4 text-amber-500"
            strokeWidth={1.5}
            aria-label="קוד אימות לא הוזן"
          />
        )}
        {run.status === "error" && (
          <AlertTriangle
            className="h-4 w-4 text-red-600"
            strokeWidth={1.5}
            aria-label="שגיאה בסנכרון"
          />
        )}
      </span>

      {/* Bank name */}
      <span className="min-w-0 flex-1 text-sm font-medium">
        {BANK_LABELS[run.bank] ?? run.bank}
      </span>

      {/* Transaction count */}
      {run.status === "success" && (
        <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
          {run.transactionsImported} תנועות
        </span>
      )}

      {/* Relative time */}
      {relativeTime && (
        <span
          className={[
            "shrink-0 text-xs",
            run.status === "error"
              ? "text-red-500"
              : run.status === "otp_skipped"
                ? "text-amber-500"
                : "text-zinc-400",
          ].join(" ")}
        >
          {relativeTime}
        </span>
      )}

      {/* Click-through hint for actionable rows */}
      {isClickable && (
        <span className="shrink-0 text-xs text-zinc-400" aria-hidden>
          &#x2190;
        </span>
      )}
    </div>
  );
}

type LastSyncStripProps = {
  runs: SyncRunSummary[];
};

export function LastSyncStrip({ runs }: LastSyncStripProps) {
  if (runs.length === 0) return null;

  return (
    <Card className="rounded-xl border border-zinc-200">
      <CardHeader className="pt-4 pb-2">
        <CardTitle className="text-sm font-medium text-zinc-500">סנכרון אחרון</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-zinc-100 p-0 pb-1">
        {runs.map((run) => (
          <RunRow key={run.id} run={run} />
        ))}
      </CardContent>
    </Card>
  );
}
