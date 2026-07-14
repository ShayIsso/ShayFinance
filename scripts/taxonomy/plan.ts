import { z } from "zod";
import { matchesRule, type MatchType } from "@/lib/categories";

const categoryTypeSchema = z.enum(["income", "expense", "investment", "transfer", "ignore"]);

export const decisionsSchema = z.object({
  taxonomy: z.object({
    renames: z.array(z.object({ from: z.string(), to: z.string(), icon: z.string().optional() })),
    merges: z.array(z.object({ from: z.string(), into: z.string() })),
    additions: z.array(
      z.object({
        name: z.string(),
        type: categoryTypeSchema,
        icon: z.string(),
        color: z.string(),
      }),
    ),
    deletions: z.array(z.object({ name: z.string() })),
  }),
  transactionMoves: z.object({
    procedural: z.array(
      z.object({ match: z.string(), to: z.string(), expectedCount: z.number().optional() }),
    ),
    explicit: z.array(z.object({ description: z.string(), to: z.string() })),
    drugstoreHistorical: z.object({ patterns: z.array(z.string()), to: z.string() }),
    categorySource: z.string(),
  }),
  rulePruning: z.object({
    keepOneMatch: z.array(z.string()),
    collapses: z.array(
      z.object({ keep: z.string(), delete: z.array(z.string()), category: z.string() }),
    ),
    rePoints: z.array(z.object({ patterns: z.array(z.string()), toCategory: z.string() })),
    keepAsIs: z.array(z.object({ pattern: z.string(), category: z.string() })),
  }),
});

export type Decisions = z.infer<typeof decisionsSchema>;
export type CategoryType = z.infer<typeof categoryTypeSchema>;

export interface CategorySnapshot {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
}

export interface RuleSnapshot {
  id: string;
  categoryId: string;
  matchType: MatchType;
  pattern: string;
  priority: number;
}

export interface TxnSnapshot {
  id: string;
  description: string;
  categoryId: string | null;
  categorySource: string | null;
}

export type PlanOp =
  | { kind: "renameCategory"; from: string; to: string; icon?: string }
  | { kind: "createCategory"; name: string; type: CategoryType; icon: string; color: string }
  | {
      kind: "mergeCategory";
      fromName: string;
      intoName: string;
      ruleCount: number;
      txnCount: number;
    }
  | { kind: "moveTransactions"; label: string; txIds: string[]; toName: string }
  | {
      kind: "deleteRule";
      ruleId: string;
      pattern: string;
      matchType: MatchType;
      categoryName: string;
      reason: string;
    }
  | {
      kind: "repointRule";
      ruleId: string;
      pattern: string;
      fromName: string;
      toName: string;
    }
  | { kind: "deleteCategory"; name: string; leftoverTxnCount: number };

export interface PlanSummary {
  categoriesBefore: number;
  categoriesAfter: number;
  rulesBefore: number;
  rulesAfter: number;
  renames: number;
  merges: number;
  additions: number;
  categoryDeletions: number;
  txnMoves: { procedural: number; explicit: number; drugstore: number; total: number };
  ruleDeletions: { duplicate: number; categoryDeleted: number; collapse: number; oneMatch: number };
  ruleRepoints: number;
  leftoverInDeleted: number;
}

export interface Plan {
  ops: PlanOp[];
  summary: PlanSummary;
  warnings: string[];
}

export function parseProceduralMatch(match: string): { regexSource: string; categoryName: string } {
  const m = match.match(/matches \/(.+)\/ AND current category = (.+)$/);
  if (!m) {
    throw new Error(`Cannot parse procedural move match expression: ${match}`);
  }
  return { regexSource: m[1].trim(), categoryName: m[2].trim() };
}

export function distinctMatchCount(rule: RuleSnapshot, descriptions: string[]): number {
  const seen = new Set<string>();
  for (const d of descriptions) {
    if (matchesRule(rule.matchType, rule.pattern, d)) {
      seen.add(d);
      if (seen.size >= 2) return 2;
    }
  }
  return seen.size;
}

export function buildPlan(
  decisions: Decisions,
  categories: CategorySnapshot[],
  rules: RuleSnapshot[],
  transactions: TxnSnapshot[],
): Plan {
  const ops: PlanOp[] = [];
  const warnings: string[] = [];

  const nameToId = new Map<string, string>();
  const idToName = new Map<string, string>();
  for (const c of categories) {
    nameToId.set(c.name, c.id);
    idToName.set(c.id, c.name);
  }
  const NEW = (name: string) => `__NEW__:${name}`;

  const resolveId = (name: string): string => {
    const id = nameToId.get(name);
    if (!id) throw new Error(`Decisions reference unknown category: "${name}"`);
    return id;
  };

  const workingRules: RuleSnapshot[] = rules.map((r) => ({ ...r }));
  const txnCat = new Map<string, string | null>();
  for (const t of transactions) txnCat.set(t.id, t.categoryId);

  let renameCount = 0;
  for (const r of decisions.taxonomy.renames) {
    if (!nameToId.has(r.from)) continue;
    const id = nameToId.get(r.from)!;
    ops.push({ kind: "renameCategory", from: r.from, to: r.to, icon: r.icon });
    nameToId.delete(r.from);
    nameToId.set(r.to, id);
    idToName.set(id, r.to);
    renameCount++;
  }

  let additionCount = 0;
  for (const a of decisions.taxonomy.additions) {
    if (nameToId.has(a.name)) continue;
    ops.push({
      kind: "createCategory",
      name: a.name,
      type: a.type,
      icon: a.icon,
      color: a.color,
    });
    nameToId.set(a.name, NEW(a.name));
    idToName.set(NEW(a.name), a.name);
    additionCount++;
  }

  // Merges re-point rules/txns/memory BEFORE the category row is deleted.
  // transactions.category_id FK is ON DELETE SET NULL and merchant_memory.category_id
  // is ON DELETE CASCADE, so deleting first would orphan transactions and destroy memory.
  let mergeCount = 0;
  for (const m of decisions.taxonomy.merges) {
    if (!nameToId.has(m.from)) continue;
    const fromId = nameToId.get(m.from)!;
    const intoId = resolveId(m.into);
    const ruleCount = workingRules.filter((r) => r.categoryId === fromId).length;
    let txnCount = 0;
    for (const [tid, cid] of txnCat) {
      if (cid === fromId) {
        txnCat.set(tid, intoId);
        txnCount++;
      }
    }
    for (const r of workingRules) if (r.categoryId === fromId) r.categoryId = intoId;
    ops.push({ kind: "mergeCategory", fromName: m.from, intoName: m.into, ruleCount, txnCount });
    nameToId.delete(m.from);
    idToName.delete(fromId);
    mergeCount++;
  }

  const moveCounts = { procedural: 0, explicit: 0, drugstore: 0, total: 0 };
  const emitMove = (label: string, toName: string, predicate: (t: TxnSnapshot) => boolean) => {
    const targetId = resolveId(toName);
    const txIds = transactions
      .filter((t) => txnCat.get(t.id) !== targetId && predicate(t))
      .map((t) => t.id);
    if (txIds.length === 0) return 0;
    ops.push({ kind: "moveTransactions", label, txIds, toName });
    for (const id of txIds) txnCat.set(id, targetId);
    return txIds.length;
  };

  for (const p of decisions.transactionMoves.procedural) {
    const { regexSource, categoryName } = parseProceduralMatch(p.match);
    const catId = nameToId.get(categoryName);
    if (!catId) continue;
    const re = new RegExp(regexSource, "i");
    moveCounts.procedural += emitMove(
      `procedural: /${regexSource}/ in ${categoryName} → ${p.to}`,
      p.to,
      (t) => re.test(t.description) && txnCat.get(t.id) === catId,
    );
  }
  for (const e of decisions.transactionMoves.explicit) {
    const desc = e.description.toLowerCase();
    moveCounts.explicit += emitMove(
      `explicit → ${e.to}`,
      e.to,
      (t) => t.description.toLowerCase() === desc,
    );
  }
  {
    const dh = decisions.transactionMoves.drugstoreHistorical;
    const pats = dh.patterns.map((p) => p.toLowerCase());
    moveCounts.drugstore += emitMove(`drugstore historical → ${dh.to}`, dh.to, (t) =>
      pats.some((p) => t.description.toLowerCase().includes(p)),
    );
  }
  moveCounts.total = moveCounts.procedural + moveCounts.explicit + moveCounts.drugstore;

  const descriptions = transactions.map((t) => t.description);
  const ruleDeletions = { duplicate: 0, categoryDeleted: 0, collapse: 0, oneMatch: 0 };
  const deletedCatIds = new Set(
    decisions.taxonomy.deletions
      .map((d) => nameToId.get(d.name))
      .filter((id): id is string => id !== undefined),
  );

  const deleteRule = (r: RuleSnapshot, reason: string) => {
    ops.push({
      kind: "deleteRule",
      ruleId: r.id,
      pattern: r.pattern,
      matchType: r.matchType,
      categoryName: idToName.get(r.categoryId) ?? r.categoryId,
      reason,
    });
  };

  const survivors: RuleSnapshot[] = [];

  const seenKeys = new Set<string>();
  const afterDedupe: RuleSnapshot[] = [];
  for (const r of [...workingRules].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `${r.matchType} ${r.pattern} ${r.categoryId}`;
    if (seenKeys.has(key)) {
      deleteRule(r, "exact duplicate");
      ruleDeletions.duplicate++;
    } else {
      seenKeys.add(key);
      afterDedupe.push(r);
    }
  }

  const forceDelete = new Map<string, string>();
  const collapseCategory = new Map<string, string>();
  const keepProtected = new Set<string>();
  for (const c of decisions.rulePruning.collapses) {
    keepProtected.add(c.keep.toLowerCase());
    for (const d of c.delete) {
      forceDelete.set(d.toLowerCase(), c.keep);
      collapseCategory.set(d.toLowerCase(), c.category);
    }
  }
  const keepOneMatch = new Set(decisions.rulePruning.keepOneMatch.map((p) => p.toLowerCase()));
  const keepAsIsByPattern = new Map(
    decisions.rulePruning.keepAsIs.map((k) => [k.pattern.toLowerCase(), k.category]),
  );
  const keepAsIsSeen = new Set<string>();

  for (const r of afterDedupe) {
    const patLc = r.pattern.toLowerCase();
    const catName = idToName.get(r.categoryId) ?? "";

    if (deletedCatIds.has(r.categoryId)) {
      deleteRule(r, `category deleted: ${catName}`);
      ruleDeletions.categoryDeleted++;
      continue;
    }

    // keepAsIs rules are deliberate context rules: exempt from one-match
    // deletion, collapses, and re-points; a category drift is flagged, not fixed.
    if (keepAsIsByPattern.has(patLc)) {
      keepAsIsSeen.add(patLc);
      const expected = keepAsIsByPattern.get(patLc)!;
      if (catName !== expected) {
        warnings.push(
          `keepAsIs rule "${r.pattern}" points at "${catName}" but the decisions file expects "${expected}"`,
        );
      }
      survivors.push(r);
      continue;
    }

    if (forceDelete.has(patLc) && collapseCategory.get(patLc) === catName) {
      deleteRule(r, `collapse into "${forceDelete.get(patLc)}"`);
      ruleDeletions.collapse++;
      continue;
    }
    if (keepProtected.has(patLc)) {
      survivors.push(r);
      continue;
    }

    const count = distinctMatchCount(r, descriptions);
    if (count === 1 && !keepOneMatch.has(patLc)) {
      deleteRule(r, "matches exactly one description");
      ruleDeletions.oneMatch++;
      continue;
    }
    survivors.push(r);
  }

  for (const [patLc, expected] of keepAsIsByPattern) {
    if (!keepAsIsSeen.has(patLc)) {
      warnings.push(
        `keepAsIs rule "${patLc}" (expected category "${expected}") was not found among the rules`,
      );
    }
  }

  let ruleRepoints = 0;
  for (const rp of decisions.rulePruning.rePoints) {
    const targetId = resolveId(rp.toCategory);
    const pats = new Set(rp.patterns.map((p) => p.toLowerCase()));
    for (const r of survivors) {
      if (keepAsIsByPattern.has(r.pattern.toLowerCase())) continue;
      if (pats.has(r.pattern.toLowerCase()) && r.categoryId !== targetId) {
        ops.push({
          kind: "repointRule",
          ruleId: r.id,
          pattern: r.pattern,
          fromName: idToName.get(r.categoryId) ?? r.categoryId,
          toName: rp.toCategory,
        });
        r.categoryId = targetId;
        ruleRepoints++;
      }
    }
  }

  let leftoverInDeleted = 0;
  let categoryDeletions = 0;
  for (const d of decisions.taxonomy.deletions) {
    if (!nameToId.has(d.name)) continue;
    const id = nameToId.get(d.name)!;
    let leftover = 0;
    for (const cid of txnCat.values()) if (cid === id) leftover++;
    ops.push({ kind: "deleteCategory", name: d.name, leftoverTxnCount: leftover });
    leftoverInDeleted += leftover;
    nameToId.delete(d.name);
    idToName.delete(id);
    categoryDeletions++;
  }

  const summary: PlanSummary = {
    categoriesBefore: categories.length,
    categoriesAfter: nameToId.size,
    rulesBefore: rules.length,
    rulesAfter: survivors.length,
    renames: renameCount,
    merges: mergeCount,
    additions: additionCount,
    categoryDeletions,
    txnMoves: moveCounts,
    ruleDeletions,
    ruleRepoints,
    leftoverInDeleted,
  };

  return { ops, summary, warnings };
}
