import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { bulkCategorize } from "@/lib/transactions";
import { bulkCategorizeSchema } from "@/lib/transactions/schemas";
import { formatZodError } from "@/lib/api-utils";

export async function POST(request: Request) {
  try {
    const body = bulkCategorizeSchema.parse(await request.json());
    await bulkCategorize(body.transactionIds, body.categoryId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
