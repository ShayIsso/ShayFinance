const PASSWORD_KEYS = /^(password|pwd|secret|token|apiKey|api_key)$/i;
const ID_KEYS = /^(id|idNumber|nationalId|teudatZehut)$/i;
const ACCOUNT_KEYS = /^(accountNumber|bankAccountNumber)$/i;
const NINE_DIGITS = /^\d{9}$/;
const BEARER_PATTERN = /Bearer [A-Za-z0-9._\-]+/g;
const OTP_PATTERN = /(otp|code|קוד|אימות)[^0-9]{0,15}([0-9]{4,8})(?!\d)/gi;

function redactString(value: string): string {
  let result = value.replace(BEARER_PATTERN, "Bearer [REDACTED]");
  result = result.replace(OTP_PATTERN, (match, ctx, digits) =>
    match.replace(digits, "[REDACTED_OTP]"),
  );
  return result;
}

export function redact(value: unknown, visited: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object" && !Array.isArray(value)) return value;

  if (visited.has(value as object)) return "[Circular]";
  visited.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, visited));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (PASSWORD_KEYS.test(key)) {
      result[key] = "[REDACTED]";
    } else if (ID_KEYS.test(key) && typeof val === "string" && NINE_DIGITS.test(val)) {
      result[key] = "[REDACTED_ID]";
    } else if (ACCOUNT_KEYS.test(key)) {
      result[key] = "[REDACTED_ACCOUNT]";
    } else {
      result[key] = redact(val, visited);
    }
  }
  return result;
}
