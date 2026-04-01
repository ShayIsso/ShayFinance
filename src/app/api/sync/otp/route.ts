import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { submitOtp } from "@/lib/sync";
import { formatZodError } from "@/lib/api-utils";

const otpSchema = z.object({ code: z.string().min(1, "קוד חובה") });

export async function POST(req: NextRequest) {
  try {
    const { code } = otpSchema.parse(await req.json());
    const accepted = submitOtp(code);
    if (!accepted) {
      return NextResponse.json({ error: "No active OTP request" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
