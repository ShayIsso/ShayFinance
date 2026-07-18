"use client";

/**
 * PROTOTYPE — throwaway (BGR3, #160). Three visual treatments of the grouped
 * category Select (ADR-0011: group labels non-selectable, leaves beneath, root
 * leaves on top). Lives only on the prototype/bgr3-grouped-picker branch —
 * never merge to phase-3; the winning treatment gets rewritten properly.
 */

import * as React from "react";
import { SelectGroup, SelectItem, SelectLabel, SelectSeparator } from "@/components/ui/select";
import type { Category, CategoryTreeNode } from "@/lib/categories";

export type PickerPrototype = {
  variant: string;
  tree: CategoryTreeNode<Category>[];
};

export const PROTOTYPE_VARIANTS = [
  { key: "A", label: "תוויות שקטות" },
  { key: "B", label: "תוויות עם הזחה" },
  { key: "C", label: "פסי קבוצה" },
];

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function LeafItem({ leaf, indent }: { leaf: Category; indent?: string }) {
  return (
    <SelectItem value={leaf.id} className={indent}>
      <span className="flex items-center gap-1.5">
        <Dot color={leaf.color} />
        {leaf.name}
      </span>
    </SelectItem>
  );
}

export function GroupedPickerPrototypeItems({ variant, tree }: PickerPrototype) {
  const rootLeaves = tree.filter((n) => n.children.length === 0);
  const groups = tree.filter((n) => n.children.length > 0);

  if (variant === "B") {
    return (
      <>
        {rootLeaves.map((leaf) => (
          <LeafItem key={leaf.id} leaf={leaf} />
        ))}
        {groups.map((group) => (
          <SelectGroup key={group.id}>
            <SelectSeparator />
            <SelectLabel className="flex items-center gap-1.5 font-medium">
              <Dot color={group.color} />
              {group.name}
            </SelectLabel>
            {group.children.map((leaf) => (
              <LeafItem key={leaf.id} leaf={leaf} indent="ps-5" />
            ))}
          </SelectGroup>
        ))}
      </>
    );
  }

  if (variant === "C") {
    return (
      <>
        {rootLeaves.map((leaf) => (
          <LeafItem key={leaf.id} leaf={leaf} />
        ))}
        {groups.map((group) => (
          <SelectGroup key={group.id} className="p-0">
            <SelectLabel className="bg-muted/70 text-foreground/80 -mx-1 mt-1 flex items-center px-2.5 py-1 text-xs font-semibold">
              {group.name}
              <span className="text-muted-foreground ms-auto font-normal">
                {group.children.length}
              </span>
            </SelectLabel>
            <div className="p-1">
              {group.children.map((leaf) => (
                <LeafItem key={leaf.id} leaf={leaf} />
              ))}
            </div>
          </SelectGroup>
        ))}
      </>
    );
  }

  // Variant A — quiet muted labels, leaves flush.
  return (
    <>
      {rootLeaves.map((leaf) => (
        <LeafItem key={leaf.id} leaf={leaf} />
      ))}
      {groups.map((group) => (
        <SelectGroup key={group.id}>
          <SelectLabel>{group.name}</SelectLabel>
          {group.children.map((leaf) => (
            <LeafItem key={leaf.id} leaf={leaf} />
          ))}
        </SelectGroup>
      ))}
    </>
  );
}
