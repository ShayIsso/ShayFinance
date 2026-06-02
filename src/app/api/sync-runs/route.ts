import { NextResponse } from "next/server";
import { getLastRunPerBank, drizzleSyncRunStore } from "@/lib/sync/runs";

export async function GET() {
  const runs = await getLastRunPerBank(drizzleSyncRunStore);
  return NextResponse.json(runs);
}
