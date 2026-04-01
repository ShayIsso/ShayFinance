import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { updateTransaction } from "@/lib/transactions";
import { updateTransactionSchema } from "@/lib/transactions/schemas";
import { formatZodError } from "@/lib/api-utils";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = updateTransactionSchema.parse(await request.json());
    await updateTransaction(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
