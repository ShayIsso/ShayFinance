import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { addCredential, listCredentials } from "@/lib/credentials";
import { addCredentialSchema } from "@/lib/credentials/schemas";
import { formatZodError } from "@/lib/api-utils";

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
    const body = addCredentialSchema.parse(await req.json());
    const id = await addCredential(body.bankType, body.displayName, body.credentials);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Failed to add credential";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
