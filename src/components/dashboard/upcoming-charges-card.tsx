"use client";

import * as React from "react";
import { Repeat, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";

export type UpcomingCharge = {
  id: string;
  merchant: string;
  expectedAmount: number;
  cadence: "monthly" | "quarterly" | "annual";
  nextExpectedDate: string;
};

const CADENCE_LABELS: Record<UpcomingCharge["cadence"], string> = {
  monthly: "חודשי",
  quarterly: "רבעוני",
  annual: "שנתי",
};

// Dates formatted client-side to avoid hydration mismatch (CLAUDE.md rule)

function formatUpcomingDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(year, month - 1, day));
}

/**
 * A′ upcoming-recurring widget — the forward half of the Recent | Upcoming
 * past/future split. Still fed by today's `/api/recurring-upcoming`; the real
 * forecast is gated on the recurring detection-quality fix (#192) and swapped
 * in by #209, which owns this file from here.
 */
export function UpcomingChargesCard({
  charges,
  total,
}: {
  charges: UpcomingCharge[];
  total: number;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="text-muted-foreground h-4 w-4" strokeWidth={1.5} />
            <CardTitle className="text-base font-semibold">חיובים קרובים</CardTitle>
          </div>
          {charges.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-xs">7 ימים הקרובים</span>
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
          <p className="text-muted-foreground text-sm">אין חיובים חוזרים צפויים בשבוע הקרוב</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                {charges.length} חיוב{charges.length !== 1 ? "ים" : ""} צפוי
                {charges.length !== 1 ? "ים" : ""}
              </span>
              <button
                onClick={() => setExpanded((e) => !e)}
                className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-xs"
                aria-expanded={expanded}
              >
                {expanded ? (
                  <>
                    הסתר
                    <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </>
                ) : (
                  <>
                    הצג פירוט
                    <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </>
                )}
              </button>
            </div>
            {expanded && (
              <div className="divide-y rounded-md border">
                {charges.map((charge) => (
                  <div key={charge.id} className="flex items-center justify-between px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{charge.merchant}</p>
                      <p className="text-muted-foreground text-xs">
                        {CADENCE_LABELS[charge.cadence]} &middot;{" "}
                        {formatUpcomingDate(charge.nextExpectedDate)}
                      </p>
                    </div>
                    <Amount
                      amount={charge.expectedAmount}
                      currency="ILS"
                      colorize={false}
                      className="text-sm tabular-nums"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
