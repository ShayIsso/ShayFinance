import { NextResponse } from "next/server";
import { getScreenshot } from "@/lib/screenshots";

export async function GET(_req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  const buffer = getScreenshot(filename);
  if (!buffer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "image/png" },
  });
}
