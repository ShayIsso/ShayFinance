/**
 * Typed errors on the categories module's public interface.
 *
 * Kept in a dedicated module (no DB imports) so action boundaries and tests
 * can import the real class even when "@/lib/categories" itself is mocked.
 */
export class DefaultCategoryDeletionError extends Error {
  constructor() {
    super("Cannot delete a default category");
    this.name = "DefaultCategoryDeletionError";
  }
}

// Hierarchy write invariants (ADR-0011). Thrown by the pure validators in
// hierarchy.ts and surfaced through the module's write operations.

export class HierarchyDepthError extends Error {
  constructor() {
    super("Hierarchy is capped at one level: a parent must be a root category");
    this.name = "HierarchyDepthError";
  }
}

export class CategoryTypeMismatchError extends Error {
  constructor() {
    super("A parent-child link requires the same category type on both ends");
    this.name = "CategoryTypeMismatchError";
  }
}

export class LinkedTypeChangeError extends Error {
  constructor() {
    super("Cannot change the type of a category while it participates in a parent-child link");
    this.name = "LinkedTypeChangeError";
  }
}

export class PopulatedCategoryError extends Error {
  constructor() {
    super("A populated category cannot gain a child");
    this.name = "PopulatedCategoryError";
  }
}

export class DuplicateCategoryNameError extends Error {
  constructor() {
    super("Category names are globally unique");
    this.name = "DuplicateCategoryNameError";
  }
}

export class ParentNotFoundError extends Error {
  constructor() {
    super("Parent category does not exist");
    this.name = "ParentNotFoundError";
  }
}
