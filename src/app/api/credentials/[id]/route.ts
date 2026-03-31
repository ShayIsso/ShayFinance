import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getDecryptedCredentials, updateCredential, removeCredential } from "@/lib/credentials";
import { formatZodError } from "@/lib/api-utils";

type Params = { params: Promise<{ id: string }> };

const updateCredentialSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    credentials: z.record(z.string(), z.string()).optional(),
  })
  .refine((data) => data.displayName !== undefined || data.credentials !== undefined, {
    message: "Nothing to update",
  });

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
    const body = updateCredentialSchema.parse(await req.json());
    await updateCredential(id, {
      displayName: body.displayName,
      rawCredentials: body.credentials,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
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
