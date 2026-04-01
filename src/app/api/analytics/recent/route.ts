import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { getRecentTransactions } from "@/lib/analytics";
import { formatZodError } from "@/lib/api-utils";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(15),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { limit } = querySchema.parse(Object.fromEntries(searchParams));
    const data = await getRecentTransactions(limit);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
