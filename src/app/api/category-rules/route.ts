import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getRules, createRule } from "@/lib/categories/rules";
import { createRuleSchema } from "@/lib/categories/schemas";
import { formatZodError } from "@/lib/api-utils";

export async function GET() {
  const data = await getRules();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const body = createRuleSchema.parse(await request.json());
    const id = await createRule(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
