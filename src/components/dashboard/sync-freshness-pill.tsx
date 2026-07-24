"use client";

import { RefreshCw } from "lucide-react";
import type { SyncRunSummary } from "@/lib/sync/runs";

export type SyncFreshnessPillProps = {
  /** Last run per bank (`getLastRunPerBank`). Aggregate freshness only. */
  runs: SyncRunSummary[];
};

/**
 * A′ header sync pill — aggregate staleness at a glance, per-account detail on
 * /sync. Slot scaffold only (#204); #207 builds the staleness verdict and takes
 * over removing `LastSyncStrip` from the dashboard.
 *
 * A stale sync must say it is stale (amber); a fresh one stays neutral — never
 * emerald, which is reserved for positive money (#108 gate adjudication).
 */
export function SyncFreshnessPill({ runs }: SyncFreshnessPillProps) {
  if (runs.length === 0) return null;

  return (
    <span className="border-border text-muted-foreground flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs">
      <RefreshCw className="size-3.5 shrink-0" strokeWidth={1.5} />
      רעננות סנכרון
    </span>
  );
}
