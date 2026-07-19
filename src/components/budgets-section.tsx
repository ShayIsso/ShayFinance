"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectTrigger } from "@/components/ui/select";
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
import { Amount } from "@/components/ui/amount";
import { CategoryDot, FilterCategorySelectItems } from "@/components/grouped-category-select-items";
// Value import from the pure hierarchy module (no DB dependency) — prior art
// categories-section.tsx does the same to keep the client bundle off "@/lib/categories"'s
// Drizzle-backed index.ts.
import { buildCategoryTree, type CategoryTreeNode } from "@/lib/categories/hierarchy";
import type { Category } from "@/lib/categories";
import { createBudgetSchema, monthlyTargetsSchema } from "@/lib/budgets/schemas";
import {
  createBudgetAction,
  updateBudgetAction,
  deleteBudgetAction,
  setMonthlyTargetsAction,
} from "@/app/actions/budgets";

type StoredBudget = {
  id: string;
  categoryId: string;
  monthlyLimit: number;
};

type MonthlyTargetsData = {
  expenseTarget: number | null;
  savingsTarget: number | null;
};

type BudgetFormValues = z.infer<typeof createBudgetSchema>;
type TargetsFormValues = z.infer<typeof monthlyTargetsSchema>;

function firstCategoryId(tree: CategoryTreeNode<Category>[]): string {
  return tree[0]?.id ?? "";
}

function emptyForm(expenseTree: CategoryTreeNode<Category>[]): BudgetFormValues {
  return { categoryId: firstCategoryId(expenseTree), monthlyLimit: Number.NaN };
}

function NumberField({
  value,
  onChange,
  onBlur,
  name,
  inputRef,
  min,
}: {
  value: number;
  onChange: (value: number) => void;
  onBlur: () => void;
  name: string;
  inputRef: React.Ref<HTMLInputElement>;
  min?: number;
}) {
  return (
    <Input
      type="number"
      min={min}
      step="0.01"
      value={Number.isNaN(value) ? "" : value}
      onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
      onBlur={onBlur}
      name={name}
      ref={inputRef}
    />
  );
}

/** Empty clears the target back to null — the only way to remove an optional target. */
function NullableNumberField({
  value,
  onChange,
  onBlur,
  name,
  inputRef,
  placeholder,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur: () => void;
  name: string;
  inputRef: React.Ref<HTMLInputElement>;
  placeholder?: string;
}) {
  return (
    <Input
      type="number"
      min={0}
      step="0.01"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      onBlur={onBlur}
      name={name}
      ref={inputRef}
      placeholder={placeholder}
    />
  );
}

export function BudgetsSection({
  initialBudgets,
  categories,
  initialTargets,
}: {
  initialBudgets: StoredBudget[];
  categories: Category[];
  initialTargets: MonthlyTargetsData;
}) {
  const [budgets, setBudgets] = React.useState<StoredBudget[]>(initialBudgets);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StoredBudget | null>(null);
  const [deleting, setDeleting] = React.useState<StoredBudget | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();
  const [isTargetsPending, startTargetsTransition] = React.useTransition();

  const categoryById = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const groupIds = React.useMemo(
    () => new Set(categories.filter((c) => c.parentId !== null).map((c) => c.parentId!)),
    [categories],
  );

  // Only expense-type categories/groups are budgetable (decision record #105
  // §10) — unlike leaf-only assignment pickers, a group IS offered here since
  // a group budget measures its subtree's spend.
  const expenseTree = React.useMemo(
    (): CategoryTreeNode<Category>[] =>
      buildCategoryTree(categories.filter((c) => c.type === "expense")),
    [categories],
  );

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(createBudgetSchema),
    defaultValues: emptyForm(expenseTree),
  });

  const targetsForm = useForm<TargetsFormValues>({
    resolver: zodResolver(monthlyTargetsSchema),
    defaultValues: initialTargets,
  });

  function openAdd() {
    setEditing(null);
    form.reset(emptyForm(expenseTree));
    setFormOpen(true);
  }

  function openEdit(budget: StoredBudget) {
    setEditing(budget);
    form.reset({ categoryId: budget.categoryId, monthlyLimit: budget.monthlyLimit });
    setFormOpen(true);
  }

  function openDelete(budget: StoredBudget) {
    setDeleting(budget);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  function onSubmit(values: BudgetFormValues) {
    startTransition(async () => {
      const result = editing
        ? await updateBudgetAction({ id: editing.id, monthlyLimit: values.monthlyLimit })
        : await createBudgetAction(values);

      if (result.error || result.fieldErrors) {
        applyActionErrors(form, result);
        return;
      }

      if (editing) {
        setBudgets((prev) =>
          prev.map((b) => (b.id === editing.id ? { ...b, monthlyLimit: values.monthlyLimit } : b)),
        );
      } else if ("id" in result && result.id) {
        const id = result.id;
        setBudgets((prev) => [
          ...prev,
          { id, categoryId: values.categoryId, monthlyLimit: values.monthlyLimit },
        ]);
      }
      setFormOpen(false);
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startDeleteTransition(async () => {
      const result = await deleteBudgetAction({ id: deleting.id });
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setBudgets((prev) => prev.filter((b) => b.id !== deleting.id));
      setDeleteOpen(false);
    });
  }

  function onSubmitTargets(values: TargetsFormValues) {
    startTargetsTransition(async () => {
      const result = await setMonthlyTargetsAction(values);
      if (result.error || result.fieldErrors) {
        applyActionErrors(targetsForm, result);
        return;
      }
      targetsForm.reset(values);
    });
  }

  const selectedCategory = categoryById.get(form.watch("categoryId"));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">תקציבים חודשיים</h3>
            <p className="text-muted-foreground text-sm">
              תקרת הוצאה חודשית לקטגוריית הוצאה או לקבוצה, לפי סך ההוצאות בתת-העץ שלה. מתאפסת בכל
              חודש.
            </p>
          </div>
          <Button size="sm" onClick={openAdd}>
            הוסף תקציב
          </Button>
        </div>

        {budgets.length === 0 ? (
          <div className="text-muted-foreground mt-4 flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm">
            <Wallet className="size-4" />
            עדיין לא הוגדרו תקציבים.
          </div>
        ) : (
          <div className="mt-4 divide-y rounded-lg border">
            {budgets.map((budget) => {
              const category = categoryById.get(budget.categoryId);
              return (
                <div key={budget.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
                      <Wallet className="size-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {category && <CategoryDot color={category.color} />}
                        {category?.name ?? "קטגוריה לא ידועה"}
                        {category && groupIds.has(category.id) && (
                          <span className="text-muted-foreground inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-xs font-medium">
                            קבוצה
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        <Amount amount={budget.monthlyLimit} colorize={false} /> לחודש
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(budget)}>
                      ערוך
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDelete(budget)}
                      className="text-red-600 hover:text-red-700"
                    >
                      מחק
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add / Edit dialog */}
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "ערוך תקציב" : "הוסף תקציב"}</DialogTitle>
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
                          disabled={!!editing}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <span className="flex items-center gap-1.5">
                                {selectedCategory && <CategoryDot color={selectedCategory.color} />}
                                {selectedCategory?.name ?? "בחר קטגוריה"}
                              </span>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <FilterCategorySelectItems tree={expenseTree} />
                          </SelectContent>
                        </Select>
                        {editing ? (
                          <p className="text-muted-foreground text-sm">
                            לא ניתן לשנות את הקטגוריה של תקציב קיים — יש למחוק וליצור מחדש.
                          </p>
                        ) : (
                          <FormMessage />
                        )}
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="monthlyLimit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>תקרה חודשית</FormLabel>
                        <FormControl>
                          <NumberField
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            name={field.name}
                            inputRef={field.ref}
                            min={0}
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
              <DialogTitle>מחיקת תקציב</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground py-2 text-sm">
              האם למחוק את התקציב עבור &quot;
              {deleting && categoryById.get(deleting.categoryId)?.name}
              &quot;? הפעולה אינה הפיכה.
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
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold">יעדים חודשיים</h3>
        <p className="text-muted-foreground text-sm">
          יעד הוצאות כולל ו/או יעד חיסכון נטו לחודש — שניהם אופציונליים. ריקון שדה מנקה את היעד.
        </p>
        <Form {...targetsForm}>
          <form onSubmit={targetsForm.handleSubmit(onSubmitTargets)} noValidate className="mt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                control={targetsForm.control}
                name="expenseTarget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>יעד הוצאות חודשי</FormLabel>
                    <FormControl>
                      <NullableNumberField
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        inputRef={field.ref}
                        placeholder="ללא יעד"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={targetsForm.control}
                name="savingsTarget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>יעד חיסכון נטו חודשי</FormLabel>
                    <FormControl>
                      <NullableNumberField
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        inputRef={field.ref}
                        placeholder="ללא יעד"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormRootError />
            <div className="mt-4 flex items-center gap-3">
              <FormSubmit pending={isTargetsPending} pendingText="שומר...">
                שמור יעדים
              </FormSubmit>
              {targetsForm.formState.isSubmitSuccessful && !targetsForm.formState.isDirty && (
                <span className="text-muted-foreground text-sm">נשמר</span>
              )}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
