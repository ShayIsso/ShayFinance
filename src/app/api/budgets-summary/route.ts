import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { getBudgetStatuses, getMonthlyTargets, getSavingsTargetStatus } from "@/lib/budgets";
import { formatZodError } from "@/lib/api-utils";

const querySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

// A distinct name from any Settings CRUD collection route (e.g. a future
// /api/budgets) — this is a read-only, month-scoped dashboard view composing
// three budgets-module reads, not the budgets resource itself.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { year, month } = querySchema.parse(Object.fromEntries(searchParams));
    const [budgets, monthlyTargets, savingsTarget] = await Promise.all([
      getBudgetStatuses(year, month),
      getMonthlyTargets(),
      getSavingsTargetStatus(year, month),
    ]);
    return NextResponse.json({ budgets, monthlyTargets, savingsTarget });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
