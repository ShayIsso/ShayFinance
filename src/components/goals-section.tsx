"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { createGoalFormSchema } from "@/lib/goals/schemas";
import { createGoalAction, updateGoalAction, deleteGoalAction } from "@/app/actions/goals";

type StoredGoal = {
  id: string;
  name: string;
  targetAmount: number;
  startMonth: string;
  openingAmount: number;
  targetMonth: string | null;
};

type GoalFormValues = z.infer<typeof createGoalFormSchema>;

function emptyForm(): GoalFormValues {
  return {
    mode: "cumulative",
    name: "",
    startMonth: "",
    openingAmount: 0,
    targetAmount: Number.NaN,
    targetMonth: null,
  };
}

/** Reopens a stored goal for editing — always in cumulative mode, since
 * per-month phrasing is entry-time sugar with no trace left in storage. */
function formFromGoal(goal: StoredGoal): GoalFormValues {
  return {
    mode: "cumulative",
    name: goal.name,
    startMonth: goal.startMonth,
    openingAmount: goal.openingAmount,
    targetAmount: goal.targetAmount,
    targetMonth: goal.targetMonth,
  };
}

/** "2026-01" -> "ינואר 2026". Client-only per CLAUDE.md's formatting rule. */
function formatMonthLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", { year: "numeric", month: "long" }).format(
    new Date(year, month - 1, 1),
  );
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

export function GoalsSection({ initialGoals }: { initialGoals: StoredGoal[] }) {
  const [goals, setGoals] = React.useState<StoredGoal[]>(initialGoals);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<StoredGoal | null>(null);
  const [deleting, setDeleting] = React.useState<StoredGoal | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();

  const form = useForm<GoalFormValues>({
    resolver: zodResolver(createGoalFormSchema),
    defaultValues: emptyForm(),
  });

  const mode = form.watch("mode");

  function openAdd() {
    setEditing(null);
    form.reset(emptyForm());
    setFormOpen(true);
  }

  function openEdit(goal: StoredGoal) {
    setEditing(goal);
    form.reset(formFromGoal(goal));
    setFormOpen(true);
  }

  function openDelete(goal: StoredGoal) {
    setDeleting(goal);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  function onSubmit(values: GoalFormValues) {
    startTransition(async () => {
      const result = editing
        ? await updateGoalAction({ id: editing.id, ...values })
        : await createGoalAction(values);

      if (result.error || result.fieldErrors) {
        applyActionErrors(form, result);
        return;
      }

      // The action returns the derived stored targetAmount (monthly-mode
      // phrasing resolves server-side) so the optimistic row never has to
      // re-derive it — result.targetAmount is always set on a non-error result.
      const targetAmount = result.targetAmount ?? 0;
      if (editing) {
        setGoals((prev) =>
          prev.map((g) =>
            g.id === editing.id
              ? {
                  ...g,
                  name: values.name,
                  startMonth: values.startMonth,
                  openingAmount: values.openingAmount,
                  targetMonth: values.targetMonth,
                  targetAmount,
                }
              : g,
          ),
        );
      } else if ("id" in result && result.id) {
        const id = result.id;
        setGoals((prev) => [
          ...prev,
          {
            id,
            name: values.name,
            startMonth: values.startMonth,
            openingAmount: values.openingAmount,
            targetMonth: values.targetMonth,
            targetAmount,
          },
        ]);
      }
      setFormOpen(false);
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startDeleteTransition(async () => {
      const result = await deleteGoalAction({ id: deleting.id });
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setGoals((prev) => prev.filter((g) => g.id !== deleting.id));
      setDeleteOpen(false);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">יעדי חיסכון</h3>
          <p className="text-muted-foreground text-sm">
            התקדמות = סכום פתיחה + חיסכון נטו מצטבר מאז חודש ההתחלה. חודש עם חיסכון שלילי מוריד את
            ההתקדמות בפועל — ללא חסימה בתחתית.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          הוסף יעד
        </Button>
      </div>

      {goals.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm">
          <Target className="size-4" />
          עדיין לא הוגדרו יעדי חיסכון.
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {goals.map((goal) => (
            <div key={goal.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
                  <Target className="size-4" />
                </div>
                <div>
                  <div className="text-sm font-medium">{goal.name}</div>
                  <div className="text-muted-foreground text-xs">
                    <Amount amount={goal.targetAmount} colorize={false} /> · מתחיל{" "}
                    {formatMonthLabel(goal.startMonth)}
                    {goal.targetMonth && <> · עד {formatMonthLabel(goal.targetMonth)}</>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(goal)}>
                  ערוך
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openDelete(goal)}
                  className="text-red-600 hover:text-red-700"
                >
                  מחק
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "ערוך יעד חיסכון" : "הוסף יעד חיסכון"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <div className="space-y-4 py-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>שם היעד</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="לדוגמה: קרן חירום" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="startMonth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>חודש התחלה</FormLabel>
                        <FormControl>
                          <Input type="month" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="openingAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>סכום פתיחה</FormLabel>
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
                </div>

                {/* Entry-mode toggle: both resolve to the same stored
                    cumulative target (CONTEXT.md "savings goal") — this only
                    picks how the number is phrased on the way in. */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "cumulative" ? "default" : "outline"}
                    onClick={() => form.setValue("mode", "cumulative")}
                  >
                    סכום כולל
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mode === "monthly" ? "default" : "outline"}
                    onClick={() => form.setValue("mode", "monthly", { shouldValidate: false })}
                  >
                    סכום לחודש
                  </Button>
                </div>

                {mode === "cumulative" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="targetAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>סכום יעד כולל</FormLabel>
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

                    <FormField
                      control={form.control}
                      name="targetMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>חודש יעד (אופציונלי)</FormLabel>
                          <FormControl>
                            <Input
                              type="month"
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value || null)}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="monthlyAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>סכום לחודש</FormLabel>
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

                    <FormField
                      control={form.control}
                      name="targetMonth"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>עד תאריך</FormLabel>
                          <FormControl>
                            <Input
                              type="month"
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value)}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

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
            <DialogTitle>מחיקת יעד</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-2 text-sm">
            האם למחוק את היעד &quot;{deleting?.name}&quot;? הפעולה אינה הפיכה.
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
  );
}
