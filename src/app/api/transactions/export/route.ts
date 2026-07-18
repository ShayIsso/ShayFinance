import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { transactionFiltersSchema } from "@/lib/transactions/schemas";
import { formatZodError } from "@/lib/api-utils";
import { exportTransactionsCsv } from "@/lib/reports";

/**
 * WYSIWYG CSV export (issue #163): parameterized by the exact same filter
 * schema as GET /api/transactions, but returns every matching row instead of
 * one page. Protected by the same session middleware as every API route.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = transactionFiltersSchema.parse(Object.fromEntries(searchParams));
    const { text, filename } = await exportTransactionsCsv(filters);
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
