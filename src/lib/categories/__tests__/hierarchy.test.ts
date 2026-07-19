import { describe, it, expect } from "vitest";
import {
  emptyPopulation,
  isPopulated,
  validateCategoryCreate,
  validateCategoryUpdate,
  buildCategoryTree,
  buildGroupLeafIndex,
  filterAssignable,
  firstAssignableCategoryId,
  type CategoryNode,
  type CategoryPopulation,
} from "../hierarchy";
import {
  CategoryTypeMismatchError,
  DuplicateCategoryNameError,
  HierarchyDepthError,
  LinkedTypeChangeError,
  ParentNotFoundError,
  PopulatedCategoryError,
} from "../errors";

const node = (
  override: Partial<CategoryNode> & Pick<CategoryNode, "id" | "name">,
): CategoryNode => ({
  type: "expense",
  parentId: null,
  ...override,
});

const populated = (override: Partial<CategoryPopulation>): CategoryPopulation => ({
  ...emptyPopulation(),
  ...override,
});

// Fixture: one expense group with two leaves, one expense root leaf, one income root leaf.
const group = node({ id: "g1", name: "אוכל" });
const leafA = node({ id: "l1", name: "מזון וסופר", parentId: "g1" });
const leafB = node({ id: "l2", name: "מסעדות וקפה", parentId: "g1" });
const rootLeaf = node({ id: "l3", name: "תחבורה" });
const incomeLeaf = node({ id: "l4", name: "משכורת", type: "income" });
const all = [group, leafA, leafB, rootLeaf, incomeLeaf];

describe("isPopulated", () => {
  it("is false for the empty population", () => {
    expect(isPopulated(emptyPopulation())).toBe(false);
  });

  it.each([
    ["transactions", { transactions: 1 }],
    ["rules", { rules: 1 }],
    ["memory entries", { memoryEntries: 1 }],
    ["pending suggestions", { pendingSuggestions: 1 }],
    ["budgets", { budgets: 1 }],
  ] as const)("is true when %s exist", (_source, partial) => {
    expect(isPopulated(populated(partial))).toBe(true);
  });
});

describe("validateCategoryCreate", () => {
  it("accepts a root category with a fresh name", () => {
    expect(() =>
      validateCategoryCreate({ name: "חדש", type: "expense", parentId: null }, all, null),
    ).not.toThrow();
  });

  it("rejects a duplicate name globally, across groups and leaves", () => {
    expect(() =>
      validateCategoryCreate({ name: "אוכל", type: "expense", parentId: null }, all, null),
    ).toThrow(DuplicateCategoryNameError);
    expect(() =>
      validateCategoryCreate({ name: "תחבורה", type: "expense", parentId: null }, all, null),
    ).toThrow(DuplicateCategoryNameError);
  });

  it("accepts a new leaf under an empty root group of the same type", () => {
    expect(() =>
      validateCategoryCreate(
        { name: "חדש", type: "expense", parentId: "g1" },
        all,
        emptyPopulation(),
      ),
    ).not.toThrow();
  });

  it("rejects an unknown parent id", () => {
    expect(() =>
      validateCategoryCreate({ name: "חדש", type: "expense", parentId: "missing" }, all, null),
    ).toThrow(ParentNotFoundError);
  });

  it("rejects a parent that is itself a child (depth cap)", () => {
    expect(() =>
      validateCategoryCreate(
        { name: "חדש", type: "expense", parentId: "l1" },
        all,
        emptyPopulation(),
      ),
    ).toThrow(HierarchyDepthError);
  });

  it("rejects a parent of a different type", () => {
    expect(() =>
      validateCategoryCreate(
        { name: "חדש", type: "income", parentId: "g1" },
        all,
        emptyPopulation(),
      ),
    ).toThrow(CategoryTypeMismatchError);
  });

  it.each([
    ["transactions", { transactions: 3 }],
    ["rules", { rules: 1 }],
    ["memory entries", { memoryEntries: 2 }],
    ["pending suggestions", { pendingSuggestions: 1 }],
    ["budgets", { budgets: 1 }],
  ] as const)("rejects a populated parent — %s", (_source, partial) => {
    expect(() =>
      validateCategoryCreate(
        { name: "חדש", type: "expense", parentId: "l3" },
        [...all],
        populated(partial),
      ),
    ).toThrow(PopulatedCategoryError);
  });
});

describe("validateCategoryUpdate", () => {
  it("accepts a rename to a fresh name", () => {
    expect(() => validateCategoryUpdate(leafA, { name: "שם חדש" }, all, null)).not.toThrow();
  });

  it("accepts keeping the same name", () => {
    expect(() => validateCategoryUpdate(leafA, { name: "מזון וסופר" }, all, null)).not.toThrow();
  });

  it("rejects a rename onto another category's name", () => {
    expect(() => validateCategoryUpdate(leafA, { name: "תחבורה" }, all, null)).toThrow(
      DuplicateCategoryNameError,
    );
  });

  it("rejects a type change while the category has a parent", () => {
    expect(() => validateCategoryUpdate(leafA, { type: "income" }, all, null)).toThrow(
      LinkedTypeChangeError,
    );
  });

  it("rejects a type change while the category has children", () => {
    expect(() => validateCategoryUpdate(group, { type: "income" }, all, null)).toThrow(
      LinkedTypeChangeError,
    );
  });

  it("rejects a type change even when the same update detaches the link", () => {
    expect(() =>
      validateCategoryUpdate(leafA, { type: "income", parentId: null }, all, null),
    ).toThrow(LinkedTypeChangeError);
  });

  it("accepts a type change on an unlinked root leaf", () => {
    expect(() => validateCategoryUpdate(rootLeaf, { type: "ignore" }, all, null)).not.toThrow();
  });

  it("accepts gaining a parent: a root leaf may always move under an empty same-type root group", () => {
    expect(() =>
      validateCategoryUpdate(rootLeaf, { parentId: "g1" }, all, emptyPopulation()),
    ).not.toThrow();
  });

  it("accepts detaching back to a root leaf", () => {
    expect(() => validateCategoryUpdate(leafA, { parentId: null }, all, null)).not.toThrow();
  });

  it("rejects a category becoming its own parent", () => {
    expect(() =>
      validateCategoryUpdate(rootLeaf, { parentId: "l3" }, all, emptyPopulation()),
    ).toThrow(HierarchyDepthError);
  });

  it("rejects a parent that is itself a child (depth cap)", () => {
    expect(() =>
      validateCategoryUpdate(rootLeaf, { parentId: "l1" }, all, emptyPopulation()),
    ).toThrow(HierarchyDepthError);
  });

  it("rejects a group gaining a parent (depth cap from the child side)", () => {
    const otherGroup = node({ id: "g2", name: "קבוצה שנייה" });
    expect(() =>
      validateCategoryUpdate(group, { parentId: "g2" }, [...all, otherGroup], emptyPopulation()),
    ).toThrow(HierarchyDepthError);
  });

  it("rejects a parent of a different type", () => {
    expect(() =>
      validateCategoryUpdate(incomeLeaf, { parentId: "g1" }, all, emptyPopulation()),
    ).toThrow(CategoryTypeMismatchError);
  });

  it("rejects an unknown parent id", () => {
    expect(() => validateCategoryUpdate(rootLeaf, { parentId: "missing" }, all, null)).toThrow(
      ParentNotFoundError,
    );
  });

  it.each([
    ["transactions", { transactions: 1 }],
    ["rules", { rules: 2 }],
    ["memory entries", { memoryEntries: 1 }],
    ["pending suggestions", { pendingSuggestions: 4 }],
    ["budgets", { budgets: 1 }],
  ] as const)("rejects a populated category gaining a child — %s", (_source, partial) => {
    const otherExpenseLeaf = node({ id: "l5", name: "קניות וביגוד" });
    expect(() =>
      validateCategoryUpdate(
        otherExpenseLeaf,
        { parentId: "l3" },
        [...all, otherExpenseLeaf],
        populated(partial),
      ),
    ).toThrow(PopulatedCategoryError);
  });

  // BGR8/#177: a budget may attach to a group (subtree spend cap), so a
  // group's own population is no longer always zero once budgets are wired.
  // The populated-parent guard exists to stop a leaf-with-data from being
  // promoted into a group for the first time — it must not re-fire against a
  // category that is already an established group (has children).
  it("accepts a leaf moving under an existing group that itself carries a budget", () => {
    const otherRootLeaf = node({ id: "l5", name: "קניות וביגוד" });
    expect(() =>
      validateCategoryUpdate(
        otherRootLeaf,
        { parentId: "g1" },
        [...all, otherRootLeaf],
        populated({ budgets: 1 }),
      ),
    ).not.toThrow();
  });

  it("accepts creating a new leaf under an existing group that itself carries a budget", () => {
    expect(() =>
      validateCategoryCreate(
        { name: "חדש", type: "expense", parentId: "g1" },
        all,
        populated({ budgets: 1 }),
      ),
    ).not.toThrow();
  });
});

describe("buildCategoryTree", () => {
  it("nests leaves under their group and lists root leaves alongside", () => {
    const tree = buildCategoryTree(all);
    const names = tree.map((n) => n.name);
    expect(names).toContain("אוכל");
    expect(names).toContain("תחבורה");
    expect(names).toContain("משכורת");
    expect(names).not.toContain("מזון וסופר");

    const foodGroup = tree.find((n) => n.id === "g1")!;
    expect(foodGroup.children.map((c) => c.name)).toEqual(["מזון וסופר", "מסעדות וקפה"]);
  });

  it("gives root leaves an empty children list", () => {
    const tree = buildCategoryTree(all);
    expect(tree.find((n) => n.id === "l3")!.children).toEqual([]);
  });

  it("sorts top level and children by name", () => {
    const tree = buildCategoryTree(all);
    expect(tree.map((n) => n.name)).toEqual(
      [...tree.map((n) => n.name)].sort((a, b) => a.localeCompare(b, "he")),
    );
    const foodGroup = tree.find((n) => n.id === "g1")!;
    const childNames = foodGroup.children.map((c) => c.name);
    expect(childNames).toEqual([...childNames].sort((a, b) => a.localeCompare(b, "he")));
  });

  it("returns a flat list unchanged in shape when no groups exist", () => {
    const flat = [rootLeaf, incomeLeaf];
    const tree = buildCategoryTree(flat);
    expect(tree).toHaveLength(2);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });
});

describe("filterAssignable", () => {
  it("returns childless categories only — leaves in groups and root leaves, never groups", () => {
    const assignable = filterAssignable(all);
    expect(assignable.map((c) => c.id).sort()).toEqual(["l1", "l2", "l3", "l4"]);
  });

  it("returns everything when no groups exist", () => {
    expect(filterAssignable([rootLeaf, incomeLeaf])).toHaveLength(2);
  });
});

describe("firstAssignableCategoryId", () => {
  it("picks the alphabetically-first leaf across root leaves and group children, never a group", () => {
    const tree = buildCategoryTree(all);
    // Hebrew order: אוכל(group, skipped) < מזון וסופר < מסעדות וקפה < משכורת < תחבורה
    expect(firstAssignableCategoryId(tree)).toBe("l1");
  });

  it("returns an empty string for an empty tree", () => {
    expect(firstAssignableCategoryId([])).toBe("");
  });

  it("falls back to the only leaf when no groups exist", () => {
    const tree = buildCategoryTree([rootLeaf, incomeLeaf]);
    expect(firstAssignableCategoryId(tree)).toBe("l4");
  });
});

describe("buildGroupLeafIndex", () => {
  it("maps each group to its leaf ids and omits root leaves", () => {
    const index = buildGroupLeafIndex(all);
    expect(index.get("g1")).toEqual(["l1", "l2"]);
    expect(index.has("l3")).toBe(false);
    expect(index.has("l4")).toBe(false);
  });

  it("returns an empty map when there are no groups", () => {
    expect(buildGroupLeafIndex([rootLeaf, incomeLeaf]).size).toBe(0);
  });
});
