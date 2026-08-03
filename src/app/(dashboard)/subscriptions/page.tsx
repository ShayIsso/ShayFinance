export const dynamic = "force-dynamic";

import { SubscriptionsTable } from "./subscriptions-table";
import {
  detectPriceChanges,
  detectMissedPayments,
  detectNewlyDetected,
  detectDormant,
  drizzleRecurringStore,
  projectSeries,
} from "@/lib/recurring-detection";
import type {
  PriceChangeAlert,
  MissedPaymentAlert,
  NewlyDetectedAlert,
  DormantAlert,
} from "@/lib/recurring-detection";
import { getAssignableCategories } from "@/lib/categories";
import type { Category } from "@/lib/categories";

export type SubscriptionRow = {
  id: string;
  merchant: string;
  displayName: string | null;
  expectedAmount: number;
  cadence: "monthly" | "quarterly" | "annual";
  /**
   * Projected next charge (last observed charge + cadence interval), ISO date.
   * null when the series has no liveness evidence — the stored
   * `next_expected_date` is never displayed (ADR-0012).
   */
  projectedDate: string | null;
  status: "active" | "paused" | "canceled";
  confirmedAt: Date | null;
};

export type AnomalyAlerts = {
  priceChanges: PriceChangeAlert[];
  missedPayments: MissedPaymentAlert[];
  newlyDetected: NewlyDetectedAlert[];
  dormant: DormantAlert[];
};

export default async function SubscriptionsPage() {
  // One transaction read feeds every detector and the projection — the same
  // liveness evidence the upcoming forecast uses, so the two pages agree.
  const [patterns, recentTxns] = await Promise.all([
    drizzleRecurringStore.getPersistedPatterns(),
    drizzleRecurringStore.getTransactionsForDetection(),
  ]);

  // Run detectors server-side; pass today once so pure functions stay pure.
  const today = new Date();
  const projections = projectSeries(patterns, recentTxns, today);

  const subscriptions: SubscriptionRow[] = patterns.map((pattern, i) => {
    const { isLive, evidence } = projections[i];
    return {
      id: pattern.id,
      merchant: pattern.merchant,
      displayName: pattern.displayName,
      expectedAmount: pattern.expectedAmount,
      cadence: pattern.cadence,
      // A dead series gets no projected charge — projecting one is the #192 defect.
      projectedDate: isLive && evidence ? evidence.projectedDate.toISOString().slice(0, 10) : null,
      status: pattern.status,
      confirmedAt: pattern.confirmedAt,
    };
  });

  const priceChanges = detectPriceChanges(patterns, recentTxns);
  const missedPayments = detectMissedPayments(patterns, recentTxns, today);
  const newlyDetected = detectNewlyDetected(patterns, recentTxns);
  const dormant = detectDormant(patterns, recentTxns, today);

  const alerts: AnomalyAlerts = { priceChanges, missedPayments, newlyDetected, dormant };

  // Fetch categories for the naming dialog's optional category dropdown —
  // assignable (leaf) only (ADR-0011 §3): a group is never a valid assignment.
  const categories: Category[] = await getAssignableCategories();

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">מנויים והוצאות חוזרות</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          הוצאות שזוהו כחוזרות על בסיס היסטוריית העסקאות שלך
        </p>
      </div>
      <SubscriptionsTable subscriptions={subscriptions} alerts={alerts} categories={categories} />
    </div>
  );
}
