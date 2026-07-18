/**
 * Typed errors on the budgets module's public interface.
 *
 * Kept in a dedicated module (no DB imports) so action boundaries and tests can
 * import the real class even when "@/lib/budgets" itself is mocked.
 */

/** A budget may only attach to an `expense`-type category (decision record #105 §10). */
export class NonExpenseBudgetCategoryError extends Error {
  constructor() {
    super("A budget can only be attached to an expense-type category");
    this.name = "NonExpenseBudgetCategoryError";
  }
}

/** One budget per category (decision record #105 §1; DB `uq_budget_category`). */
export class DuplicateBudgetCategoryError extends Error {
  constructor() {
    super("This category already has a budget");
    this.name = "DuplicateBudgetCategoryError";
  }
}
