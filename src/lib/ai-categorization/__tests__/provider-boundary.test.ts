import { describe, it, expect } from "vitest";
import { redactText, type RedactedString } from "@/lib/redaction";
import type { CategorizationProvider } from "../provider";

const provider: CategorizationProvider = {
  modelId: "compile-check",
  async generate(prompt: RedactedString) {
    return String(prompt);
  },
};

describe("CategorizationProvider redaction boundary (ADR-0008 §4)", () => {
  it("does not type-check against a plain string payload", async () => {
    // @ts-expect-error a plain string is not RedactedString — the boundary is a
    // compile-time guarantee. If the provider ever accepted `string`, this
    // directive would become unused and `npm run build` (tsc) would fail.
    const rejected = provider.generate("שווארמה 12345", {});
    void rejected;

    // A minted RedactedString is accepted.
    const ok = await provider.generate(redactText("שווארמה 12345"), {});
    expect(ok).toContain("[REDACTED_DIGITS]");
  });
});
