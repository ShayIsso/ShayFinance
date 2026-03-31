import { NextResponse } from "next/server";
import { getCategories, createCategory } from "@/lib/categories";

export async function GET() {
  const data = await getCategories();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, type, icon, color } = body;

  if (!name || !type || !icon || !color) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const id = await createCategory({ name, type, icon, color });
  return NextResponse.json({ id }, { status: 201 });
}
