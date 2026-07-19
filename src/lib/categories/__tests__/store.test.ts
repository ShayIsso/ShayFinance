import { describe, it, expect } from "vitest";
import {
  createCategoryWithStore,
  updateCategoryWithStore,
  deleteCategoryWithStore,
  getCategoryTreeWithStore,
  getAssignableCategoriesWithStore,
  type CategoryStore,
  type StoredCategory,
} from "../store";
import { emptyPopulation, isPopulated, type CategoryPopulation } from "../hierarchy";
import {
  CategoryTypeMismatchError,
  DefaultCategoryDeletionError,
  DuplicateCategoryNameError,
  HierarchyDepthError,
  PopulatedCategoryError,
} from "../errors";

type Txn = { id: string; categoryId: string | null };
type Rule = { id: string; categoryId: string };
type MemoryEntry = { id: string; categoryId: string };

/**
 * In-memory CategoryStore + parallel transactions/rules/memory tables, so a
 * test can assert that a category operation left those rows untouched.
 * Population is derived from the transactions table plus per-category
 * overrides for the other population sources (rules, memory, suggestions,
 * budgets) — the overrides are counts only; `rules`/`memoryEntries` below are
 * real rows a deletion test can assert against directly, matching the
 * transactions table's role.
 */
function makeStore(
  seed: StoredCategory[],
  opts: {
    transactions?: Txn[];
    rules?: Rule[];
    memoryEntries?: MemoryEntry[];
    populationOverrides?: Record<string, Partial<CategoryPopulation>>;
  } = {},
) {
  const categories = seed.map((c) => ({ ...c }));
  const transactions = (opts.transactions ?? []).map((t) => ({ ...t }));
  const rules = (opts.rules ?? []).map((r) => ({ ...r }));
  const memoryEntries = (opts.memoryEntries ?? []).map((m) => ({ ...m }));
  const overrides = opts.populationOverrides ?? {};
  let nextId = 1000;

  const store: CategoryStore = {
    async listCategories() {
      return categories.map((c) => ({ ...c }));
    },
    async getById(id) {
      const found = categories.find((c) => c.id === id);
      return found ? { ...found } : null;
    },
    async getPopulation(id) {
      const txnCount = transactions.filter((t) => t.categoryId === id).length;
      const ruleCount = rules.filter((r) => r.categoryId === id).length;
      const memoryCount = memoryEntries.filter((m) => m.categoryId === id).length;
      return {
        ...emptyPopulation(),
        ...overrides[id],
        transactions: txnCount,
        rules: ruleCount,
        memoryEntries: memoryCount,
      };
    },
    async insert(data) {
      const id = `new-${nextId++}`;
      categories.push({ id, isDefault: false, ...data });
      return id;
    },
    async update(id, changes) {
      const row = categories.find((c) => c.id === id);
      if (row) Object.assign(row, changes);
    },
    async detachChildren(parentId) {
      for (const c of categories) if (c.parentId === parentId) c.parentId = null;
    },
    async remove(id) {
      const i = categories.findIndex((c) => c.id === id);
      if (i >= 0) categories.splice(i, 1);
    },
  };

  return { store, categories, transactions, rules, memoryEntries };
}

const cat = (
  override: Partial<StoredCategory> & Pick<StoredCategory, "id" | "name">,
): StoredCategory => ({
  type: "expense",
  icon: "ShoppingCart",
  color: "#f59e0b",
  isDefault: false,
  parentId: null,
  ...override,
});

const baseSeed = (): StoredCategory[] => [
  cat({ id: "g1", name: "אוכל" }),
  cat({ id: "l1", name: "מזון וסופר", parentId: "g1" }),
  cat({ id: "l2", name: "מסעדות וקפה", parentId: "g1" }),
  cat({ id: "l3", name: "תחבורה" }),
  cat({ id: "l4", name: "משכורת", type: "income" }),
];

describe("getCategoryTreeWithStore", () => {
  it("nests leaves under their group and lists root leaves alongside", async () => {
    const { store } = makeStore(baseSeed());
    const tree = await getCategoryTreeWithStore(store);

    const g1 = tree.find((n) => n.id === "g1")!;
    expect(g1.children.map((c) => c.name)).toEqual(["מזון וסופר", "מסעדות וקפה"]);
    expect(tree.map((n) => n.id)).toContain("l3");
    expect(tree.map((n) => n.id)).toContain("l4");
    expect(tree.map((n) => n.id)).not.toContain("l1");
    expect(tree.find((n) => n.id === "l3")!.children).toEqual([]);
  });
});

describe("getAssignableCategoriesWithStore", () => {
  it("returns childless categories only, never a group", async () => {
    const { store } = makeStore(baseSeed());
    const assignable = await getAssignableCategoriesWithStore(store);
    expect(assignable.map((c) => c.id).sort()).toEqual(["l1", "l2", "l3", "l4"]);
  });
});

describe("deleteCategoryWithStore", () => {
  it("detaches a group's children back to root leaves and touches no transaction", async () => {
    const txns: Txn[] = [
      { id: "t1", categoryId: "l1" },
      { id: "t2", categoryId: "l2" },
    ];
    const { store, categories, transactions } = makeStore(baseSeed(), { transactions: txns });

    await deleteCategoryWithStore("g1", store);

    expect(categories.find((c) => c.id === "g1")).toBeUndefined();
    expect(categories.find((c) => c.id === "l1")!.parentId).toBeNull();
    expect(categories.find((c) => c.id === "l2")!.parentId).toBeNull();
    expect(transactions).toEqual(txns);
  });

  it("detaches a group's children and leaves their rules and merchant-memory entries untouched (issue #161)", async () => {
    const rules: Rule[] = [{ id: "r1", categoryId: "l1" }];
    const memoryEntries: MemoryEntry[] = [{ id: "m1", categoryId: "l2" }];
    const {
      store,
      categories,
      rules: storedRules,
      memoryEntries: storedMemory,
    } = makeStore(baseSeed(), { rules, memoryEntries });

    await deleteCategoryWithStore("g1", store);

    expect(categories.find((c) => c.id === "g1")).toBeUndefined();
    expect(categories.find((c) => c.id === "l1")!.parentId).toBeNull();
    expect(categories.find((c) => c.id === "l2")!.parentId).toBeNull();
    expect(storedRules).toEqual(rules);
    expect(storedMemory).toEqual(memoryEntries);
  });

  it("blocks deleting a default category", async () => {
    const { store } = makeStore([cat({ id: "d1", name: "ברירת מחדל", isDefault: true })]);
    await expect(deleteCategoryWithStore("d1", store)).rejects.toBeInstanceOf(
      DefaultCategoryDeletionError,
    );
  });
});

describe("createCategoryWithStore", () => {
  it("inserts a valid root category and returns its id", async () => {
    const { store, categories } = makeStore(baseSeed());
    const id = await createCategoryWithStore(
      { name: "בריאות וטיפוח", type: "expense", icon: "Heart", color: "#ef4444", parentId: null },
      store,
    );
    expect(categories.find((c) => c.id === id)).toBeTruthy();
  });

  it("rejects a duplicate name before inserting", async () => {
    const { store, categories } = makeStore(baseSeed());
    const before = categories.length;
    await expect(
      createCategoryWithStore(
        { name: "תחבורה", type: "expense", icon: "Bus", color: "#6366f1", parentId: null },
        store,
      ),
    ).rejects.toBeInstanceOf(DuplicateCategoryNameError);
    expect(categories).toHaveLength(before);
  });

  it("rejects a child under a populated parent", async () => {
    const { store } = makeStore(baseSeed(), { transactions: [{ id: "t1", categoryId: "l3" }] });
    await expect(
      createCategoryWithStore(
        { name: "דלק", type: "expense", icon: "Car", color: "#6366f1", parentId: "l3" },
        store,
      ),
    ).rejects.toBeInstanceOf(PopulatedCategoryError);
  });

  // #177: getPopulation now counts real budget rows — a budgeted leaf must
  // block a child the same way a leaf with transactions/rules already does.
  it("rejects a child under a budgeted leaf", async () => {
    const { store } = makeStore(baseSeed(), { populationOverrides: { l3: { budgets: 1 } } });
    await expect(
      createCategoryWithStore(
        { name: "דלק", type: "expense", icon: "Car", color: "#6366f1", parentId: "l3" },
        store,
      ),
    ).rejects.toBeInstanceOf(PopulatedCategoryError);
  });

  // BGR8: a budget may also attach to a group. Once a category already has
  // children it is an established group, and its own budget must not block
  // further leaves from moving in underneath it.
  it("accepts a new leaf under an existing group that carries its own budget", async () => {
    const { store, categories } = makeStore(baseSeed(), {
      populationOverrides: { g1: { budgets: 1 } },
    });
    const id = await createCategoryWithStore(
      { name: "חטיפים", type: "expense", icon: "ShoppingCart", color: "#6366f1", parentId: "g1" },
      store,
    );
    expect(categories.find((c) => c.id === id)).toMatchObject({ parentId: "g1" });
  });
});

describe("updateCategoryWithStore", () => {
  it("moves a root leaf under an empty same-type group", async () => {
    const { store, categories } = makeStore([
      cat({ id: "g1", name: "אוכל" }),
      cat({ id: "l3", name: "תחבורה" }),
    ]);
    await updateCategoryWithStore("l3", { parentId: "g1" }, store);
    expect(categories.find((c) => c.id === "l3")!.parentId).toBe("g1");
  });

  it("rejects a cross-type link", async () => {
    const { store } = makeStore(baseSeed());
    await expect(updateCategoryWithStore("l4", { parentId: "g1" }, store)).rejects.toBeInstanceOf(
      CategoryTypeMismatchError,
    );
  });

  it("rejects linking under a leaf (depth cap)", async () => {
    const { store } = makeStore(baseSeed());
    await expect(updateCategoryWithStore("l3", { parentId: "l1" }, store)).rejects.toBeInstanceOf(
      HierarchyDepthError,
    );
  });

  // BGR8/#177: moving a leaf into an existing budgeted group must still
  // succeed — the group's own budget is not a fresh "populated leaf" case.
  it("moves a leaf under an existing group that carries its own budget", async () => {
    const { store, categories } = makeStore(baseSeed(), {
      populationOverrides: { g1: { budgets: 1 } },
    });
    await updateCategoryWithStore("l3", { parentId: "g1" }, store);
    expect(categories.find((c) => c.id === "l3")!.parentId).toBe("g1");
  });

  it("passes icon/color changes through to the store", async () => {
    const { store, categories } = makeStore(baseSeed());
    await updateCategoryWithStore("l3", { icon: "Bus", color: "#111111" }, store);
    const row = categories.find((c) => c.id === "l3")!;
    expect(row.icon).toBe("Bus");
    expect(row.color).toBe("#111111");
  });
});

describe("isPopulated wiring", () => {
  it("treats the empty population as unpopulated", () => {
    expect(isPopulated(emptyPopulation())).toBe(false);
  });
});
