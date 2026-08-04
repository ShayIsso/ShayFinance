import { NextResponse } from "next/server";
import { drizzleRecurringStore, projectUpcomingCharges } from "@/lib/recurring-detection";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The upcoming-charges forecast, derived from liveness evidence (ADR-0012).
 * No date-window query: which series are live and when they next charge is a
 * property of their transactions, not of the stored `next_expected_date`.
 */
export async function GET() {
  const [patterns, recentTxns] = await Promise.all([
    drizzleRecurringStore.getPersistedPatterns(),
    drizzleRecurringStore.getTransactionsForDetection(),
  ]);

  const { upcoming, total } = projectUpcomingCharges(patterns, recentTxns, new Date());

  return NextResponse.json({
    upcoming: upcoming.map((charge) => ({
      id: charge.patternId,
      merchant: charge.merchant,
      displayName: charge.displayName,
      expectedAmount: charge.expectedAmount,
      cadence: charge.cadence,
      projectedDate: toIsoDate(charge.projectedDate),
    })),
    total,
  });
}
