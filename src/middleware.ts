import { NextRequest, NextResponse } from "next/server";
import { checkBootEnv } from "@/lib/env";

const SESSION_COOKIE = "shayfinance-session";
const ENV_DIAGNOSTIC_PATH = "/env-check";

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

  // Boot preflight (ADR-0014 §1), ahead of the login exemption because signing
  // in needs the very key that may be missing. This has to run here rather than
  // in the root layout: Next renders a page independently of whether its layout
  // renders `children`, so a layout-level guard still lets a database-touching
  // page run and 500 first. The middleware is the only seam that precedes it.
  //
  // Edge runtime — `process.env` and WebCrypto only, no database (which is also
  // why the auth gate cannot consult the onboarding flag, ADR-0014 §4).
  if (!checkBootEnv(process.env).ok) {
    if (pathname.startsWith("/api/")) {
      // Same reasoning as the 401 below: an API client needs a machine-readable
      // failure, not 200 and a page of Hebrew prose.
      return NextResponse.json({ error: "Environment not configured" }, { status: 503 });
    }
    return NextResponse.rewrite(new URL(ENV_DIAGNOSTIC_PATH, req.url));
  }

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
