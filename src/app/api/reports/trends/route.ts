import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { getTrendsReport } from "@/lib/reports";
import { formatZodError } from "@/lib/api-utils";

// Configurable range, 12-month default (decision record #107). Bounded so a
// stray query can't ask the range read for an unbounded span.
const querySchema = z.object({
  range: z.coerce.number().int().min(1).max(36).default(12),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { range } = querySchema.parse(Object.fromEntries(searchParams));
    const data = await getTrendsReport(range);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
