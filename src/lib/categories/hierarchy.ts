/**
 * Pure hierarchy layer for the categories module (ADR-0011: one level, typed
 * links, leaf-only assignment). No DB imports — every write invariant is a pure
 * function the store composes before touching the database, and every read
 * shape is derived here from a flat category list.
 */
import {
  CategoryTypeMismatchError,
  DuplicateCategoryNameError,
  HierarchyDepthError,
  LinkedTypeChangeError,
  ParentNotFoundError,
  PopulatedCategoryError,
} from "./errors";

export type CategoryType = "income" | "expense" | "investment" | "transfer" | "ignore";

/** The minimal shape the hierarchy rules reason over — the load-bearing fields. */
export type CategoryNode = {
  id: string;
  name: string;
  type: CategoryType;
  parentId: string | null;
};

export type CategoryTreeNode<T extends CategoryNode = CategoryNode> = T & {
  children: T[];
};

/**
 * Everything that makes a category "populated" (ADR-0011 §5). A populated
 * category cannot gain a child; `budgets` counts rows on `budgets.category_id`
 * (BGR8 wired the store count — a group's own budget is exempted from this
 * guard once it already has children, see `assertValidParentLink`).
 */
export type CategoryPopulation = {
  transactions: number;
  rules: number;
  memoryEntries: number;
  pendingSuggestions: number;
  budgets: number;
};

export function emptyPopulation(): CategoryPopulation {
  return { transactions: 0, rules: 0, memoryEntries: 0, pendingSuggestions: 0, budgets: 0 };
}

export function isPopulated(pop: CategoryPopulation): boolean {
  return (
    pop.transactions > 0 ||
    pop.rules > 0 ||
    pop.memoryEntries > 0 ||
    pop.pendingSuggestions > 0 ||
    pop.budgets > 0
  );
}

function byNameHe(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, "he");
}

function assertNameAvailable(name: string, all: CategoryNode[], exceptId?: string): void {
  if (all.some((c) => c.id !== exceptId && c.name === name)) {
    throw new DuplicateCategoryNameError();
  }
}

/**
 * Validate a prospective parent link from a child's perspective. `childId` is
 * the id of the category being linked (undefined on create, where no id exists
 * yet); `childHasChildren` is whether that category already owns children (a
 * group can never gain a parent — depth cap from the child side).
 * `parentPopulation` is the population of the target parent: a populated leaf
 * cannot gain a child (ADR-0011 §5) — this is a one-time promotion guard, not
 * a standing cap. A parent that already has children is already an
 * established group; a budget attached to the group itself (BGR8: group
 * budgets measure subtree spend) must not re-trigger the guard and block
 * ordinary membership changes, so the population check only fires the first
 * time a childless category is about to gain a child.
 */
function assertValidParentLink(
  parentId: string,
  childType: CategoryType,
  all: CategoryNode[],
  parentPopulation: CategoryPopulation | null,
  opts: { childId?: string; childHasChildren: boolean },
): void {
  if (opts.childId !== undefined && parentId === opts.childId) {
    throw new HierarchyDepthError();
  }
  const parent = all.find((c) => c.id === parentId);
  if (!parent) throw new ParentNotFoundError();
  if (parent.parentId !== null) throw new HierarchyDepthError();
  if (opts.childHasChildren) throw new HierarchyDepthError();
  if (parent.type !== childType) throw new CategoryTypeMismatchError();
  const parentAlreadyHasChildren = all.some((c) => c.parentId === parentId);
  if (!parentAlreadyHasChildren && parentPopulation !== null && isPopulated(parentPopulation)) {
    throw new PopulatedCategoryError();
  }
}

/**
 * Guard a category creation. `parentPopulation` is the population of the parent
 * named by `input.parentId` (null when creating a root, or when the caller has
 * already established the parent is empty).
 */
export function validateCategoryCreate(
  input: { name: string; type: CategoryType; parentId: string | null },
  all: CategoryNode[],
  parentPopulation: CategoryPopulation | null,
): void {
  assertNameAvailable(input.name, all);
  if (input.parentId !== null) {
    assertValidParentLink(input.parentId, input.type, all, parentPopulation, {
      childHasChildren: false,
    });
  }
}

/**
 * Guard a category update. `changes` carries only the fields being written.
 * `parentPopulation` is the population of the *new* parent when `parentId` is
 * being set to a non-null value (gaining a parent is safe regardless of the
 * child's own population — only the parent-side leaf must be empty).
 */
export function validateCategoryUpdate(
  current: CategoryNode,
  changes: Partial<{ name: string; type: CategoryType; parentId: string | null }>,
  all: CategoryNode[],
  parentPopulation: CategoryPopulation | null,
): void {
  if (changes.name !== undefined && changes.name !== current.name) {
    assertNameAvailable(changes.name, all, current.id);
  }

  const hasChildren = all.some((c) => c.parentId === current.id);
  const isLinked = hasChildren || current.parentId !== null;
  if (changes.type !== undefined && changes.type !== current.type && isLinked) {
    throw new LinkedTypeChangeError();
  }

  if ("parentId" in changes && changes.parentId != null) {
    const resultingType = changes.type ?? current.type;
    assertValidParentLink(changes.parentId, resultingType, all, parentPopulation, {
      childId: current.id,
      childHasChildren: hasChildren,
    });
  }
}

/**
 * Tree read surface (ADR-0011 §4): groups with their leaves nested beneath, and
 * root leaves alongside at the top level. Top level and children are each
 * sorted by Hebrew collation.
 */
export function buildCategoryTree<T extends CategoryNode>(all: T[]): CategoryTreeNode<T>[] {
  const childrenOf = (id: string): T[] => all.filter((c) => c.parentId === id).sort(byNameHe);

  return all
    .filter((c) => c.parentId === null)
    .sort(byNameHe)
    .map((c) => ({ ...c, children: childrenOf(c.id) }));
}

/**
 * Group → its leaves' ids (ADR-0011: one level, so a group's children are
 * always leaves). Root leaves are absent — a caller expanding by id treats a
 * missing entry as "matches itself only". Drives subtree filtering (#174): a
 * group is never assigned to a transaction, so filtering by a group means
 * filtering by its leaves — an aggregation-lens read that changes which rows
 * list, never any total.
 */
export function buildGroupLeafIndex(
  all: { id: string; parentId: string | null }[],
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const c of all) {
    if (c.parentId !== null) {
      const leaves = index.get(c.parentId) ?? [];
      leaves.push(c.id);
      index.set(c.parentId, leaves);
    }
  }
  return index;
}

/**
 * Assignable read surface (ADR-0011 §3): childless categories only. Binds every
 * assignment surface — a category with children is not assignable, derived
 * purely from "has children", never a flag.
 */
export function filterAssignable<T extends CategoryNode>(all: T[]): T[] {
  const parentIds = new Set(all.map((c) => c.parentId).filter((id): id is string => id !== null));
  return all.filter((c) => !parentIds.has(c.id));
}

/**
 * A sane default for a fresh assignment form (rules authoring): the
 * alphabetically-first leaf across the whole tree — root leaves and every
 * group's children pooled together, a group itself never a candidate
 * (ADR-0011 §3). Empty tree (no categories yet) yields "".
 */
export function firstAssignableCategoryId<T extends CategoryNode>(
  tree: CategoryTreeNode<T>[],
): string {
  const leaves = tree.flatMap((node) => (node.children.length > 0 ? node.children : [node]));
  return [...leaves].sort(byNameHe)[0]?.id ?? "";
}
