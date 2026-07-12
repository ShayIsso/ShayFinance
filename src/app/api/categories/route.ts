import { NextResponse } from "next/server";
import { getCategories } from "@/lib/categories";

// Mutations (create/update/delete) live in Server Actions:
// src/app/actions/categories.ts (FND2 — shared RHF+Zod form layer).

export async function GET() {
  const data = await getCategories();
  return NextResponse.json(data);
}
