"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Target, ArrowUp, ArrowDown, Archive, History, Info } from "lucide-react";
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
import {
  createGoalAction,
  updateGoalAction,
  deleteGoalAction,
  reorderGoalAction,
  archiveGoalAction,
  setTrackingSinceAction,
} from "@/app/actions/goals";

type StoredGoal = {
  id: string;
  name: string;
  targetAmount: number;
  startMonth: string;
  openingAmount: number;
  targetMonth: string | null;
  priority: number;
  archivedAt: string | null;
};

type LadderStatus = {
  id: string;
  current: number;
  target: number;
  paceVerdict: "ahead-or-on-pace" | "behind-pace" | "no-deadline";
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

/** The pool's tracking-since editor (CONTEXT.md "savings pool"). Editing it
 * recomputes every goal's ladder progress, so the consequence is stated inline. */
function TrackingSinceEditor({ initial }: { initial: string | null }) {
  const [month, setMonth] = React.useState(initial ?? "");
  // Re-sync the field to the server value after a save revalidates (adjust
  // state during render — the pattern React recommends over an effect).
  const [prevInitial, setPrevInitial] = React.useState(initial);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setMonth(initial ?? "");
  }

  const dirty = month !== (initial ?? "");

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setTrackingSinceAction({ month: month === "" ? null : month });
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="bg-muted/30 rounded-lg border px-4 py-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="tracking-since">
            מעקב מאז
          </label>
          <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
            <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
            עריכה מחשבת מחדש את ההתקדמות של כל היעדים.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            id="tracking-since"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-44"
          />
          <Button size="sm" onClick={save} disabled={!dirty || isPending}>
            {isPending ? "שומר..." : "שמור"}
          </Button>
        </div>
      </div>
      {error && <p className="text-destructive mt-2 text-sm">{error}</p>}
    </div>
  );
}

export function GoalsSection({
  initialGoals,
  ladderStatus,
  initialTrackingSince,
}: {
  initialGoals: StoredGoal[];
  ladderStatus: LadderStatus[];
  initialTrackingSince: string | null;
}) {
  const [goals, setGoals] = React.useState<StoredGoal[]>(initialGoals);
  const [prevInitialGoals, setPrevInitialGoals] = React.useState(initialGoals);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);
  const [editing, setEditing] = React.useState<StoredGoal | null>(null);
  const [deleting, setDeleting] = React.useState<StoredGoal | null>(null);
  const [archiving, setArchiving] = React.useState<StoredGoal | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [archiveError, setArchiveError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();
  const [isArchivePending, startArchiveTransition] = React.useTransition();
  const [isReorderPending, startReorderTransition] = React.useTransition();

  // Reorder / archive / tracking-since edits recompute the ladder server-side;
  // the revalidated page hands back fresh props, which we reconcile into local
  // state here (create/edit/delete update optimistically first). Adjusting state
  // during render is the pattern React recommends over a syncing effect.
  if (initialGoals !== prevInitialGoals) {
    setPrevInitialGoals(initialGoals);
    setGoals(initialGoals);
  }

  const statusById = React.useMemo(
    () => new Map(ladderStatus.map((s) => [s.id, s])),
    [ladderStatus],
  );

  const activeGoals = React.useMemo(
    () => goals.filter((g) => g.archivedAt == null).sort((a, b) => a.priority - b.priority),
    [goals],
  );
  const archivedGoals = React.useMemo(() => goals.filter((g) => g.archivedAt != null), [goals]);

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

  function openArchive(goal: StoredGoal) {
    setArchiving(goal);
    setArchiveError(null);
    setArchiveOpen(true);
  }

  function isComplete(goal: StoredGoal): boolean {
    const status = statusById.get(goal.id);
    return status != null && status.current >= status.target;
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
        const nextPriority = goals.reduce((max, g) => Math.max(max, g.priority), 0) + 1;
        setGoals((prev) => [
          ...prev,
          {
            id,
            name: values.name,
            startMonth: values.startMonth,
            openingAmount: values.openingAmount,
            targetMonth: values.targetMonth,
            targetAmount,
            priority: nextPriority,
            archivedAt: null,
          },
        ]);
      }
      setFormOpen(false);
    });
  }

  function handleReorder(goal: StoredGoal, direction: "up" | "down") {
    // Optimistic swap of adjacent priorities; the render-time prevInitialGoals
    // adjustment reconciles with server truth once the action revalidates.
    setGoals((prev) => {
      const active = prev
        .filter((g) => g.archivedAt == null)
        .sort((a, b) => a.priority - b.priority);
      const index = active.findIndex((g) => g.id === goal.id);
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= active.length) return prev;
      const a = active[index];
      const b = active[swapIndex];
      return prev.map((g) => {
        if (g.id === a.id) return { ...g, priority: b.priority };
        if (g.id === b.id) return { ...g, priority: a.priority };
        return g;
      });
    });
    startReorderTransition(async () => {
      await reorderGoalAction({ id: goal.id, direction });
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

  function handleArchive() {
    if (!archiving) return;
    startArchiveTransition(async () => {
      const result = await archiveGoalAction({ id: archiving.id });
      if (result.error) {
        setArchiveError(result.error);
        return;
      }
      setGoals((prev) =>
        prev.map((g) =>
          g.id === archiving.id ? { ...g, archivedAt: new Date().toISOString() } : g,
        ),
      );
      setArchiveOpen(false);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">יעדי חיסכון</h3>
          <p className="text-muted-foreground text-sm">
            היעדים הפעילים מסודרים כסולם עדיפויות: החיסכון נטו המצטבר (מאגר משותף) מחולק מלמעלה
            למטה, כל יעד עד לתקרת היעד שלו. שינוי הסדר מחשב מחדש את ההתקדמות.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          הוסף יעד
        </Button>
      </div>

      <TrackingSinceEditor initial={initialTrackingSince} />

      {activeGoals.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm">
          <Target className="size-4" />
          עדיין לא הוגדרו יעדי חיסכון.
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {activeGoals.map((goal, index) => {
            const status = statusById.get(goal.id);
            const complete = isComplete(goal);
            return (
              <div key={goal.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex flex-col">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label="העבר למעלה"
                      disabled={index === 0 || isReorderPending}
                      onClick={() => handleReorder(goal, "up")}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      aria-label="העבר למטה"
                      disabled={index === activeGoals.length - 1 || isReorderPending}
                      onClick={() => handleReorder(goal, "down")}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </div>
                  <div className="text-muted-foreground w-5 text-center text-sm tabular-nums">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{goal.name}</span>
                      {complete && (
                        <span className="rounded-full border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          הושלם
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {status ? (
                        <>
                          <Amount amount={status.current} colorize={false} fractionDigits={0} />{" "}
                          מתוך{" "}
                          <Amount amount={goal.targetAmount} colorize={false} fractionDigits={0} />
                        </>
                      ) : (
                        <Amount amount={goal.targetAmount} colorize={false} />
                      )}{" "}
                      · מתחיל {formatMonthLabel(goal.startMonth)}
                      {goal.targetMonth && <> · עד {formatMonthLabel(goal.targetMonth)}</>}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(goal)}>
                    ערוך
                  </Button>
                  {/* Archive is the completion gesture (#183): only a goal that
                      has held at 100% can be archived to release its claim. */}
                  {complete && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openArchive(goal)}
                      className="gap-1"
                    >
                      <Archive className="size-3.5" />
                      ארכיון
                    </Button>
                  )}
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
            );
          })}
        </div>
      )}

      {archivedGoals.length > 0 && (
        <div className="rounded-lg border">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-4 py-3 text-sm"
          >
            <History className="size-4" strokeWidth={1.5} />
            יעדים בארכיון ({archivedGoals.length})
          </button>
          {showArchived && (
            <div className="divide-y border-t">
              {archivedGoals.map((goal) => (
                <div
                  key={goal.id}
                  className="text-muted-foreground flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="truncate">{goal.name}</span>
                  <Amount amount={goal.targetAmount} colorize={false} fractionDigits={0} />
                </div>
              ))}
            </div>
          )}
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

      {/* Archive confirmation dialog */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>העברת יעד לארכיון</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-2 text-sm">
            להעביר את היעד &quot;{archiving?.name}&quot; לארכיון? היעד ישוחרר מסולם העדיפויות והמאגר
            המשותף יזרום מחדש ליעדים שמתחתיו. היעד יישאר לצפייה בהיסטוריה בלבד.
          </p>
          {archiveError && <p className="text-destructive text-sm">{archiveError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setArchiveOpen(false)}
              disabled={isArchivePending}
            >
              ביטול
            </Button>
            <Button onClick={handleArchive} disabled={isArchivePending}>
              {isArchivePending ? "מעביר..." : "העבר לארכיון"}
            </Button>
          </DialogFooter>
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
