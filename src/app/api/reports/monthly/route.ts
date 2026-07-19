import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { getMonthlyReport } from "@/lib/reports";
import { formatZodError } from "@/lib/api-utils";

const querySchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
  })
  // דוחות serves past months only (issue #168). Reject a month after the
  // current calendar month rather than silently returning an in-progress or
  // empty future report.
  .refine(
    ({ year, month }) => {
      const now = new Date();
      return year * 12 + month <= now.getFullYear() * 12 + (now.getMonth() + 1);
    },
    { message: "month must not be in the future" },
  );

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { year, month } = querySchema.parse(Object.fromEntries(searchParams));
    const data = await getMonthlyReport(year, month);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
