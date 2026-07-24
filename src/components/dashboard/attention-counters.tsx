"use client";

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

/**
 * A′ attention row — compact triage counters (ללא סיווג · בתור לבדיקה · חריגות).
 * Slot scaffold only (#204); the counter tiles and their deep links are #206.
 */
export function AttentionCounters({ counts }: AttentionCountersProps) {
  return (
    <div className="border-border rounded-lg border px-4 py-3">
      <p className="text-sm font-medium">דורש טיפול</p>
      <p className="text-muted-foreground mt-0.5 text-sm">
        {counts ? "בבנייה" : "לא ניתן לטעון את מדדי הטיפול"}
      </p>
    </div>
  );
}
