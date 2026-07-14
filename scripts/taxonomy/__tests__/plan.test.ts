import { describe, it, expect } from "vitest";
import {
  buildPlan,
  parseProceduralMatch,
  distinctMatchCount,
  type Decisions,
  type CategorySnapshot,
  type RuleSnapshot,
  type TxnSnapshot,
  type PlanOp,
} from "../plan";

// Fixture merchant strings are synthetic ("הדגמה"/"דמו"/"DEMO") — the real
// change set lives in a gitignored private file and must never appear here.

function findOp<K extends PlanOp["kind"]>(
  ops: PlanOp[],
  kind: K,
  extra?: (op: Extract<PlanOp, { kind: K }>) => boolean,
): Extract<PlanOp, { kind: K }> | undefined {
  return ops.find(
    (o): o is Extract<PlanOp, { kind: K }> =>
      o.kind === kind && (!extra || extra(o as Extract<PlanOp, { kind: K }>)),
  );
}

const cat = (name: string, over: Partial<CategorySnapshot> = {}): CategorySnapshot => ({
  id: `id-${name}`,
  name,
  type: "expense",
  icon: "Circle",
  color: "#000000",
  ...over,
});

const rule = (
  id: string,
  categoryId: string,
  pattern: string,
  over: Partial<RuleSnapshot> = {},
): RuleSnapshot => ({
  id,
  categoryId,
  matchType: "contains",
  pattern,
  priority: 0,
  ...over,
});

const txn = (id: string, description: string, categoryId: string | null): TxnSnapshot => ({
  id,
  description,
  categoryId,
  categorySource: null,
});

describe("parseProceduralMatch", () => {
  it("extracts regex source and category name", () => {
    const parsed = parseProceduralMatch(
      "description matches /מזומן דמו|משיכה דמו/ AND current category = אחר",
    );
    expect(parsed.regexSource).toBe("מזומן דמו|משיכה דמו");
    expect(parsed.categoryName).toBe("אחר");
  });
  it("throws on unparseable input", () => {
    expect(() => parseProceduralMatch("nonsense")).toThrow();
  });
});

describe("distinctMatchCount", () => {
  it("counts distinct descriptions a rule matches, capped at 2", () => {
    const r = rule("r1", "c1", "pizza demo");
    const descs = ["PIZZA DEMO tel aviv", "PIZZA DEMO tel aviv", "haifa"];
    expect(distinctMatchCount(r, descs)).toBe(1);
    const descs2 = ["PIZZA DEMO a", "PIZZA DEMO b", "x"];
    expect(distinctMatchCount(r, descs2)).toBe(2);
    expect(distinctMatchCount(rule("r2", "c1", "zzz"), descs2)).toBe(0);
  });
});

function baseDecisions(): Decisions {
  return {
    taxonomy: {
      renames: [
        { from: "רכב ודלק", to: "תחבורה", icon: "Bus" },
        { from: "השקעות", to: "השקעות וחיסכון" },
      ],
      merges: [
        { from: "תחבורה ציבורית", into: "תחבורה" },
        { from: "חיסכון", into: "השקעות וחיסכון" },
      ],
      additions: [{ name: "מזומן ומשיכות", type: "expense", icon: "HandCoins", color: "#78716c" }],
      deletions: [{ name: "אחר" }, { name: "חינוך" }],
    },
    transactionMoves: {
      procedural: [
        {
          match: "description matches /מזומן דמו/ AND current category = אחר",
          to: "מזומן ומשיכות",
          expectedCount: 1,
        },
      ],
      explicit: [{ description: "מסעדת הדגמה", to: "תחבורה" }],
      drugstoreHistorical: { patterns: ["פארם הדגמה"], to: "בריאות וטיפוח" },
      categorySource: "user",
    },
    rulePruning: {
      keepOneMatch: ["PIZZA DEMO"],
      collapses: [
        {
          keep: "מאפיית הדגמה",
          delete: ["מאפיית הדגמה סניף צפון", "מאפיית הדגמה סניף דרום"],
          category: "מסעדות וקפה",
        },
      ],
      rePoints: [{ patterns: ["העברת דמו"], toCategory: "מזומן ומשיכות" }],
      keepAsIs: [{ pattern: "שיק הדגמה", category: "דיור ושכירות" }],
    },
  };
}

function baseCategories(): CategorySnapshot[] {
  return [
    cat("רכב ודלק", { icon: "Car" }),
    cat("תחבורה ציבורית", { icon: "Bus" }),
    cat("השקעות", { type: "investment" }),
    cat("חיסכון", { type: "investment" }),
    cat("בריאות וטיפוח"),
    cat("מסעדות וקפה"),
    cat("דיור ושכירות"),
    cat("העברה פנימית", { type: "transfer" }),
    cat("אחר"),
    cat("חינוך"),
  ];
}

describe("buildPlan — taxonomy", () => {
  it("renames existing categories and lets merges resolve the new name", () => {
    const plan = buildPlan(baseDecisions(), baseCategories(), [], []);
    const renames = plan.ops.filter((o) => o.kind === "renameCategory");
    expect(renames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "רכב ודלק", to: "תחבורה", icon: "Bus" }),
        expect.objectContaining({ from: "השקעות", to: "השקעות וחיסכון" }),
      ]),
    );
  });

  it("creates the new cash category", () => {
    const plan = buildPlan(baseDecisions(), baseCategories(), [], []);
    expect(plan.ops).toContainEqual(
      expect.objectContaining({ kind: "createCategory", name: "מזומן ומשיכות", icon: "HandCoins" }),
    );
  });

  it("merges re-point rules to the target and remove the source category", () => {
    const rules = [rule("r1", "id-תחבורה ציבורית", "אוטובוס דמו")];
    const plan = buildPlan(baseDecisions(), baseCategories(), rules, []);
    const merge = findOp(plan.ops, "mergeCategory", (o) => o.fromName === "תחבורה ציבורית");
    expect(merge).toBeDefined();
    const del = findOp(plan.ops, "deleteRule", (o) => o.ruleId === "r1");
    expect(del).toBeUndefined();
  });

  it("deletes אחר and חינוך at the end", () => {
    const plan = buildPlan(baseDecisions(), baseCategories(), [], []);
    const deletes = plan.ops.filter((o) => o.kind === "deleteCategory").map((o) => o.name);
    expect(deletes).toEqual(expect.arrayContaining(["אחר", "חינוך"]));
    const lastNonDelete = plan.ops.map((o) => o.kind).lastIndexOf("moveTransactions");
    const firstDelete = plan.ops.findIndex((o) => o.kind === "deleteCategory");
    expect(firstDelete).toBeGreaterThan(lastNonDelete);
  });
});

describe("buildPlan — transaction moves", () => {
  it("moves procedurally matched transactions out of the filtered category only", () => {
    const txns = [
      txn("t1", "מזומן דמו סניף 1", "id-אחר"),
      txn("t2", "מזומן דמו", "id-מסעדות וקפה"),
      txn("t3", "קניה רגילה", "id-אחר"),
    ];
    const plan = buildPlan(baseDecisions(), baseCategories(), [], txns);
    const move = findOp(plan.ops, "moveTransactions", (o) => o.toName === "מזומן ומשיכות");
    expect(move?.txIds).toEqual(["t1"]);
  });

  it("moves explicit descriptions by exact match", () => {
    const txns = [txn("t1", "מסעדת הדגמה", "id-אחר"), txn("t2", 'מסעדת הדגמה בע"מ', "id-אחר")];
    const plan = buildPlan(baseDecisions(), baseCategories(), [], txns);
    const move = findOp(plan.ops, "moveTransactions", (o) => o.toName === "תחבורה");
    expect(move?.txIds).toEqual(["t1"]);
  });

  it("moves drugstore transactions by contains match", () => {
    const txns = [txn("t1", "פארם הדגמה סניף מרכז", "id-מסעדות וקפה")];
    const plan = buildPlan(baseDecisions(), baseCategories(), [], txns);
    const move = findOp(plan.ops, "moveTransactions", (o) => o.toName === "בריאות וטיפוח");
    expect(move?.txIds).toEqual(["t1"]);
  });
});

describe("buildPlan — rule pruning", () => {
  it("dedupes exact duplicate rules keeping one", () => {
    const rules = [
      rule("r1", "id-מסעדות וקפה", "קצביית הדגמה"),
      rule("r2", "id-מסעדות וקפה", "קצביית הדגמה"),
    ];
    const plan = buildPlan(baseDecisions(), baseCategories(), rules, []);
    const dels = plan.ops.filter((o) => o.kind === "deleteRule" && o.reason.includes("duplicate"));
    expect(dels).toHaveLength(1);
  });

  it("deletes one-match rules but keeps the keepOneMatch list and zero/multi", () => {
    const rules = [
      rule("one", "id-מסעדות וקפה", "onlyonce"),
      rule("pizza", "id-מסעדות וקפה", "PIZZA DEMO"),
      rule("zero", "id-מסעדות וקפה", "neverseen"),
      rule("multi", "id-מסעדות וקפה", "shared"),
    ];
    const txns = [
      txn("a", "onlyonce cafe", null),
      txn("b", "PIZZA DEMO tlv", null),
      txn("c", "shared alpha", null),
      txn("d", "shared beta", null),
    ];
    const plan = buildPlan(baseDecisions(), baseCategories(), rules, txns);
    const deleted = new Set(
      plan.ops
        .filter((o) => o.kind === "deleteRule")
        .map((o) => (o.kind === "deleteRule" ? o.ruleId : "")),
    );
    expect(deleted.has("one")).toBe(true);
    expect(deleted.has("pizza")).toBe(false);
    expect(deleted.has("zero")).toBe(false);
    expect(deleted.has("multi")).toBe(false);
  });

  it("deletes rules pointing at a deleted category", () => {
    const rules = [rule("edu", "id-חינוך", "קורס הדגמה")];
    const plan = buildPlan(baseDecisions(), baseCategories(), rules, []);
    const del = findOp(plan.ops, "deleteRule", (o) => o.ruleId === "edu");
    expect(del).toBeDefined();
  });

  it("collapses branch rules into the kept chain rule", () => {
    const rules = [
      rule("keep", "id-מסעדות וקפה", "מאפיית הדגמה"),
      rule("branch", "id-מסעדות וקפה", "מאפיית הדגמה סניף צפון"),
    ];
    const plan = buildPlan(baseDecisions(), baseCategories(), rules, []);
    const delBranch = findOp(plan.ops, "deleteRule", (o) => o.ruleId === "branch");
    expect(delBranch?.reason).toContain("collapse");
    const delKeep = findOp(plan.ops, "deleteRule", (o) => o.ruleId === "keep");
    expect(delKeep).toBeUndefined();
  });

  it("re-points rules per the taxonomy", () => {
    const rules = [rule("p2p", "id-העברה פנימית", "העברת דמו")];
    const plan = buildPlan(baseDecisions(), baseCategories(), rules, []);
    const repoint = findOp(plan.ops, "repointRule", (o) => o.ruleId === "p2p");
    expect(repoint?.toName).toBe("מזומן ומשיכות");
  });
});

describe("buildPlan — keepAsIs", () => {
  it("exempts keepAsIs rules from one-match deletion", () => {
    const rules = [rule("check", "id-דיור ושכירות", "שיק הדגמה")];
    const txns = [txn("a", "שיק הדגמה 123", null)];
    const plan = buildPlan(baseDecisions(), baseCategories(), rules, txns);
    expect(findOp(plan.ops, "deleteRule", (o) => o.ruleId === "check")).toBeUndefined();
    expect(plan.summary.rulesAfter).toBe(1);
    expect(plan.warnings).toHaveLength(0);
  });

  it("exempts keepAsIs rules from re-points", () => {
    const decisions = baseDecisions();
    decisions.rulePruning.rePoints = [{ patterns: ["שיק הדגמה"], toCategory: "מזומן ומשיכות" }];
    const rules = [rule("check", "id-דיור ושכירות", "שיק הדגמה")];
    const plan = buildPlan(decisions, baseCategories(), rules, []);
    expect(findOp(plan.ops, "repointRule", (o) => o.ruleId === "check")).toBeUndefined();
  });

  it("warns when a keepAsIs rule points at a different category than stated", () => {
    const rules = [rule("check", "id-מסעדות וקפה", "שיק הדגמה")];
    const plan = buildPlan(baseDecisions(), baseCategories(), rules, []);
    expect(findOp(plan.ops, "deleteRule", (o) => o.ruleId === "check")).toBeUndefined();
    expect(plan.warnings.some((w) => w.includes("שיק הדגמה"))).toBe(true);
  });

  it("warns when a keepAsIs rule is missing entirely", () => {
    const plan = buildPlan(baseDecisions(), baseCategories(), [], []);
    expect(plan.warnings.some((w) => w.includes("not found"))).toBe(true);
  });
});

describe("buildPlan — idempotency", () => {
  it("produces no structural ops when run against an already-migrated snapshot", () => {
    const migrated: CategorySnapshot[] = [
      cat("תחבורה", { icon: "Bus" }),
      cat("השקעות וחיסכון", { type: "investment" }),
      cat("בריאות וטיפוח"),
      cat("מסעדות וקפה"),
      cat("דיור ושכירות"),
      cat("העברה פנימית", { type: "transfer" }),
      cat("מזומן ומשיכות", { icon: "HandCoins", color: "#78716c" }),
    ];
    const plan = buildPlan(baseDecisions(), migrated, [], []);
    expect(plan.ops.filter((o) => o.kind === "renameCategory")).toHaveLength(0);
    expect(plan.ops.filter((o) => o.kind === "createCategory")).toHaveLength(0);
    expect(plan.ops.filter((o) => o.kind === "mergeCategory")).toHaveLength(0);
    expect(plan.ops.filter((o) => o.kind === "deleteCategory")).toHaveLength(0);
  });
});
