"use client";

import * as React from "react";
import { Repeat } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import type { Cadence } from "@/lib/recurring-detection";

/** One `/api/recurring-upcoming` forecast entry — `projectUpcomingCharges`'s `ProjectedCharge`, over the wire. */
export type UpcomingCharge = {
  id: string;
  merchant: string;
  displayName: string | null;
  expectedAmount: number;
  cadence: Cadence;
  /** ISO date (yyyy-mm-dd). Evidence-derived; may be in the past (late-but-live, ADR-0012). */
  projectedDate: string;
};

const CADENCE_LABELS: Record<Cadence, string> = {
  monthly: "חודשי",
  quarterly: "רבעוני",
  annual: "שנתי",
};

/**
 * Matches the Recent side's row cap (dashboard-panel.tsx fetches
 * `/api/analytics/recent?limit=8`) so the past/future split reads as two
 * comparably-sized columns (#209 D4). The `total` prop is never capped — it
 * covers every live series in the horizon, not just the rendered rows.
 */
export const UPCOMING_DISPLAY_CAP = 8;

/** Exported for testing; also used by the card to derive the "+N more" note. */
export function capUpcomingCharges(
  charges: UpcomingCharge[],
  cap: number = UPCOMING_DISPLAY_CAP,
): UpcomingCharge[] {
  return charges.slice(0, cap);
}

/**
 * A projected date in the past means the series is late but still live
 * (silence under the death threshold), not a stale projection. Max lateness
 * is bounded by the death threshold itself (0.5x cadence beyond the
 * interval: ~15d monthly, ~183d annual) — an annual series can read months
 * "late" and still be perfectly healthy, which is exactly why a raw past
 * date would look like a bug (ADR-0012, #238 review finding F6).
 */
export function isLateButLive(projectedDateIso: string, todayIso: string): boolean {
  return projectedDateIso < todayIso;
}

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// Dates formatted client-side to avoid hydration mismatch (CLAUDE.md rule).
function formatProjectedDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(year, month - 1, day));
}

/** Singular/plural Hebrew, not suffix concatenation across two adjectives. */
export function formatMonthlyCountLabel(count: number): string {
  return count === 1 ? "חיוב קבוע אחד צפוי החודש" : `${count} חיובים קבועים צפויים החודש`;
}

function ChargeRow({ charge, isLate }: { charge: UpcomingCharge; isLate: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{charge.displayName ?? charge.merchant}</p>
        <p className="text-muted-foreground text-xs">
          {CADENCE_LABELS[charge.cadence]} &middot;{" "}
          {isLate ? "צפוי בכל יום" : formatProjectedDate(charge.projectedDate)}
        </p>
      </div>
      <Amount
        amount={charge.expectedAmount}
        colorize={false}
        fractionDigits={0}
        className="shrink-0 text-sm tabular-nums"
      />
    </div>
  );
}

/**
 * A′ upcoming-recurring widget — the forward half of the Recent | Upcoming
 * past/future split (#209). Renders the evidence-based forecast from
 * `/api/recurring-upcoming` verbatim: `total` is "fixed charges expected this
 * month" (31-day horizon, so every live monthly series appears once), and
 * `expectedAmount` per row is the API's rolling average — never a stored
 * `expectedAmount` read locally (ADR-0012 / #209 D4).
 */
export function UpcomingChargesCard({
  charges,
  total,
}: {
  charges: UpcomingCharge[];
  total: number;
}) {
  const today = todayIsoDate();
  const displayed = capUpcomingCharges(charges);
  const hiddenCount = charges.length - displayed.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="text-muted-foreground h-4 w-4" strokeWidth={1.5} />
            <CardTitle className="text-base font-semibold">חיובים קרובים</CardTitle>
          </div>
          {charges.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">החודש</span>
              <Amount
                amount={total}
                currency="ILS"
                colorize={false}
                className="text-sm font-semibold tabular-nums"
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {charges.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין חיובים חוזרים פעילים בחודש הקרוב</p>
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              {formatMonthlyCountLabel(charges.length)}
            </p>
            <div className="divide-y rounded-md border">
              {displayed.map((charge) => (
                <ChargeRow
                  key={charge.id}
                  charge={charge}
                  isLate={isLateButLive(charge.projectedDate, today)}
                />
              ))}
            </div>
            {hiddenCount > 0 && (
              <p className="text-muted-foreground text-xs">+{hiddenCount} נוספים</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
