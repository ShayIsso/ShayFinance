import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getTransactions } from "@/lib/transactions";
import { transactionFiltersSchema } from "@/lib/transactions/schemas";
import { formatZodError } from "@/lib/api-utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = transactionFiltersSchema.parse(Object.fromEntries(searchParams));
    const data = await getTransactions(filters);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
