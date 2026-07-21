"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormRootError,
  FormSubmit,
  applyActionErrors,
} from "@/components/ui/form";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/empty-state";
import { Tags, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { createRuleSchema } from "@/lib/categories/schemas";
// Value import from the pure hierarchy module (no DB dependency) — importing
// this client component's other category bindings from "@/lib/categories"
// itself would pull the Drizzle-backed index.ts (and postgres) into the
// client bundle, per Next's module-not-found trace on Node builtins.
import { firstAssignableCategoryId } from "@/lib/categories/hierarchy";
import type { Category, CategoryTreeNode } from "@/lib/categories";
import { GroupedCategorySelectItems } from "@/components/grouped-category-select-items";
import {
  previewRetroactiveApplyAction,
  applyRetroactivelyAction,
  createRuleAction,
  updateRuleAction,
  deleteRuleAction,
} from "@/app/actions/rules";

type MatchType = "contains" | "starts_with" | "exact" | "regex";

type CategoryRule = {
  id: string;
  categoryId: string;
  matchType: MatchType;
  pattern: string;
  priority: number;
};

const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  contains: "מכיל",
  starts_with: "מתחיל ב",
  exact: "מדויק",
  regex: "ביטוי רגולרי",
};

const MATCH_TYPE_CLASSES: Record<MatchType, string> = {
  contains: "bg-blue-100 text-blue-800 border-blue-200",
  starts_with: "bg-purple-100 text-purple-800 border-purple-200",
  exact: "bg-orange-100 text-orange-800 border-orange-200",
  regex: "bg-gray-100 text-gray-700 border-gray-200",
};

// ADR-0010: rules are a deliberately-authored, occasionally-touched artifact
// (merchant memory is the default learning path) — a list past this size no
// longer earns permanently-expanded vertical space on Settings (#181).
const SEARCH_THRESHOLD = 8;

type RuleFormValues = z.infer<typeof createRuleSchema>;

function emptyForm(tree: CategoryTreeNode<Category>[]): RuleFormValues {
  return {
    categoryId: firstAssignableCategoryId(tree),
    matchType: "contains",
    pattern: "",
    priority: 0,
  };
}

export function RulesSection({
  initialRules,
  categories,
  tree,
}: {
  initialRules: CategoryRule[];
  categories: Category[];
  tree: CategoryTreeNode<Category>[];
}) {
  const [rules, setRules] = React.useState<CategoryRule[]>(initialRules);
  // Empty section starts open (nothing to hide, and a first-time user needs
  // the create-rule empty state visible); a populated list starts collapsed.
  const [expanded, setExpanded] = React.useState(initialRules.length === 0);
  const [search, setSearch] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CategoryRule | null>(null);
  const [deleting, setDeleting] = React.useState<CategoryRule | null>(null);
  const [applying, setApplying] = React.useState<CategoryRule | null>(null);
  const [applyPreviewCount, setApplyPreviewCount] = React.useState<number | null>(null);
  const [applySuccess, setApplySuccess] = React.useState<string | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(createRuleSchema),
    defaultValues: emptyForm(tree),
  });

  const categoryMap = React.useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const hasRules = rules.length > 0;

  const filteredRules = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.pattern.toLowerCase().includes(q) ||
        (categoryMap[r.categoryId] ?? "").toLowerCase().includes(q),
    );
  }, [rules, search, categoryMap]);

  function openAdd() {
    setEditing(null);
    form.reset(emptyForm(tree));
    setFormOpen(true);
  }

  function openEdit(rule: CategoryRule) {
    setEditing(rule);
    form.reset({
      categoryId: rule.categoryId,
      matchType: rule.matchType,
      pattern: rule.pattern,
      priority: rule.priority,
    });
    setFormOpen(true);
  }

  function openDelete(rule: CategoryRule) {
    setDeleting(rule);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function openApply(rule: CategoryRule) {
    setApplying(rule);
    setApplyPreviewCount(null);
    setApplySuccess(null);
    setError(null);
    setApplyOpen(true);
    const result = await previewRetroactiveApplyAction({ ruleId: rule.id });
    if (result.error) {
      setError(result.error);
    } else {
      setApplyPreviewCount(result.count ?? 0);
    }
  }

  function onSubmit(values: RuleFormValues) {
    startTransition(async () => {
      const result = editing
        ? await updateRuleAction({ id: editing.id, ...values })
        : await createRuleAction(values);

      if (result.error || result.fieldErrors) {
        // Server-side validation lands in the same inline mechanism as client errors.
        applyActionErrors(form, result);
        return;
      }

      // Optimistic local state, layered on top of the server revalidation.
      if (editing) {
        setRules((prev) =>
          prev
            .map((r) => (r.id === editing.id ? { ...r, ...values } : r))
            .sort((a, b) => b.priority - a.priority),
        );
      } else if ("id" in result && result.id) {
        const id = result.id;
        setRules((prev) => [...prev, { id, ...values }].sort((a, b) => b.priority - a.priority));
        setExpanded(true);
      }
      setFormOpen(false);
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startDeleteTransition(async () => {
      const result = await deleteRuleAction({ id: deleting.id });
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setRules((prev) => prev.filter((r) => r.id !== deleting.id));
      setDeleteOpen(false);
    });
  }

  async function handleApply() {
    if (!applying) return;
    setSaving(true);
    setError(null);
    try {
      const result = await applyRetroactivelyAction({ ruleId: applying.id });
      if (result.error) {
        setError(result.error);
        return;
      }
      const count = result.applied ?? 0;
      setApplySuccess(
        count === 0 ? "לא נמצאו עסקאות לא מסווגות התואמות לכלל זה" : `סווגו ${count} עסקאות בהצלחה`,
      );
    } catch {
      setError("שגיאה בעת יישום הכלל");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Collapsible open={expanded} onOpenChange={setExpanded} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">כללי סיווג</h3>
            {hasRules && (
              <span className="text-muted-foreground text-sm">{rules.length} כללים</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={openAdd}>
              הוסף כלל
            </Button>
            {hasRules && (
              <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
                {expanded ? "הסתר כללים" : "הצג כללים"}
                <ChevronDown
                  className={cn("size-4 transition-transform", expanded && "rotate-180")}
                />
              </CollapsibleTrigger>
            )}
          </div>
        </div>

        <CollapsibleContent>
          <div className="space-y-3 pt-1">
            {rules.length > SEARCH_THRESHOLD && (
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש לפי תבנית או קטגוריה"
                  dir="auto"
                  className="ps-9"
                />
              </div>
            )}

            <div className="divide-y rounded-lg border">
              {!hasRules && (
                <EmptyState
                  icon={Tags}
                  heading="לא נוצרו כללי קטגוריה"
                  explainer="צור כלל כדי לקטלג עסקאות באופן אוטומטי לפי תיאור."
                  cta={{ label: "הוסף כלל", onClick: openAdd }}
                />
              )}
              {hasRules && filteredRules.length === 0 && (
                <p className="text-muted-foreground px-4 py-6 text-center text-sm">
                  לא נמצאו כללים תואמים לחיפוש
                </p>
              )}
              {filteredRules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${MATCH_TYPE_CLASSES[rule.matchType]}`}
                    >
                      {MATCH_TYPE_LABELS[rule.matchType]}
                    </span>
                    <span className="truncate text-sm font-medium" title={rule.pattern}>
                      {rule.pattern}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {categoryMap[rule.categoryId] ?? rule.categoryId}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      עדיפות: {rule.priority}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openApply(rule)}>
                      יישום על קיימים
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(rule)}>
                      ערוך
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => openDelete(rule)}
                    >
                      מחק
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "ערוך כלל" : "הוסף כלל"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <div className="space-y-4 py-2">
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>קטגוריה</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          if (v) field.onChange(v);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <span>{categoryMap[field.value] ?? "בחר קטגוריה"}</span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <GroupedCategorySelectItems tree={tree} />
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="matchType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>סוג התאמה</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          if (v) field.onChange(v);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <span>{MATCH_TYPE_LABELS[field.value]}</span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(Object.keys(MATCH_TYPE_LABELS) as MatchType[]).map((t) => (
                            <SelectItem key={t} value={t}>
                              {MATCH_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pattern"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>תבנית</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="לדוגמה: שופרסל" dir="auto" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>עדיפות</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          value={Number.isNaN(field.value) ? "" : field.value}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === "" ? Number.NaN : Number(e.target.value),
                            )
                          }
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormRootError />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormOpen(false)}
                  disabled={isPending}
                >
                  ביטול
                </Button>
                <FormSubmit pending={isPending} pendingText="שומר...">
                  שמור
                </FormSubmit>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת כלל</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-2 text-sm">
            האם למחוק את הכלל עבור &quot;{deleting?.pattern}&quot;?
          </p>
          {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={isDeletePending}
            >
              ביטול
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isDeletePending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeletePending ? "מוחק..." : "מחק"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply to existing dialog */}
      <Dialog
        open={applyOpen}
        onOpenChange={(open) => {
          if (!open) {
            setApplyOpen(false);
            setApplying(null);
            setApplyPreviewCount(null);
            setApplySuccess(null);
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>יישום על עסקאות קיימות</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {applySuccess ? (
              <p className="text-sm text-emerald-700">{applySuccess}</p>
            ) : applyPreviewCount === null && !error ? (
              <p className="text-muted-foreground text-sm">בודק עסקאות...</p>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : (
              <p className="text-sm">
                {applyPreviewCount === 0
                  ? "לא נמצאו עסקאות לא מסווגות התואמות לכלל זה."
                  : `כלל זה יסווג ${applyPreviewCount} עסקאות לא מסווגות. להמשיך?`}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApplyOpen(false);
                setApplying(null);
                setApplyPreviewCount(null);
                setApplySuccess(null);
                setError(null);
              }}
              disabled={saving}
            >
              {applySuccess ? "סגור" : "ביטול"}
            </Button>
            {!applySuccess && applyPreviewCount !== null && applyPreviewCount > 0 && (
              <Button onClick={handleApply} disabled={saving}>
                {saving ? "מסווג..." : "יישם"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
