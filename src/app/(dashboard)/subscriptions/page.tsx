export const dynamic = "force-dynamic";

import { db } from "@/db";
import { recurringExpenses } from "@/db/schema";
import { ne } from "drizzle-orm";
import { SubscriptionsTable } from "./subscriptions-table";
import {
  detectPriceChanges,
  detectMissedPayments,
  detectNewlyDetected,
  drizzleRecurringStore,
} from "@/lib/recurring-detection";
import type {
  PersistedRecurringPattern,
  PriceChangeAlert,
  MissedPaymentAlert,
  NewlyDetectedAlert,
} from "@/lib/recurring-detection";
import { getCategories } from "@/lib/categories";
import type { Category } from "@/lib/categories";

export type SubscriptionRow = {
  id: string;
  merchant: string;
  displayName: string | null;
  expectedAmount: number;
  cadence: "monthly" | "quarterly" | "annual";
  nextExpectedDate: string;
  status: "active" | "paused" | "canceled";
  confirmedAt: Date | null;
  patternFingerprint: string;
  lastMatchedTxnId: string | null;
};

export type AnomalyAlerts = {
  priceChanges: PriceChangeAlert[];
  missedPayments: MissedPaymentAlert[];
  newlyDetected: NewlyDetectedAlert[];
};

export default async function SubscriptionsPage() {
  const rows = await db
    .select({
      id: recurringExpenses.id,
      merchant: recurringExpenses.merchant,
      displayName: recurringExpenses.displayName,
      expectedAmount: recurringExpenses.expectedAmount,
      cadence: recurringExpenses.expectedCadence,
      nextExpectedDate: recurringExpenses.nextExpectedDate,
      status: recurringExpenses.status,
      confirmedAt: recurringExpenses.confirmedAt,
      patternFingerprint: recurringExpenses.patternFingerprint,
      lastMatchedTxnId: recurringExpenses.lastMatchedTxnId,
    })
    .from(recurringExpenses)
    .where(ne(recurringExpenses.status, "canceled"));

  const subscriptions: SubscriptionRow[] = rows.map((row) => ({
    id: row.id,
    merchant: row.merchant,
    displayName: row.displayName ?? null,
    expectedAmount: Number(row.expectedAmount),
    cadence: row.cadence as "monthly" | "quarterly" | "annual",
    nextExpectedDate: row.nextExpectedDate,
    status: row.status as "active" | "paused" | "canceled",
    confirmedAt: row.confirmedAt ?? null,
    patternFingerprint: row.patternFingerprint,
    lastMatchedTxnId: row.lastMatchedTxnId ?? null,
  }));

  // Build PersistedRecurringPattern[] for anomaly detectors.
  // occurrenceDates is not a DB column — supply [] (detectors don't read it).
  const patterns: PersistedRecurringPattern[] = subscriptions.map((sub) => ({
    id: sub.id,
    merchant: sub.merchant,
    displayName: sub.displayName,
    expectedAmount: sub.expectedAmount,
    cadence: sub.cadence,
    occurrenceDates: [],
    lastMatchedTxnId: sub.lastMatchedTxnId ?? "",
    patternFingerprint: sub.patternFingerprint,
    nextExpectedDate: new Date(sub.nextExpectedDate),
    status: sub.status,
    confirmedAt: sub.confirmedAt,
  }));

  // Fetch recent transactions for detectPriceChanges.
  const recentTxns = await drizzleRecurringStore.getTransactionsForDetection();

  // Run detectors server-side; pass today once so pure functions stay pure.
  const today = new Date();
  const priceChanges = detectPriceChanges(patterns, recentTxns);
  const missedPayments = detectMissedPayments(patterns, today);
  const newlyDetected = detectNewlyDetected(patterns, recentTxns);

  const alerts: AnomalyAlerts = { priceChanges, missedPayments, newlyDetected };

  // Fetch categories for the naming dialog's optional category dropdown.
  const categories: Category[] = await getCategories();

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
