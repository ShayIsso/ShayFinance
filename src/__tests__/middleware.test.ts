import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac, randomBytes } from "crypto";
import { middleware } from "@/middleware";

/**
 * The auth gate plus the boot-env gate, asserted at the seam Next actually
 * calls. CLAUDE.md singles this file out as the one where a mistake leaves
 * every route unprotected, and both gates are pure request-in/response-out —
 * `checkBootEnv` reads the source it is handed and `validateSessionEdge` reads
 * `process.env` per call, so no module reset is needed between cases.
 */
const VALID_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const SESSION_COOKIE = "shayfinance-session";

const ORIGINAL = {
  DATABASE_URL: process.env.DATABASE_URL,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
};

function setEnv(bootEnvValid: boolean) {
  if (bootEnvValid) {
    process.env.DATABASE_URL = "postgresql://synthetic:synthetic@localhost:5432/synthetic";
    process.env.ENCRYPTION_KEY = VALID_KEY;
  } else {
    process.env.DATABASE_URL = "";
    process.env.ENCRYPTION_KEY = "";
  }
}

function signedSessionToken(): string {
  const data = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", Buffer.from(VALID_KEY, "hex")).update(data).digest("hex");
  return `${data}.${sig}`;
}

function request(path: string, token?: string): NextRequest {
  const req = new NextRequest(new URL(`http://localhost${path}`));
  if (token) req.cookies.set(SESSION_COOKIE, token);
  return req;
}

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("middleware — boot-env gate (ADR-0014 §1)", () => {
  it("rewrites a page request to the diagnostic when the environment is unusable", async () => {
    setEnv(false);
    const res = await middleware(request("/settings"));

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toContain("/env-check");
  });

  it("rewrites even the login route, which cannot work without the key", async () => {
    setEnv(false);
    const res = await middleware(request("/login"));
    expect(res.headers.get("x-middleware-rewrite")).toContain("/env-check");
  });

  it("rewrites a request that carries a session cookie", async () => {
    setEnv(false);
    const res = await middleware(request("/", signedSessionToken()));
    expect(res.headers.get("x-middleware-rewrite")).toContain("/env-check");
  });

  it("answers an API request with a machine-readable failure, not the page", async () => {
    setEnv(false);
    const res = await middleware(request("/api/transactions"));

    expect(res.status).toBe(503);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    await expect(res.json()).resolves.toEqual({ error: "Environment not configured" });
  });
});

describe("middleware — auth gate on a usable environment", () => {
  it("redirects an unauthenticated page request to the login route", async () => {
    setEnv(true);
    const res = await middleware(request("/settings"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("answers an unauthenticated API request with 401", async () => {
    setEnv(true);
    const res = await middleware(request("/api/transactions"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("lets the login route through unauthenticated", async () => {
    setEnv(true);
    const res = await middleware(request("/login"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("lets the auth endpoints through unauthenticated", async () => {
    setEnv(true);
    const res = await middleware(request("/api/auth/login"));

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("lets a validly signed session through", async () => {
    setEnv(true);
    const res = await middleware(request("/settings", signedSessionToken()));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("redirects a session signed with the wrong key", async () => {
    setEnv(true);
    const data = randomBytes(32).toString("hex");
    const sig = createHmac("sha256", Buffer.from("ff".repeat(32), "hex"))
      .update(data)
      .digest("hex");
    const res = await middleware(request("/settings", `${data}.${sig}`));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});
