import { NextResponse } from "next/server";
import { cleanup } from "@/lib/screenshots";

export async function POST() {
  return NextResponse.json(cleanup());
}
