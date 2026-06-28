import { NextResponse } from "next/server";
import { db } from "@/db";
import { recurringExpenses } from "@/db/schema";
import { eq, and, lte, gte } from "drizzle-orm";

export async function GET() {
  const today = new Date();
  // Normalize to midnight UTC to avoid time-of-day skew
  const todayStr = today.toISOString().slice(0, 10);

  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const sevenDaysStr = sevenDaysLater.toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: recurringExpenses.id,
      merchant: recurringExpenses.merchant,
      expectedAmount: recurringExpenses.expectedAmount,
      expectedCadence: recurringExpenses.expectedCadence,
      nextExpectedDate: recurringExpenses.nextExpectedDate,
    })
    .from(recurringExpenses)
    .where(
      and(
        eq(recurringExpenses.status, "active"),
        gte(recurringExpenses.nextExpectedDate, todayStr),
        lte(recurringExpenses.nextExpectedDate, sevenDaysStr),
      ),
    );

  const upcoming = rows.map((row) => ({
    id: row.id,
    merchant: row.merchant,
    expectedAmount: Number(row.expectedAmount),
    cadence: row.expectedCadence as "monthly" | "quarterly" | "annual",
    nextExpectedDate: row.nextExpectedDate,
  }));

  const total = upcoming.reduce((sum, r) => sum + r.expectedAmount, 0);

  return NextResponse.json({ upcoming, total });
}
