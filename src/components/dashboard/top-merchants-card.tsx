"use client";

import { Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
 * A′ top-merchants widget — ranked month spend, deliberately demoted to the
 * bottom band (#108: goals outrank it). Slot scaffold only (#204); the ranked
 * rows are #208.
 */
export function TopMerchantsCard({ merchants }: TopMerchantsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Store className="text-muted-foreground size-4" strokeWidth={1.5} />
          בתי עסק מובילים
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          {merchants.length > 0 ? "בבנייה" : "אין נתונים להצגה"}
        </p>
      </CardContent>
    </Card>
  );
}
