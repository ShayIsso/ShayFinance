import { describe, it, expect } from "vitest";
import {
  createBudgetWithStore,
  updateBudgetWithStore,
  deleteBudgetWithStore,
  type BudgetStore,
  type StoredBudget,
} from "../store";
import { DuplicateBudgetCategoryError, NonExpenseBudgetCategoryError } from "../errors";

type CategoryType = "income" | "expense" | "investment" | "transfer" | "ignore";

/**
 * In-memory BudgetStore fake — never mocks Drizzle. `removeCategory` models the
 * DB `ON DELETE CASCADE`: dropping a category drops its budget, the behavior
 * BGR8's delete-confirm dialog warns about.
 */
function makeStore(
  seedBudgets: StoredBudget[] = [],
  categoryTypes: Record<string, CategoryType> = { food: "expense" },
) {
  const budgets = seedBudgets.map((b) => ({ ...b }));
  const types = { ...categoryTypes };
  let nextId = 1000;

  const store: BudgetStore = {
    async listBudgets() {
      return budgets.map((b) => ({ ...b }));
    },
    async getById(id) {
      const found = budgets.find((b) => b.id === id);
      return found ? { ...found } : null;
    },
    async getByCategoryId(categoryId) {
      const found = budgets.find((b) => b.categoryId === categoryId);
      return found ? { ...found } : null;
    },
    async getCategoryType(categoryId) {
      return types[categoryId] ?? null;
    },
    async insert(data) {
      const id = `new-${nextId++}`;
      budgets.push({ id, ...data });
      return id;
    },
    async update(id, changes) {
      const row = budgets.find((b) => b.id === id);
      if (row) row.monthlyLimit = changes.monthlyLimit;
    },
    async remove(id) {
      const i = budgets.findIndex((b) => b.id === id);
      if (i >= 0) budgets.splice(i, 1);
    },
  };

  const removeCategory = (categoryId: string) => {
    delete types[categoryId];
    for (let i = budgets.length - 1; i >= 0; i--) {
      if (budgets[i].categoryId === categoryId) budgets.splice(i, 1);
    }
  };

  return { store, budgets, removeCategory };
}

describe("createBudgetWithStore", () => {
  it("inserts a budget on an expense category and returns its id", async () => {
    const { store, budgets } = makeStore();
    const id = await createBudgetWithStore({ categoryId: "food", monthlyLimit: 2000 }, store);
    expect(budgets.find((b) => b.id === id)).toMatchObject({
      categoryId: "food",
      monthlyLimit: 2000,
    });
  });

  it("rejects a non-expense category", async () => {
    const { store, budgets } = makeStore([], { salary: "income", moving: "transfer" });
    await expect(
      createBudgetWithStore({ categoryId: "salary", monthlyLimit: 100 }, store),
    ).rejects.toBeInstanceOf(NonExpenseBudgetCategoryError);
    await expect(
      createBudgetWithStore({ categoryId: "moving", monthlyLimit: 100 }, store),
    ).rejects.toBeInstanceOf(NonExpenseBudgetCategoryError);
    expect(budgets).toHaveLength(0);
  });

  it("rejects a category that does not exist", async () => {
    const { store } = makeStore([], {});
    await expect(
      createBudgetWithStore({ categoryId: "ghost", monthlyLimit: 100 }, store),
    ).rejects.toBeInstanceOf(NonExpenseBudgetCategoryError);
  });

  it("enforces one budget per category", async () => {
    const { store, budgets } = makeStore([{ id: "b1", categoryId: "food", monthlyLimit: 2000 }]);
    await expect(
      createBudgetWithStore({ categoryId: "food", monthlyLimit: 3000 }, store),
    ).rejects.toBeInstanceOf(DuplicateBudgetCategoryError);
    expect(budgets).toHaveLength(1);
  });

  it("allows budgets on different categories", async () => {
    const { store, budgets } = makeStore([], { food: "expense", rent: "expense" });
    await createBudgetWithStore({ categoryId: "food", monthlyLimit: 2000 }, store);
    await createBudgetWithStore({ categoryId: "rent", monthlyLimit: 5000 }, store);
    expect(budgets).toHaveLength(2);
  });

  it("allows a parent and a child budget to coexist (group + leaf)", async () => {
    const { store, budgets } = makeStore([], { food: "expense", restaurants: "expense" });
    await createBudgetWithStore({ categoryId: "food", monthlyLimit: 2000 }, store);
    await createBudgetWithStore({ categoryId: "restaurants", monthlyLimit: 800 }, store);
    expect(budgets).toHaveLength(2);
  });
});

describe("updateBudgetWithStore", () => {
  it("changes the monthly limit through the store", async () => {
    const { store, budgets } = makeStore([{ id: "b1", categoryId: "food", monthlyLimit: 2000 }]);
    await updateBudgetWithStore("b1", { monthlyLimit: 2500 }, store);
    expect(budgets.find((b) => b.id === "b1")!.monthlyLimit).toBe(2500);
  });

  it("is a no-op for an unknown id", async () => {
    const { store, budgets } = makeStore();
    await updateBudgetWithStore("missing", { monthlyLimit: 1 }, store);
    expect(budgets).toHaveLength(0);
  });
});

describe("deleteBudgetWithStore", () => {
  it("removes an existing budget", async () => {
    const { store, budgets } = makeStore([{ id: "b1", categoryId: "food", monthlyLimit: 2000 }]);
    await deleteBudgetWithStore("b1", store);
    expect(budgets.find((b) => b.id === "b1")).toBeUndefined();
  });

  it("is a no-op for an unknown id", async () => {
    const { store } = makeStore();
    await expect(deleteBudgetWithStore("missing", store)).resolves.toBeUndefined();
  });
});

describe("budget cascade on category delete", () => {
  it("drops a category's budget when the category is deleted (ON DELETE CASCADE)", async () => {
    const { store, budgets, removeCategory } = makeStore([
      { id: "b1", categoryId: "food", monthlyLimit: 2000 },
    ]);
    removeCategory("food");
    expect(budgets.find((b) => b.categoryId === "food")).toBeUndefined();
    // The category is gone with its budget — BGR8's confirm dialog surfaces this
    // via getBudgetForCategory before the delete.
    expect(await store.getByCategoryId("food")).toBeNull();
  });
});
