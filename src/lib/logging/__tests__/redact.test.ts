import { describe, it, expect } from "vitest";
import { redact } from "../redact";

describe("redact", () => {
  // 1. password key → [REDACTED]
  it("redacts password key", () => {
    expect(redact({ password: "super-secret" })).toEqual({ password: "[REDACTED]" });
  });

  // 2. apiKey key → [REDACTED]
  it("redacts apiKey key", () => {
    expect(redact({ apiKey: "abc123" })).toEqual({ apiKey: "[REDACTED]" });
  });

  // 3. Nested object with password
  it("redacts password nested at any depth", () => {
    const input = { user: { creds: { password: "x" } } };
    expect(redact(input)).toEqual({ user: { creds: { password: "[REDACTED]" } } });
  });

  // 4. Array of objects each with password
  it("redacts password in each element of an array", () => {
    const input = [{ password: "a" }, { password: "b" }];
    expect(redact(input)).toEqual([{ password: "[REDACTED]" }, { password: "[REDACTED]" }]);
  });

  // 5. OTP string pattern
  it("redacts OTP code digits in a string", () => {
    const result = redact("OTP code: 123456") as string;
    expect(result).toContain("[REDACTED_OTP]");
    expect(result).not.toContain("123456");
  });

  // 6. 9-digit national ID
  it("redacts 9-digit value under idNumber key", () => {
    expect(redact({ idNumber: "123456789" })).toEqual({ idNumber: "[REDACTED_ID]" });
  });

  // 7. Non-9-digit id is NOT redacted
  it("does not redact id key with UUID-style value", () => {
    expect(redact({ id: "abc-uuid-style" })).toEqual({ id: "abc-uuid-style" });
  });

  // 8. accountNumber → [REDACTED_ACCOUNT]
  it("redacts accountNumber key", () => {
    expect(redact({ accountNumber: "12345678" })).toEqual({
      accountNumber: "[REDACTED_ACCOUNT]",
    });
  });

  // 9. Bearer token in string
  it("redacts Bearer token in a string", () => {
    const result = redact("Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig") as string;
    expect(result).toBe("Authorization: Bearer [REDACTED]");
  });

  // 10. Circular reference — no infinite loop
  it("handles circular references without infinite loop", () => {
    const obj: Record<string, unknown> = { name: "test" };
    obj.self = obj;
    const result = redact(obj) as Record<string, unknown>;
    expect(result.self).toBe("[Circular]");
  });

  // 11. Non-sensitive object passes through unchanged
  it("passes through non-sensitive object unchanged", () => {
    const input = { name: "Shay", amount: 100, active: true };
    expect(redact(input)).toEqual(input);
  });

  // 12. Primitive pass-through
  it("returns numbers as-is", () => expect(redact(42)).toBe(42));
  it("returns booleans as-is", () => expect(redact(true)).toBe(true));
  it("returns null as-is", () => expect(redact(null)).toBeNull());
  it("returns undefined as-is", () => expect(redact(undefined)).toBeUndefined());

  // 13. Original input not mutated
  it("does not mutate the original input", () => {
    const input = { password: "secret", name: "Shay" };
    const before = structuredClone(input);
    redact(input);
    expect(input).toEqual(before);
  });

  // 14. Sentinel is exactly [REDACTED]
  it("uses the exact sentinel [REDACTED] for password fields", () => {
    const result = redact({ password: "x" }) as Record<string, unknown>;
    expect(result.password).toBe("[REDACTED]");
  });

  // 15. Hebrew OTP context
  it("redacts digits in Hebrew OTP context (אימות)", () => {
    const result = redact("קוד אימות 654321") as string;
    expect(result).toContain("[REDACTED_OTP]");
    expect(result).not.toContain("654321");
  });

  // 16. pwd key → [REDACTED]
  it("redacts pwd key", () => {
    expect(redact({ pwd: "hunter2" })).toEqual({ pwd: "[REDACTED]" });
  });

  // 17. token key → [REDACTED]
  it("redacts token key", () => {
    expect(redact({ token: "tok_live_abc" })).toEqual({ token: "[REDACTED]" });
  });

  // 18. secret key → [REDACTED]
  it("redacts secret key", () => {
    expect(redact({ secret: "shh" })).toEqual({ secret: "[REDACTED]" });
  });

  // 19. bankAccountNumber → [REDACTED_ACCOUNT]
  it("redacts bankAccountNumber key", () => {
    expect(redact({ bankAccountNumber: "987654321" })).toEqual({
      bankAccountNumber: "[REDACTED_ACCOUNT]",
    });
  });

  // 20. nationalId 9-digit → [REDACTED_ID]
  it("redacts 9-digit value under nationalId key", () => {
    expect(redact({ nationalId: "987654321" })).toEqual({ nationalId: "[REDACTED_ID]" });
  });

  // 21. Nested array of objects with mixed types
  it("recurses into nested arrays of objects", () => {
    const input = { users: [{ password: "p1" }, { name: "ok" }] };
    expect(redact(input)).toEqual({ users: [{ password: "[REDACTED]" }, { name: "ok" }] });
  });

  // 22. 9-digit id key → [REDACTED_ID]
  it("redacts id key when value is exactly 9 digits", () => {
    expect(redact({ id: "123456789" })).toEqual({ id: "[REDACTED_ID]" });
  });

  // 23. OTP in object string value
  it("redacts OTP pattern in object string values", () => {
    const result = redact({ message: "code 12345678" }) as Record<string, unknown>;
    expect(result.message as string).toContain("[REDACTED_OTP]");
  });
});
