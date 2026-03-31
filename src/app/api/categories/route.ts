import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCategories, createCategory } from "@/lib/categories";
import { createCategorySchema } from "@/lib/categories/schemas";
import { formatZodError } from "@/lib/api-utils";

export async function GET() {
  const data = await getCategories();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const body = createCategorySchema.parse(await request.json());
    const id = await createCategory(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
