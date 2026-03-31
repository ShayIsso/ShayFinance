import { NextRequest, NextResponse } from "next/server";
import { addCredential, listCredentials } from "@/lib/credentials";

export async function GET() {
  try {
    const list = await listCredentials();
    return NextResponse.json(list);
  } catch {
    return NextResponse.json({ error: "Failed to list credentials" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bankType, displayName, credentials } = body;

    if (!bankType || !displayName || !credentials) {
      return NextResponse.json(
        { error: "bankType, displayName, and credentials are required" },
        { status: 400 },
      );
    }

    const id = await addCredential(bankType, displayName, credentials);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add credential";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
