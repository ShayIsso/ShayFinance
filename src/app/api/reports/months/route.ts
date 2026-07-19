import { NextResponse } from "next/server";
import { getReportMonths } from "@/lib/reports";

export async function GET() {
  const months = await getReportMonths();
  return NextResponse.json(months);
}
