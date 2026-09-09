import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

/**
 * The walk is rooted at the public interface only, which is what consumers
 * import — so it is structurally blind to a second entry point. Adding one to
 * this module means rooting the walk at both.
 */
const MODULE_ENTRY = path.resolve(__dirname, "../index.ts");
const MODULE_DIR = path.resolve(__dirname, "..");
const SRC_ROOT = path.resolve(__dirname, "../../..");

interface Dependency {
  readonly specifier: string;
  readonly typeOnly: boolean;
  readonly importedBy: string;
}

const WITH_SOURCE = /(?:^|\n)[ \t]*(import|export)[ \t]+([\s\S]*?)from[ \t]*["']([^"']+)["']/g;
const SIDE_EFFECT_ONLY = /(?:^|\n)[ \t]*import[ \t]*["']([^"']+)["']/g;
/**
 * Deferred `import("…")` counts as a runtime dependency. The store idiom this
 * codebase uses for singleton tables reaches the database barrel exactly this
 * way, so a walk that only saw static imports would miss the one import shape
 * most likely to be added here by someone following that idiom.
 */
const DYNAMIC = /\bimport[ \t]*\([ \t]*["']([^"']+)["'][ \t]*\)/g;

/**
 * Resolves only inside this module. An in-repo path that leaves the module —
 * `@/db` above all — must be reported as a dependency rather than walked into,
 * or the banned-list assertion silently never matches because the barrel
 * resolved to a real file and was followed like one of our own.
 */
function resolveWithinModule(specifier: string, importingFile: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? path.join(SRC_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(importingFile), specifier)
      : undefined;
  if (!base || path.relative(MODULE_DIR, base).startsWith("..")) return undefined;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

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
    for (const match of source.matchAll(DYNAMIC)) {
      found.push({ specifier: match[1], typeOnly: false });
    }

    for (const { specifier, typeOnly } of found) {
      const withinModule = resolveWithinModule(specifier, file);
      if (withinModule) {
        queue.push(withinModule);
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

  it("walks no file outside its own module directory", () => {
    const strays = files
      .filter((file) => path.relative(MODULE_DIR, file).startsWith(".."))
      .map((file) => path.relative(SRC_ROOT, file));
    expect(strays).toEqual([]);
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
    const runtime = [
      ...new Set(
        dependencies
          .filter((dep) => !dep.typeOnly)
          .map((dep) => dep.specifier)
          .filter((specifier) => specifier !== "zod"),
      ),
    ].sort();
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
