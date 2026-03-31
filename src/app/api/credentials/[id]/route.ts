import { NextRequest, NextResponse } from "next/server";
import {
  getDecryptedCredentials,
  updateCredential,
  removeCredential,
} from "@/lib/credentials";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const { bankType, credentials } = await getDecryptedCredentials(id);
    // Return only non-password fields for pre-filling the edit form
    const safeFields: Record<string, string> = {};
    if (bankType === "discount") {
      safeFields.id = credentials.id;
      safeFields.num = credentials.num;
    } else {
      safeFields.username = credentials.username;
    }
    return NextResponse.json({ bankType, safeFields });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const body = await req.json();
    const { displayName, credentials } = body;

    if (displayName === undefined && credentials === undefined) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await updateCredential(id, {
      displayName,
      rawCredentials: credentials,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update credential";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await removeCredential(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 });
  }
}
