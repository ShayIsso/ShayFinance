/**
 * Ollama Hebrew transaction categorization benchmark.
 * Usage: npx tsx scripts/spike/benchmark.ts
 *
 * Reads fixture.json (50 labeled transactions), runs each model,
 * computes accuracy, writes results to benchmark-results.json.
 *
 * Requires: ollama running on localhost:11434, fixture.json populated.
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Types ────────────────────────────────────────────────────────────────────

interface FixtureItem {
  id: number;
  description: string;
  ground_truth: string;
}

interface ModelResult {
  model: string;
  predictions: Array<{
    id: number;
    description: string;
    ground_truth: string;
    predicted: string;
    correct: boolean;
  }>;
  overall_accuracy: number;
  per_category: Record<string, { correct: number; total: number; accuracy: number }>;
  failures: Array<{
    description: string;
    ground_truth: string;
    predicted: string;
    analysis: string;
  }>;
}

// ── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: "משכורת", type: "income", hint: "Salary payments" },
  { name: "הכנסה אחרת", type: "income", hint: "Other income, transfers received, refunds" },
  { name: "מזון וסופר", type: "expense", hint: "Grocery stores, supermarkets, food markets" },
  {
    name: "מסעדות וקפה",
    type: "expense",
    hint: "Restaurants, cafes, food delivery (Wolt, Ten Bis)",
  },
  { name: "רכב ודלק", type: "expense", hint: "Fuel, car maintenance, parking lots" },
  { name: "דיור ושכירות", type: "expense", hint: "Rent, mortgage, housing, cheque withdrawals" },
  {
    name: "חשבונות ושירותים",
    type: "expense",
    hint: "Utilities, phone, internet, Spotify, Bezeq, Partner",
  },
  { name: "בריאות", type: "expense", hint: "Health, pharmacy, Clalit, Maccabi, dentist" },
  {
    name: "בילויים ופנאי",
    type: "expense",
    hint: "Entertainment, bars, concerts, events, trips",
  },
  { name: "קניות וביגוד", type: "expense", hint: "Clothing, shopping, Zara, retail stores" },
  { name: "חינוך", type: "expense", hint: "Education, courses, tuition, training" },
  { name: "ביטוח", type: "expense", hint: "Insurance — car, life, home, health supplement" },
  { name: "מנויים", type: "expense", hint: "Gym memberships, club subscriptions (Profit, etc.)" },
  { name: "מתנות ואירועים", type: "expense", hint: "Gifts, events, weddings, celebrations" },
  { name: "השקעות", type: "investment", hint: "Investment accounts, Excelence, securities, ETF" },
  { name: "חיסכון", type: "investment", hint: "Savings accounts, pension, provident funds" },
  {
    name: "העברה פנימית",
    type: "transfer",
    hint: "Credit card charge lump sums, internal bank transfers, BIT transfers between own accounts",
  },
  {
    name: "תשלום כ. אשראי",
    type: "ignore",
    hint: "Bank fees, card fees, tax withholding, bank commissions",
  },
  { name: "אחר", type: "expense", hint: "Other unclassifiable expenses" },
];

// ── Few-shot examples (from real rule-matched DB transactions) ────────────────

const FEW_SHOT_EXAMPLES: Record<string, string[]> = {
  משכורת: ["טלדור מערכ משכורת", 'משכורת מטק קריירה (ע"ר)', "טלדור מערכ"],
  "הכנסה אחרת": [
    "מפייבוקס ש",
    "וואן פתרונ משכורת",
    "מנורה חיסכ",
    "העברה משי איסו חשבון ב.הפועלים-ביט לחשבון בנק דיסקונט 085",
  ],
  "מזון וסופר": [
    "מינימרקט מנצור ובניו",
    'ז.ד. מרקט בע"מ',
    "נתח קצבים -פתח תקוה",
    "CARREFOUR קניון גבעתיים-יציל",
    "פרשמרקט מרום נווה",
    "טיטי מרקט",
    "בוסתן גבעתיים",
  ],
  "מסעדות וקפה": [
    "WOLT",
    "תן ביס",
    'ארומה מנורה (רועי טוויג ניהול בע"מ)',
    "קפה 5",
    "נונומימי כיכר המושבה",
    "TUNING BURGER",
    "KFC AIRPORT",
    "אילן שניץ",
    "לחם בשר נמל תל אביב",
  ],
  "רכב ודלק": ["דלק מנטה דרך הים", "חניון בית הכהנים", "חניון שרונה", "קבוצת חגג חניון איינטשיין"],
  "דיור ושכירות": ["משיכת שיק:0080000028", "משיכת שיק:0080000040"],
  "חשבונות ושירותים": [
    "SPOTIFYIL              STOCKHOLM     SE",
    'חברת פרטנר תקשורת בע"מ (ה',
    "בזק הוראות קבע",
    'HOT MOBILE הו"ק',
    'שטראוס מים בע"מ הו"ק',
    'דוגז שווק בע"מ',
  ],
  בריאות: ['שרותי בריאות כללית הו"ק', "שרותי בריאות כללית", "מכבי שירותי בריאות", "בית מרקחת"],
  "בילויים ופנאי": [
    "בירות שרונה תל אביב",
    'לאגר אנד אייל פ"ת',
    "BOLT.EUO2504050245",
    "BARIONP*ONETICKET",
    "VICKI CRISTINA TAPAS",
  ],
  "קניות וביגוד": [
    "SUPERDRY",
    "ZARA BUDAPEST",
    "NEW YORKER ARE'NA",
    "LFO BIATORBAGY PREMIER",
    "PB BUDAPEST",
  ],
  חינוך: ["מיסטרביט בעמ", "אולפן עברית", "קורס מקוון"],
  ביטוח: ["מגדל ביטוח הוראת קבע", "הראל ביטוח", "כלל ביטוח", "הפניקס ביטוח", "ביטוח לאומי"],
  מנויים: ['פרופיט בסר פ"ת- הו"ק', 'פרופיט פ"ת סגולה הו"ק', "מנוי ספורט", "הולמס פלייס"],
  "מתנות ואירועים": ["MAGYAR DUTY-FREE KFT.", "PAYBOX", "BIT beit dagan IL", "מתנה לחתן וכלה"],
  השקעות: [
    "העברה לאקסלנס ניהול השק בנק 12 ל 12-600-0000663827",
    "הע. לאקסלנס ניהול בסניף 12-600",
    "מיטב דש השקעות",
  ],
  חיסכון: ["קרן פנסיה", "גמל להשקעה", "קופת גמל", "חסכון לכל ילד"],
  "העברה פנימית": [
    "חיוב לכרטיס ויזה 3235",
    "העברת חיובים עקב שינוי מועד חיוב",
    "חיוב זמני למפתח מזומן",
    "מקס איט פי חיוב",
    "כ.א.ל חיוב",
    'העברה ב BIT בנה"פ',
  ],
  "תשלום כ. אשראי": [
    "דמי כרטיס בנק דיסקונט",
    "עמלת פעולה בערוץ ישיר-מט\"י, לפי 10 יח'",
    "עמלת סמס חבילה בסיסית",
    "תשלום מס במקור",
    "החזר דיסקונט עמלות וריביות",
  ],
  אחר: ["BIT", "מש' מכספומט דיסקונט 24/03", "סופר-פארם נמל-תל אביב 205"],
};

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(descriptions: string[]): string {
  const categoryList = CATEGORIES.map((c) => `  • ${c.name} (${c.type}) — ${c.hint}`).join("\n");

  const exampleLines = CATEGORIES.map((c) => {
    const exs = (FEW_SHOT_EXAMPLES[c.name] ?? []).slice(0, 5);
    if (exs.length === 0) return null;
    return `${c.name}: ${exs.map((e) => `"${e}"`).join(", ")}`;
  })
    .filter(Boolean)
    .join("\n");

  const numbered = descriptions.map((d, i) => `${i + 1}. ${d}`).join("\n");

  return `You are a Hebrew bank transaction categorizer for an Israeli personal finance app.

CATEGORIES (use ONLY these exact Hebrew names):
${categoryList}

EXAMPLES (description → correct category):
${exampleLines}

TASK: Categorize each transaction below. Reply with ONLY a JSON array of category names, one per transaction, in the same order. No explanation. No extra text.

TRANSACTIONS:
${numbered}

RESPONSE FORMAT (JSON array only):
["category1", "category2", ...]`;
}

// ── Ollama call ───────────────────────────────────────────────────────────────

async function callOllama(model: string, prompt: string): Promise<string> {
  const resp = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0, seed: 42 },
    }),
  });

  if (!resp.ok) {
    throw new Error(`Ollama HTTP ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as { response: string };
  return data.response.trim();
}

// ── Response parser ───────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set(CATEGORIES.map((c) => c.name));

function parseResponse(raw: string, count: number): string[] {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length === count) {
      return parsed.map((item: unknown) => {
        const s = String(item).trim();
        return VALID_CATEGORIES.has(s) ? s : "אחר";
      });
    }
  } catch {
    // Fall through to line-by-line parse
  }

  // Fallback: try to extract Hebrew category names line by line
  const lines = cleaned
    .split("\n")
    .map((l) =>
      l
        .replace(/^\d+\.\s*/, "")
        .replace(/[",\[\]]/g, "")
        .trim(),
    )
    .filter(Boolean);

  const results: string[] = [];
  for (const line of lines) {
    if (VALID_CATEGORIES.has(line)) {
      results.push(line);
    }
  }

  // Pad or truncate to exact count
  while (results.length < count) results.push("אחר");
  return results.slice(0, count);
}

// ── Main benchmark logic ──────────────────────────────────────────────────────

async function benchmarkModel(model: string, fixture: FixtureItem[]): Promise<ModelResult> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Benchmarking: ${model}`);
  console.log(`${"=".repeat(60)}`);

  const predictions: ModelResult["predictions"] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < fixture.length; i += BATCH_SIZE) {
    const batch = fixture.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`  Batch ${batchNum}: items ${i + 1}–${Math.min(i + BATCH_SIZE, fixture.length)}`);

    const prompt = buildPrompt(batch.map((item) => item.description));
    const raw = await callOllama(model, prompt);

    const parsed = parseResponse(raw, batch.length);

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const predicted = parsed[j];
      const correct = predicted === item.ground_truth;
      predictions.push({
        id: item.id,
        description: item.description,
        ground_truth: item.ground_truth,
        predicted,
        correct,
      });
      const status = correct ? "✓" : "✗";
      if (!correct) {
        console.log(
          `    ${status} "${item.description}" → ${predicted} (expected: ${item.ground_truth})`,
        );
      }
    }
  }

  // Compute overall accuracy
  const correct = predictions.filter((p) => p.correct).length;
  const overall_accuracy = correct / predictions.length;

  // Per-category accuracy
  const per_category: ModelResult["per_category"] = {};
  for (const p of predictions) {
    if (!per_category[p.ground_truth]) {
      per_category[p.ground_truth] = { correct: 0, total: 0, accuracy: 0 };
    }
    per_category[p.ground_truth].total++;
    if (p.correct) per_category[p.ground_truth].correct++;
  }
  for (const cat of Object.keys(per_category)) {
    const { correct: c, total } = per_category[cat];
    per_category[cat].accuracy = total > 0 ? c / total : 0;
  }

  // Top 5 failure cases (wrong predictions)
  const wrongPredictions = predictions.filter((p) => !p.correct);
  const failures: ModelResult["failures"] = wrongPredictions.slice(0, 5).map((p) => ({
    description: p.description,
    ground_truth: p.ground_truth,
    predicted: p.predicted,
    analysis: "",
  }));

  console.log(
    `\n  Overall: ${correct}/${predictions.length} = ${(overall_accuracy * 100).toFixed(1)}%`,
  );

  return {
    model,
    predictions,
    overall_accuracy,
    per_category,
    failures,
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const fixturePath = path.join(__dirname, "fixture.json");
  if (!fs.existsSync(fixturePath)) {
    console.error(
      "ERROR: fixture.json not found. Waiting for Shay to provide 50 ground-truth transactions.",
    );
    process.exit(1);
  }

  const fixture: FixtureItem[] = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
  if (fixture.length !== 50) {
    console.warn(`WARNING: Expected 50 fixture items, got ${fixture.length}`);
  }

  const models = ["qwen2.5-coder:7b", "llama3.1:8b"];
  const allResults: ModelResult[] = [];

  for (const model of models) {
    const result = await benchmarkModel(model, fixture);
    allResults.push(result);
  }

  // Write JSON results
  const outputPath = path.join(__dirname, "benchmark-results.json");
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2), "utf-8");
  console.log(`\nResults written to ${outputPath}`);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  const GO_THRESHOLD = 0.7;
  for (const r of allResults) {
    const pct = (r.overall_accuracy * 100).toFixed(1);
    const verdict = r.overall_accuracy >= GO_THRESHOLD ? "GO" : "NO-GO";
    console.log(`  ${r.model}: ${pct}% — ${verdict}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
