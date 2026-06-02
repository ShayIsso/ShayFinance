"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { recurringExpenses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { formatZodError } from "@/lib/api-utils";

// ── Schema ────────────────────────────────────────────────────────────────────

const cancelSchema = z.object({
  id: z.string().uuid({ message: "מזהה מנוי לא תקין" }),
});

// ── Actions ───────────────────────────────────────────────────────────────────

export async function cancelRecurringAction(data: unknown): Promise<{ error?: string }> {
  const parsed = cancelSchema.safeParse(data);
  if (!parsed.success) return { error: formatZodError(parsed.error) };

  await db
    .update(recurringExpenses)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(recurringExpenses.id, parsed.data.id));

  revalidatePath("/subscriptions");
  return {};
}
