import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { verifyPassword, createSession, SESSION_COOKIE } from "@/lib/auth";
import { formatZodError } from "@/lib/api-utils";

const loginSchema = z.object({ password: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const { password } = loginSchema.parse(await req.json());

    const valid = await verifyPassword(password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = createSession();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return res;
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: formatZodError(err) }, { status: 400 });
    }
    throw err;
  }
}
