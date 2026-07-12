import { describe, it, expect } from "vitest";
import { redactText, redactionRules, type RedactedString } from "../index";

// Zero-leak policy: every "sensitive" value in this file is fake.

// Type-level contract (checked by tsc, ADR-0008 §4): plain strings do
// not type-check where a RedactedString is required.
// @ts-expect-error — only redactText may mint a RedactedString
const rejectedPlainString: RedactedString = "plain string";
void rejectedPlainString;

describe("redactText — rule 1: digit runs of 5+", () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    {
      name: "redacts a bare 5-digit run",
      input: "12345",
      expected: "[REDACTED_DIGITS]",
    },
    {
      name: "redacts a long digit run (fake phone number)",
      input: "התקשר 0501112223",
      expected: "התקשר [REDACTED_DIGITS]",
    },
    {
      name: "redacts a digit run embedded in Latin text",
      input: "account no 1234567 closed",
      expected: "account no [REDACTED_DIGITS] closed",
    },
    {
      name: "redacts multiple digit runs independently",
      input: "מ-11111 אל 22222",
      expected: "מ-[REDACTED_DIGITS] אל [REDACTED_DIGITS]",
    },
    {
      name: "keeps runs of 4 digits or fewer",
      input: "חיוב 1234 בסניף 56",
      expected: "חיוב 1234 בסניף 56",
    },
    {
      name: "redacts digit run glued to Hebrew merchant text",
      input: "שווארמה הרצל 54321",
      expected: "שווארמה הרצל [REDACTED_DIGITS]",
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    expect(redactText(input)).toBe(expected);
  });
});

describe("redactText — rule 3: email addresses", () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    {
      name: "redacts a plain email address",
      input: "contact someone@example.com please",
      expected: "contact [REDACTED_EMAIL] please",
    },
    {
      name: "redacts an email with dots, plus and hyphen",
      input: "first.last+tag@sub-domain.example.co.il",
      expected: "[REDACTED_EMAIL]",
    },
    {
      name: "redacts an email inside Hebrew text",
      input: "נשלח אל user@example.org אתמול",
      expected: "נשלח אל [REDACTED_EMAIL] אתמול",
    },
    {
      name: "redacts an email whose local part contained a 5+ digit run (rule 1 ran first)",
      input: "user12345@example.com",
      expected: "[REDACTED_EMAIL]",
    },
    {
      name: "does not treat a lone @ as an email",
      input: "מסעדה @ הנמל",
      expected: "מסעדה @ הנמל",
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    expect(redactText(input)).toBe(expected);
  });
});

describe("redactText — rule 4: credentialed URLs", () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    {
      name: "redacts a URL with userinfo credentials whole (not as an email)",
      input: "fetching https://user:fakepass@example.com/path now",
      expected: "fetching [REDACTED_URL] now",
    },
    {
      name: "redacts a connection string with userinfo and a digit-run password",
      input: "postgres://admin:12345678@localhost:5432/db",
      expected: "[REDACTED_URL]",
    },
    {
      name: "redacts a URL with a token query parameter",
      input: "GET https://api.example.com/v1?token=fake123 done",
      expected: "GET [REDACTED_URL] done",
    },
    {
      name: "redacts a URL with an api_key query parameter",
      input: "https://api.example.com/v1?foo=1&api_key=fake",
      expected: "[REDACTED_URL]",
    },
    {
      name: "keeps a URL without credentials",
      input: "see https://example.com/docs for info",
      expected: "see https://example.com/docs for info",
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    expect(redactText(input)).toBe(expected);
  });
});

describe("redactText — rule 5: home-directory paths", () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    {
      name: "redacts a macOS home path",
      input: "ENOENT: open '/Users/someuser/projects/app/.env'",
      expected: "ENOENT: open '[REDACTED_PATH]'",
    },
    {
      name: "redacts a Linux home path",
      input: "reading /home/someuser/.config/secrets.json failed",
      expected: "reading [REDACTED_PATH] failed",
    },
    {
      name: "redacts a tilde path",
      input: "saved to ~/Documents/report.pdf",
      expected: "saved to [REDACTED_PATH]",
    },
    {
      name: "redacts a home path inside Hebrew text",
      input: "הקובץ נשמר ב-/Users/someuser/Downloads/doc.pdf בהצלחה",
      expected: "הקובץ נשמר ב-[REDACTED_PATH] בהצלחה",
    },
    {
      name: "redacts a home path containing a digit-run placeholder whole",
      input: "wrote /Users/someuser/backups/12345678/dump.sql",
      expected: "wrote [REDACTED_PATH]",
    },
    {
      name: "keeps non-home absolute paths",
      input: "log at /var/log/app.log",
      expected: "log at /var/log/app.log",
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    expect(redactText(input)).toBe(expected);
  });
});

describe("redactText — rule ordering and interaction", () => {
  it("upgrades a digit run in OTP context to [REDACTED_OTP] even beyond the legacy 8-digit cap", () => {
    // Legacy OTP pattern matched 4-8 digits only; rule 1 + the upgrade
    // now covers any length in keyword context.
    expect(redactText("code 123456789")).toBe("code [REDACTED_OTP]");
  });

  it("redacts every class in one mixed Hebrew/Latin line", () => {
    const input =
      "סיסמה: fake1 אימייל user@example.co.il טלפון 0501234567 ראה https://u:p@h.com/x ב-/Users/someuser/f.txt";
    expect(redactText(input)).toBe(
      "סיסמה: [REDACTED_SECRET] אימייל [REDACTED_EMAIL] טלפון [REDACTED_DIGITS] ראה [REDACTED_URL] ב-[REDACTED_PATH]",
    );
  });

  it("leaves a plain Hebrew merchant descriptor untouched", () => {
    expect(redactText("שווארמה הרצל תל אביב")).toBe("שווארמה הרצל תל אביב");
  });

  it("leaves a mixed-language descriptor with short digits untouched", () => {
    expect(redactText("PAYBOX סניף 123")).toBe("PAYBOX סניף 123");
  });
});

describe("redactText — review-probe regressions", () => {
  // Exact inputs from the PR #122 adversarial review probe. Each of
  // these survived the first implementation and must never leak again.
  const cases: Array<{ name: string; input: string; expected: string }> = [
    {
      name: "redacts an alphanumeric OTP value (keyword + non-numeric adjacent value)",
      input: "OTP: a1b2c3",
      expected: "OTP: [REDACTED_SECRET]",
    },
    {
      name: "redacts a short numeric OTP below the legacy 4-digit floor",
      input: "otp 123",
      expected: "otp [REDACTED_SECRET]",
    },
    {
      name: "redacts an alphanumeric value after Hebrew קוד אימות",
      input: "קוד אימות: a1b2c3",
      expected: "קוד אימות: [REDACTED_SECRET]",
    },
    {
      name: "redacts the value in natural Hebrew possessive + copula phrasing",
      input: "הסיסמה שלי היא hunter2",
      expected: "הסיסמה שלי היא [REDACTED_SECRET]",
    },
    {
      name: "redacts a protocol-relative credentialed URL (userinfo, no scheme)",
      input: "see //user:secretpw@evil.com now",
      expected: "see [REDACTED_URL] now",
    },
    {
      name: "redacts a Windows home path",
      input: "C:\\Users\\x\\secrets.txt",
      expected: "[REDACTED_PATH]",
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    expect(redactText(input)).toBe(expected);
  });
});

describe("redactText — natural Hebrew phrasing corpus", () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    {
      name: "redacts the value after Hebrew copula היא",
      input: "הסיסמה היא fake123",
      expected: "הסיסמה היא [REDACTED_SECRET]",
    },
    {
      name: "redacts the value after Hebrew copula הוא",
      input: "המפתח הוא fake-key-2",
      expected: "המפתח הוא [REDACTED_SECRET]",
    },
    {
      name: "redacts the value after Hebrew copula זה",
      input: "הטוקן זה tok-fake",
      expected: "הטוקן זה [REDACTED_SECRET]",
    },
    {
      name: "redacts the value after possessive שלך with a colon",
      input: "סיסמה שלך: fakepw",
      expected: "סיסמה שלך: [REDACTED_SECRET]",
    },
    {
      name: "routes numeric Hebrew OTP phrasing through the legacy token",
      input: "הקוד הוא 1234",
      expected: "הקוד הוא [REDACTED_OTP]",
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    expect(redactText(input)).toBe(expected);
  });
});

describe("redactText — idempotence", () => {
  const inputs: string[] = [
    "12345",
    "OTP code: 123456",
    "Authorization: Bearer fakeToken.abc",
    "password: fake-hunter2",
    "סיסמה: fake123",
    "user@example.com",
    "postgres://admin:12345678@localhost:5432/db",
    "/Users/someuser/projects/.env",
    "סיסמה: fake1 אימייל user@example.co.il טלפון 0501234567 ראה https://u:p@h.com/x ב-/Users/someuser/f.txt",
    "שווארמה הרצל תל אביב",
    // Review-probe corpus.
    "OTP: a1b2c3",
    "otp 123",
    "קוד אימות: a1b2c3",
    "הסיסמה שלי היא hunter2",
    "see //user:secretpw@evil.com now",
    "C:\\Users\\x\\secrets.txt",
    "הקוד הוא 1234",
  ];

  it.each(inputs.map((input) => ({ input })))(
    "redacting already-redacted text is stable: %j",
    ({ input }) => {
      const once = redactText(input);
      expect(redactText(once)).toBe(once);
    },
  );
});

describe("redactionRules — the exported rule table", () => {
  it("lists the five ADR-0008 rules in ADR order", () => {
    expect(redactionRules.map((rule) => rule.name)).toEqual([
      "digit-run",
      "keyword-secret",
      "email",
      "credentialed-url",
      "home-path",
    ]);
  });

  it("gives each rule class distinguishable bracketed placeholders", () => {
    const allPlaceholders = redactionRules.flatMap((rule) => rule.placeholders);
    expect(new Set(allPlaceholders).size).toBe(allPlaceholders.length);
    for (const placeholder of allPlaceholders) {
      expect(placeholder).toMatch(/^\[REDACTED(_[A-Z]+)?\]$/);
    }
  });

  it("each rule's apply emits only its own declared placeholders", () => {
    const probesByRule: Record<string, string[]> = {
      "digit-run": ["acct 1234567"],
      "keyword-secret": [
        "password: fake-value",
        "OTP code: 1234",
        "Authorization: Bearer fakeToken.abc",
        "קוד אימות: a1b2c3",
        "הסיסמה שלי היא hunter2",
      ],
      email: ["someone@example.com"],
      "credentialed-url": ["https://u:p@h.com/x", "//user:fakepw@h.com"],
      "home-path": ["/Users/someuser/f.txt", "C:\\Users\\someuser\\f.txt"],
    };
    for (const rule of redactionRules) {
      for (const probe of probesByRule[rule.name]) {
        const output = rule.apply(probe);
        expect(output).not.toBe(probe); // every probe must trigger its rule
        const emitted = output.match(/\[REDACTED(?:_[A-Z]+)?\]/g) ?? [];
        expect(emitted.length).toBeGreaterThan(0);
        for (const token of emitted) {
          expect(rule.placeholders).toContain(token);
        }
      }
    }
  });

  it("applying the table in order produces exactly redactText's output", () => {
    const input = "code 1234 password: fake user@example.com /Users/someuser/x 987654321";
    const viaTable = redactionRules.reduce((acc, rule) => rule.apply(acc), input);
    expect(viaTable).toBe(redactText(input));
  });

  it("is deeply frozen — the security-critical table cannot be mutated", () => {
    expect(Object.isFrozen(redactionRules)).toBe(true);
    for (const rule of redactionRules) {
      expect(Object.isFrozen(rule)).toBe(true);
      expect(Object.isFrozen(rule.placeholders)).toBe(true);
    }
  });
});

describe("RedactedString brand", () => {
  it("is usable as a plain string at runtime", () => {
    const redacted: RedactedString = redactText("שווארמה 12345");
    const plain: string = redacted;
    expect(typeof plain).toBe("string");
    expect(plain).toBe("שווארמה [REDACTED_DIGITS]");
  });
});

describe("redactText — rule 2: keyword-secret patterns", () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    // Legacy log-sanitizer compatibility: exact output tokens preserved.
    {
      name: "redacts Bearer tokens with the legacy token shape",
      input: "Authorization: Bearer eyJfakeHeader.fakePayload.fakeSig",
      expected: "Authorization: Bearer [REDACTED]",
    },
    {
      name: "redacts a 4-digit OTP after an English keyword",
      input: "OTP code: 1234",
      expected: "OTP code: [REDACTED_OTP]",
    },
    {
      name: "redacts a 6-digit OTP as [REDACTED_OTP] even though rule 1 ran first",
      input: "OTP code: 123456",
      expected: "OTP code: [REDACTED_OTP]",
    },
    {
      name: "redacts a Hebrew OTP context (קוד אימות)",
      input: "קוד אימות 654321",
      expected: "קוד אימות [REDACTED_OTP]",
    },
    // Generic keyword + adjacent value.
    {
      name: "redacts a value after password:",
      input: "password: fake-hunter2",
      expected: "password: [REDACTED_SECRET]",
    },
    {
      name: "redacts a value after token=",
      input: "retrying with token=tok_fake_abc",
      expected: "retrying with token=[REDACTED_SECRET]",
    },
    {
      name: "redacts a value connected with 'is'",
      input: "the password is fake-hunter2",
      expected: "the password is [REDACTED_SECRET]",
    },
    {
      name: "redacts a value after api_key",
      input: "api_key=sk-fake-123 sent",
      expected: "api_key=[REDACTED_SECRET] sent",
    },
    {
      name: "redacts a value after key:",
      input: "key: fake-value",
      expected: "key: [REDACTED_SECRET]",
    },
    {
      name: "redacts a value after Hebrew סיסמה",
      input: "סיסמה: fake123",
      expected: "סיסמה: [REDACTED_SECRET]",
    },
    {
      name: "redacts a value after Hebrew מפתח",
      input: "מפתח = fake-key-value",
      expected: "מפתח = [REDACTED_SECRET]",
    },
    {
      name: "redacts a value after Hebrew טוקן",
      input: "טוקן fake-token-value",
      expected: "טוקן [REDACTED_SECRET]",
    },
    {
      name: "does not fire on 'passwords' (word boundary)",
      input: "passwords are rotated monthly",
      expected: "passwords are rotated monthly",
    },
    {
      name: "does not fire on 'monkey' (key needs a word boundary)",
      input: "monkey business",
      expected: "monkey business",
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    expect(redactText(input)).toBe(expected);
  });
});
