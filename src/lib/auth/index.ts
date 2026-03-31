import bcrypt from "bcrypt";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "shayfinance-session";

function getSecret(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY is not set");
  return key;
}

export async function verifyPassword(input: string): Promise<boolean> {
  const hash = process.env.APP_PASSWORD;
  if (!hash) throw new Error("APP_PASSWORD is not set");
  return bcrypt.compare(input, hash);
}

export function createSession(): string {
  const data = randomBytes(32).toString("hex");
  const key = Buffer.from(getSecret(), "hex");
  const sig = createHmac("sha256", key).update(data).digest("hex");
  return `${data}.${sig}`;
}

export function validateSession(token: string): boolean {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return false;
  const data = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);
  if (!data || !sig) return false;
  const key = Buffer.from(getSecret(), "hex");
  const expected = createHmac("sha256", key).update(data).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
