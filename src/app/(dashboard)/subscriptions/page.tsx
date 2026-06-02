export const dynamic = "force-dynamic";

import { db } from "@/db";
import { recurringExpenses } from "@/db/schema";
import { ne } from "drizzle-orm";
import { SubscriptionsTable } from "./subscriptions-table";

export type SubscriptionRow = {
  id: string;
  merchant: string;
  expectedAmount: number;
  cadence: "monthly" | "quarterly" | "annual";
  nextExpectedDate: string;
  status: "active" | "paused" | "canceled";
};

export default async function SubscriptionsPage() {
  const rows = await db
    .select({
      id: recurringExpenses.id,
      merchant: recurringExpenses.merchant,
      expectedAmount: recurringExpenses.expectedAmount,
      cadence: recurringExpenses.expectedCadence,
      nextExpectedDate: recurringExpenses.nextExpectedDate,
      status: recurringExpenses.status,
    })
    .from(recurringExpenses)
    .where(ne(recurringExpenses.status, "canceled"));

  const subscriptions: SubscriptionRow[] = rows.map((row) => ({
    id: row.id,
    merchant: row.merchant,
    expectedAmount: Number(row.expectedAmount),
    cadence: row.cadence as "monthly" | "quarterly" | "annual",
    nextExpectedDate: row.nextExpectedDate,
    status: row.status as "active" | "paused" | "canceled",
  }));

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">מנויים והוצאות חוזרות</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          הוצאות שזוהו כחוזרות על בסיס היסטוריית העסקאות שלך
        </p>
      </div>
      <SubscriptionsTable subscriptions={subscriptions} />
    </div>
  );
}
