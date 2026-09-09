import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const MODULE_ENTRY = path.resolve(__dirname, "../index.ts");
const SRC_ROOT = path.resolve(__dirname, "../../..");

interface Dependency {
  readonly specifier: string;
  readonly typeOnly: boolean;
  readonly importedBy: string;
}

const WITH_SOURCE = /(?:^|\n)[ \t]*(import|export)[ \t]+([\s\S]*?)from[ \t]*["']([^"']+)["']/g;
const SIDE_EFFECT_ONLY = /(?:^|\n)[ \t]*import[ \t]*["']([^"']+)["']/g;

function resolveLocal(specifier: string, importingFile: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? path.join(SRC_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(importingFile), specifier)
      : undefined;
  if (!base) return undefined;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Every file reachable from the public interface, and every package they import. */
function walkModule(): { files: string[]; dependencies: Dependency[] } {
  const files: string[] = [];
  const dependencies: Dependency[] = [];
  const queue = [MODULE_ENTRY];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    files.push(file);
    const source = readFileSync(file, "utf8");

    const found: Array<{ specifier: string; typeOnly: boolean }> = [];
    for (const match of source.matchAll(WITH_SOURCE)) {
      found.push({ specifier: match[3], typeOnly: match[2].trimStart().startsWith("type") });
    }
    for (const match of source.matchAll(SIDE_EFFECT_ONLY)) {
      found.push({ specifier: match[1], typeOnly: false });
    }

    for (const { specifier, typeOnly } of found) {
      const local = resolveLocal(specifier, file);
      if (local) {
        queue.push(local);
        continue;
      }
      dependencies.push({ specifier, typeOnly, importedBy: path.relative(SRC_ROOT, file) });
    }
  }
  return { files, dependencies };
}

const { files, dependencies } = walkModule();

describe("the bank registry's import graph", () => {
  it("resolves past the public interface, so the assertions below are not vacuous", () => {
    const names = files.map((file) => path.basename(file));
    expect(names).toContain("index.ts");
    expect(names).toContain("entries.ts");
    expect(names).toContain("fields.ts");
  });

  it("reaches no database barrel, directly or transitively", () => {
    const database = dependencies.filter((dep) =>
      ["@/db", "@/db/schema", "drizzle-orm", "postgres"].some(
        (banned) => dep.specifier === banned || dep.specifier.startsWith(`${banned}/`),
      ),
    );
    expect(database).toEqual([]);
  });

  it("takes zod as its only runtime dependency beyond the scraper library's definitions", () => {
    const runtime = dependencies
      .filter((dep) => !dep.typeOnly)
      .map((dep) => dep.specifier)
      .filter((specifier) => specifier !== "zod");
    expect(runtime).toEqual(["israeli-bank-scrapers-core/lib/definitions"]);
  });

  it("never imports the scraper library's package root, which would pull in puppeteer", () => {
    const roots = dependencies.filter((dep) => dep.specifier === "israeli-bank-scrapers-core");
    expect(roots).toEqual([]);
  });

  it("logs nothing, since it handles credential shapes", () => {
    for (const file of files) {
      expect(readFileSync(file, "utf8")).not.toMatch(/console\.(log|info|warn|error|debug)/);
    }
  });
});
