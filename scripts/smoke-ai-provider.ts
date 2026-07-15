/**
 * Owner-run live smoke for the AI provider adapters (ticket #147).
 *
 * Categorizes one tiny batch end-to-end against the configured provider and
 * prints the STRUCTURED parsed result — never the raw model response, never the
 * assembled prompt, never any secret (zero-leak policy, ADR-0008). It exercises
 * the real seam: env resolution → adapter → the core module's redaction,
 * prompt assembly, and parser.
 *
 * Run (from the repo root, with AI_PROVIDER + a key/endpoint set in .env):
 *   npx tsx scripts/smoke-ai-provider.ts
 *
 * Expected output shape (values vary by model):
 *   provider: gemini-flash-latest
 *   answers: [ { index: 1, category: 'מסעדות וקפה', confidence: 7 }, ... ]
 *   failures: 0
 *
 * With nothing configured it prints "provider: off (no external call made)"
 * and exits 0 — proving a fresh install makes zero external calls.
 */
import "dotenv/config";
import { redactText } from "@/lib/redaction";
import {
  assemblePrompt,
  parseCategorizationResponse,
  createConfiguredProvider,
} from "@/lib/ai-categorization";

const CATEGORIES = [
  { name: "מסעדות וקפה", description: "בתי קפה, מסעדות, אוכל בחוץ" },
  { name: "מזון וסופר", description: "סופרמרקט, מכולת, קניות מזון לבית" },
  { name: "תחבורה", description: "דלק, חניה, תחבורה ציבורית, מוניות" },
] as const;

const BATCH = ["קפה ג'ו סניף מרכז", "רמי לוי שיווק", "פז תחנת דלק"];

async function main(): Promise<void> {
  const provider = createConfiguredProvider();
  if (!provider) {
    console.log("provider: off (no external call made)");
    return;
  }

  const prompt = assemblePrompt({
    categories: [...CATEGORIES],
    fewShot: [],
    antiExamples: [],
    batch: BATCH.map((d) => redactText(d)),
  });

  const raw = await provider.generate(prompt, { temperature: 0, json: true });
  const parsed = parseCategorizationResponse(raw, {
    validCategoryNames: CATEGORIES.map((c) => c.name),
    batchSize: BATCH.length,
  });

  // Only the structured parse result is printed — never `raw`.
  console.log(`provider: ${provider.modelId}`);
  console.log("answers:", parsed.answers);
  console.log("failures:", parsed.failures.length);
}

main().catch((err) => {
  // Surface only the error's shape (ProviderError messages are body-free by
  // construction); never dump an arbitrary object that might carry a payload.
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : "unknown error");
  process.exit(1);
});
