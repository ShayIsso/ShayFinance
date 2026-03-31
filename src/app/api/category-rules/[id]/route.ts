import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { updateRule, deleteRule } from "@/lib/categories/rules";
import { updateRuleSchema } from "@/lib/categories/schemas";
import { formatZodError } from "@/lib/api-utils";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = updateRuleSchema.parse(await request.json());
    await updateRule(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteRule(id);
  return NextResponse.json({ ok: true });
}
