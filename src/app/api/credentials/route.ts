import { NextResponse } from "next/server";
import { listCredentials } from "@/lib/credentials";

// Credential mutations moved to Server Actions (src/app/actions/credentials.ts);
// this route serves only the settings-page list.
export async function GET() {
  try {
    const list = await listCredentials();
    return NextResponse.json(list);
  } catch {
    return NextResponse.json({ error: "Failed to list credentials" }, { status: 500 });
  }
}
