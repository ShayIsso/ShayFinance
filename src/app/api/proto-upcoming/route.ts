import { NextResponse } from "next/server";
import { db } from "@/db";
import { recurringExpenses } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * THROWAWAY PROTOTYPE endpoint (#108 gate) — demonstrates the "upcoming
 * recurring" widget as it WOULD behave once the next-date roll-forward bug is
 * fixed. The production /api/recurring-upcoming filters on the stored
 * next_expected_date, which is stamped once at detection and never advanced, so
 * monthly items fall out of the window permanently. Here we roll each active
 * item's date forward to its next occurrence >= today and use a 30-day window,
 * so the real lineup (gym, spotify, partner, chatgpt, כללית …) actually shows.
 * Not for production; the real fix belongs in the recurring-detection module.
 */
function rollForward(iso: string, cadence: string, today: Date): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const step =
    cadence === "annual"
      ? { y: 1, m: 0 }
      : cadence === "quarterly"
        ? { y: 0, m: 3 }
        : { y: 0, m: 1 };
  let guard = 0;
  while (dt.getTime() < today.getTime() && guard++ < 240) {
    dt.setUTCFullYear(dt.getUTCFullYear() + step.y);
    dt.setUTCMonth(dt.getUTCMonth() + step.m);
  }
  return dt;
}

export async function GET() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + 30);

  const rows = await db
    .select({
      id: recurringExpenses.id,
      merchant: recurringExpenses.merchant,
      expectedAmount: recurringExpenses.expectedAmount,
      expectedCadence: recurringExpenses.expectedCadence,
      nextExpectedDate: recurringExpenses.nextExpectedDate,
    })
    .from(recurringExpenses)
    .where(eq(recurringExpenses.status, "active"));

  const upcoming = rows
    .map((r) => {
      const next = rollForward(r.nextExpectedDate, r.expectedCadence, today);
      return {
        id: r.id,
        merchant: r.merchant,
        expectedAmount: Number(r.expectedAmount),
        cadence: r.expectedCadence as "monthly" | "quarterly" | "annual",
        nextExpectedDate: next.toISOString().slice(0, 10),
        _t: next.getTime(),
      };
    })
    .filter((r) => r._t <= horizon.getTime())
    .sort((a, b) => a._t - b._t)
    .map(({ _t, ...rest }) => rest);

  const total = upcoming.reduce((sum, r) => sum + r.expectedAmount, 0);
  return NextResponse.json({ upcoming, total });
}
