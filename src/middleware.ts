import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "shayfinance-session";

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2);
  const view = new Uint8Array(buf);
  for (let i = 0; i < hex.length; i += 2) {
    view[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return buf;
}

async function validateSessionEdge(token: string): Promise<boolean> {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) return false;

  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return false;
  const data = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);
  if (!data || !sig) return false;

  try {
    const keyBuffer = hexToArrayBuffer(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const sigBytes = hexToArrayBuffer(sig);
    const dataBytes = new TextEncoder().encode(data);
    return await crypto.subtle.verify("HMAC", key, sigBytes, dataBytes);
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login page and auth API
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await validateSessionEdge(token))) {
    return NextResponse.next();
  }

  // API clients need a machine-readable failure, not a 200 HTML redirect to /login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
