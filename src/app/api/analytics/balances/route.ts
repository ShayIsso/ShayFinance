import { NextResponse } from "next/server";
import { getAccountBalances } from "@/lib/analytics";

export async function GET() {
  const data = await getAccountBalances();
  return NextResponse.json(data);
}
