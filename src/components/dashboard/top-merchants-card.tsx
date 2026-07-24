"use client";

import * as React from "react";
import { Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Amount } from "@/components/ui/amount";
import type { TopMerchant } from "@/lib/analytics";

export type TopMerchantsCardProps = {
  /**
   * Whole-month expense aggregate from `/api/analytics/top-merchants`, already
   * excluding transfer/ignore types and card-settlement descriptors (#197) so
   * the card bill can never surface as the top merchant.
   */
  merchants: TopMerchant[];
};

/**
 * Proportion-bar fill percentages for the ranked rows, relative to the list's
 * own max. `computeTopMerchants` already sorts descending, so index 0 is the
 * max in practice — computed defensively rather than assumed, since this bar
 * fill is the one place that would silently misdraw if that ever changed.
 * Exported for node-only testing (repo vitest has no jsdom).
 */
export function computeMerchantBarPercents(merchants: TopMerchant[]): number[] {
  const max = Math.max(0, ...merchants.map((m) => m.amount));
  if (max <= 0) return merchants.map(() => 0);
  return merchants.map((m) => Math.max(0, Math.min(100, (m.amount / max) * 100)));
}

function MerchantRow({
  merchant,
  amount,
  percent,
}: {
  merchant: string;
  amount: number;
  percent: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-sm">{merchant}</span>
      <div className="bg-muted h-1.5 w-20 shrink-0 overflow-hidden rounded-full">
        <div className="bg-bar-strong h-full rounded-full" style={{ width: `${percent}%` }} />
      </div>
      {/* Neutral, not signed: these are positive expense magnitudes, and the
          category-breakdown rows this mirrors treat their amount column the
          same way — a per-row red here would just be noise (the card is
          expenses by definition). */}
      <Amount
        amount={amount}
        colorize={false}
        fractionDigits={0}
        className="w-20 shrink-0 text-left text-sm font-medium"
      />
    </div>
  );
}

/**
 * A′ top-merchants widget — ranked month spend, deliberately demoted to the
 * bottom band (#108: goals outrank it).
 */
export function TopMerchantsCard({ merchants }: TopMerchantsCardProps) {
  const percents = React.useMemo(() => computeMerchantBarPercents(merchants), [merchants]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Store className="text-muted-foreground size-4" strokeWidth={1.5} />
          בתי עסק מובילים
        </CardTitle>
      </CardHeader>
      <CardContent>
        {merchants.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין נתונים להצגה</p>
        ) : (
          <div className="space-y-2.5">
            {merchants.map((m, i) => (
              <MerchantRow
                key={`${m.merchant}-${i}`}
                merchant={m.merchant}
                amount={m.amount}
                percent={percents[i]}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
