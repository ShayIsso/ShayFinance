import { NextResponse } from "next/server";
import { listScreenshots } from "@/lib/screenshots";

export async function GET() {
  return NextResponse.json(listScreenshots());
}
