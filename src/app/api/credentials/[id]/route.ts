import { NextRequest, NextResponse } from "next/server";
import { getDecryptedCredentials } from "@/lib/credentials";

type Params = { params: Promise<{ id: string }> };

// Credential mutations moved to Server Actions (src/app/actions/credentials.ts);
// this route serves only the edit form's non-password prefill.
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
