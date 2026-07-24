"use client";

import Link from "next/link";
import { AlertTriangle, Bot, Inbox, Tag, type LucideIcon } from "lucide-react";

/**
 * The four attention scalars served by `/api/attention-counts` (#196). Declared
 * here because this component is their only consumer — the route composes them
 * from four different modules and has no shared response type of its own.
 */
export type AttentionCounts = {
  uncategorized: number;
  needsReview: number;
  anomalies: number;
  reviewQueue: number;
};

export type AttentionCountersProps = {
  /** Null when the counts fetch failed — this row blanks, the page does not. */
  counts: AttentionCounts | null;
};

type AttentionCounterDef = {
  key: keyof AttentionCounts;
  label: string;
  href: string;
  icon: LucideIcon;
};

// Every href below was checked against the real target, not guessed — the
// #108 prototype's `?uncategorized=1` link never actually filtered anything.
//  - uncategorized/needsReview run through `transactionFiltersSchema`
//    (src/lib/transactions/schemas.ts), which reads exactly `uncategorized=true`
//    / `needsReview=true`; matched here verbatim.
//  - anomalies/reviewQueue take no query param — /subscriptions and
//    /reconciliation each compute their full alert/inbox state on every load,
//    so landing on the page is the filter.
const COUNTER_DEFS: AttentionCounterDef[] = [
  {
    key: "uncategorized",
    label: "ללא סיווג",
    href: "/transactions?uncategorized=true",
    icon: Tag,
  },
  {
    key: "needsReview",
    label: "ממתין לסקירת AI",
    href: "/transactions?needsReview=true",
    icon: Bot,
  },
  {
    key: "anomalies",
    label: "חריגות במנויים",
    href: "/subscriptions",
    icon: AlertTriangle,
  },
  {
    key: "reviewQueue",
    label: "התאמות ממתינות",
    href: "/reconciliation",
    icon: Inbox,
  },
];

export type VisibleAttentionCounter = AttentionCounterDef & { count: number };

/**
 * Which counters render, and in what order — the row's entire "what needs my
 * attention" logic lives here, not in JSX. A zero counter is omitted: that
 * queue is empty, and showing "0" would flag it as needing attention when
 * nothing does. Counts are real and uncapped by design (never "9+").
 */
export function getVisibleAttentionCounters(counts: AttentionCounts): VisibleAttentionCounter[] {
  return COUNTER_DEFS.map((def) => ({ ...def, count: counts[def.key] })).filter(
    (item) => item.count > 0,
  );
}

/**
 * A′ attention row — compact triage counters (ללא סיווג · ממתין לסקירת AI ·
 * חריגות · התאמות ממתינות). Slot scaffold from #204; counter tiles + deep
 * links land here (#206). Subsumes the dashboard's old amber reconciliation
 * strip — `reviewQueue` is the same `getPendingGroupCount()` number, now
 * carried here instead of duplicated in a second widget.
 */
export function AttentionCounters({ counts }: AttentionCountersProps) {
  const visible = counts ? getVisibleAttentionCounters(counts) : [];

  return (
    <div className="border-border rounded-lg border px-4 py-3">
      <p className="text-sm font-medium">דורש טיפול</p>
      {counts === null ? (
        <p className="text-muted-foreground mt-0.5 text-sm">לא ניתן לטעון את מדדי הטיפול</p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground mt-0.5 text-sm">הכל מטופל, אין פריטים הממתינים</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {visible.map(({ key, label, href, icon: Icon, count }) => (
            <Link
              key={key}
              href={href}
              className="bg-warning text-warning-foreground press flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-opacity hover:opacity-90"
            >
              <Icon className="size-3.5" strokeWidth={1.5} />
              <span>{label}</span>
              <span className="font-semibold">{count}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
