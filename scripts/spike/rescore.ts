import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * #100 — rescores all benchmark result files two ways:
 *  - raw: strict match against the owner's DB label
 *  - adjudicated: the owner-approved items in adjudications.json also accept
 *    the alternate answer (labels that were one-time manual choices or
 *    double-meaning-category judgment calls, approved by Shay 2026-07-14)
 */

const DIR = join(process.cwd(), "scripts", "spike");

type Adjudication = { description: string; ownerLabel: string; alsoAccepted: string };
const adjudications: Adjudication[] = JSON.parse(
  readFileSync(join(DIR, "adjudications.json"), "utf8"),
);
const accepted = new Map(adjudications.map((a) => [a.description, a.alsoAccepted]));

const files = readdirSync(DIR).filter(
  (f) => f.startsWith("benchmark-results-") && f.endsWith(".json"),
);

console.log("| Model | Raw | Adjudicated |");
console.log("|---|---|---|");
for (const f of files) {
  const run = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  const n = run.results.length;
  let raw = 0;
  let adj = 0;
  for (const r of run.results) {
    if (r.correct) {
      raw++;
      adj++;
    } else if (accepted.get(r.description) === r.predicted) {
      adj++;
    }
  }
  console.log(
    `| ${run.provider}:${run.model} | ${raw}/${n} (${((raw / n) * 100).toFixed(0)}%) | ${adj}/${n} (${((adj / n) * 100).toFixed(0)}%) |`,
  );
}
