import { describe, it, expect } from "vitest";
import { redact } from "../redact";

// The log sanitizer's string-level pass delegates to the shared
// redaction module (ADR-0008 §3) — a strict superset of the old
// Bearer + OTP behavior. Fixtures are fake; zero-leak policy.

describe("redact — string pass delegates to shared redaction rules", () => {
  it("redacts a 5+ digit run in a bare string", () => {
    expect(redact("card ending 1234567")).toBe("card ending [REDACTED_DIGITS]");
  });

  it("redacts a 5+ digit run inside a nested object string value", () => {
    expect(redact({ note: "חיוב מחשבון 987654321" })).toEqual({
      note: "חיוב מחשבון [REDACTED_DIGITS]",
    });
  });

  it("redacts 5+ digit runs inside array string elements", () => {
    expect(redact(["a 11111", "b 2222"])).toEqual(["a [REDACTED_DIGITS]", "b 2222"]);
  });

  it("keeps digit runs of 4 or fewer in strings", () => {
    expect(redact("סניף 123 חשבון 4567")).toBe("סניף 123 חשבון 4567");
  });

  it("redacts an email address in a logged string", () => {
    expect(redact({ message: "sent to someone@example.com" })).toEqual({
      message: "sent to [REDACTED_EMAIL]",
    });
  });

  it("redacts a credentialed URL in a logged string", () => {
    expect(redact("db postgres://admin:fakepw@localhost:5432/db")).toBe("db [REDACTED_URL]");
  });

  it("redacts a home-directory path in a logged string", () => {
    expect(redact({ error: "ENOENT /Users/someuser/.env" })).toEqual({
      error: "ENOENT [REDACTED_PATH]",
    });
  });

  it("redacts a keyword-adjacent secret in a logged string", () => {
    expect(redact("retry with password: fake-hunter2")).toBe(
      "retry with password: [REDACTED_SECRET]",
    );
  });
});
