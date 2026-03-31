import bcrypt from "bcrypt";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getEnv } from "@/lib/env";

export const SESSION_COOKIE = "shayfinance-session";

function getSecret(): string {
  return getEnv().ENCRYPTION_KEY;
}

export async function verifyPassword(input: string): Promise<boolean> {
  return bcrypt.compare(input, getEnv().APP_PASSWORD);
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
