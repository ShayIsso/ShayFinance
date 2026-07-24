"use client";

import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrendsMonthPoint } from "@/lib/reports";

export type TrendMiniChartProps = {
  /** Chronological month points from `/api/reports/trends` (12-month default). */
  months: TrendsMonthPoint[];
};

/**
 * A′ trend widget — a compact 12-month net-savings mirror of the דוחות trends
 * page, deliberately at-a-glance only (#108: full trend analysis stays on
 * דוחות). Slot scaffold only (#204); the bars are #208.
 */
export function TrendMiniChart({ months }: TrendMiniChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="text-muted-foreground size-4" strokeWidth={1.5} />
          מגמת חיסכון נטו · 12 חודשים
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          {months.length > 0 ? "בבנייה" : "אין נתונים היסטוריים"}
        </p>
      </CardContent>
    </Card>
  );
}
