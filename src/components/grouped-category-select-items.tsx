"use client";

/**
 * Shared leaf-only category picker (ADR-0011 §9, prototype Variant B —
 * owner-approved). Renders SelectContent children from a category tree: root
 * leaves first as plain items, then each group as a non-selectable label
 * followed by its indented leaves. A group node is never itself a SelectItem —
 * every assignment surface (transaction picker, rule authoring) offers exactly
 * the leaves.
 */

import { SelectGroup, SelectItem, SelectLabel, SelectSeparator } from "@/components/ui/select";
import type { Category, CategoryTreeNode } from "@/lib/categories";

export function CategoryDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function LeafSelectItem({ leaf, indent }: { leaf: Category; indent?: string }) {
  return (
    <SelectItem value={leaf.id} className={indent}>
      <span className="flex items-center gap-1.5">
        <CategoryDot color={leaf.color} />
        {leaf.name}
      </span>
    </SelectItem>
  );
}

export function GroupedCategorySelectItems({ tree }: { tree: CategoryTreeNode<Category>[] }) {
  const rootLeaves = tree.filter((n) => n.children.length === 0);
  const groups = tree.filter((n) => n.children.length > 0);

  return (
    <>
      {rootLeaves.map((leaf) => (
        <LeafSelectItem key={leaf.id} leaf={leaf} />
      ))}
      {groups.map((group) => (
        <SelectGroup key={group.id}>
          <SelectSeparator />
          <SelectLabel className="flex items-center gap-1.5 font-medium">
            <CategoryDot color={group.color} />
            {group.name}
          </SelectLabel>
          {group.children.map((leaf) => (
            <LeafSelectItem key={leaf.id} leaf={leaf} indent="ps-5" />
          ))}
        </SelectGroup>
      ))}
    </>
  );
}

/**
 * Filter variant of the grouped picker (#174). Unlike the assignment picker,
 * the transactions filter is a display/query surface, so a group IS selectable
 * here — picking it filters by its subtree (its leaves). The group renders as a
 * bold selectable item above its indented leaves; root leaves sit at top level.
 */
export function FilterCategorySelectItems({ tree }: { tree: CategoryTreeNode<Category>[] }) {
  const rootLeaves = tree.filter((n) => n.children.length === 0);
  const groups = tree.filter((n) => n.children.length > 0);

  return (
    <>
      {rootLeaves.map((leaf) => (
        <LeafSelectItem key={leaf.id} leaf={leaf} />
      ))}
      {groups.map((group) => (
        <SelectGroup key={group.id}>
          <SelectSeparator />
          <SelectItem value={group.id} className="font-medium">
            <span className="flex items-center gap-1.5">
              <CategoryDot color={group.color} />
              {group.name}
            </span>
          </SelectItem>
          {group.children.map((leaf) => (
            <LeafSelectItem key={leaf.id} leaf={leaf} indent="ps-5" />
          ))}
        </SelectGroup>
      ))}
    </>
  );
}
