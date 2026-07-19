"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Banknote,
  CirclePlus,
  ShoppingCart,
  Coffee,
  Car,
  Home,
  Receipt,
  Heart,
  Clapperboard,
  ShoppingBag,
  GraduationCap,
  Shield,
  Repeat,
  Gift,
  TrendingUp,
  PiggyBank,
  ArrowLeftRight,
  CreditCard,
  MoreHorizontal,
  Utensils,
  Plane,
  Bike,
  Bus,
  Train,
  Dumbbell,
  Music,
  Monitor,
  Smartphone,
  Globe,
  Volleyball,
  HandCoins,
  Unlink,
  type LucideIcon,
} from "lucide-react";
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
import { createCategorySchema } from "@/lib/categories/schemas";
// Value import from the pure hierarchy module (no DB dependency) — importing
// the tree builder from "@/lib/categories" itself would pull the
// Drizzle-backed index.ts (and postgres) into the client bundle. Prior art:
// rules-section.tsx does the same for firstAssignableCategoryId.
import { buildCategoryTree, type CategoryTreeNode } from "@/lib/categories/hierarchy";
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "@/app/actions/categories";
import { getCategoryBudgetAction } from "@/app/actions/budgets";

type CategoryType = "income" | "expense" | "investment" | "transfer" | "ignore";

type Category = {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  isDefault: boolean;
  parentId: string | null;
};

const ICON_MAP: Record<string, LucideIcon> = {
  Banknote,
  CirclePlus,
  ShoppingCart,
  Coffee,
  Car,
  Home,
  Receipt,
  Heart,
  Clapperboard,
  ShoppingBag,
  GraduationCap,
  Shield,
  Repeat,
  Gift,
  TrendingUp,
  PiggyBank,
  ArrowLeftRight,
  CreditCard,
  MoreHorizontal,
  Utensils,
  Plane,
  Bike,
  Bus,
  Train,
  Dumbbell,
  Music,
  Monitor,
  Smartphone,
  Globe,
  Volleyball,
  HandCoins,
};

const ICON_LABELS: Record<string, string> = {
  Banknote: "שטר כסף",
  CirclePlus: "הוספה",
  ShoppingCart: "עגלת קניות",
  Coffee: "קפה",
  Car: "רכב",
  Home: "בית",
  Receipt: "קבלה",
  Heart: "לב",
  Clapperboard: "סרט",
  ShoppingBag: "תיק קניות",
  GraduationCap: "כובע סיום",
  Shield: "מגן",
  Repeat: "חזרה",
  Gift: "מתנה",
  TrendingUp: "מגמה עולה",
  PiggyBank: "קופת חיסכון",
  ArrowLeftRight: "חץ דו-כיווני",
  CreditCard: "כרטיס אשראי",
  MoreHorizontal: "אחר",
  Utensils: "כלי אוכל",
  Plane: "מטוס",
  Bike: "אופניים",
  Bus: "אוטובוס",
  Train: "רכבת",
  Dumbbell: "משקולות",
  Music: "מוזיקה",
  Monitor: "מסך",
  Smartphone: "סמארטפון",
  Globe: "גלובוס",
  Volleyball: "כדורגל",
  HandCoins: "מזומן",
};

const AVAILABLE_ICONS = Object.keys(ICON_MAP);

const TYPE_LABELS: Record<CategoryType, string> = {
  income: "הכנסה",
  expense: "הוצאה",
  investment: "השקעה",
  transfer: "העברה",
  ignore: "התעלם",
};

const TYPE_CLASSES: Record<CategoryType, string> = {
  income: "bg-emerald-100 text-emerald-800 border-emerald-200",
  expense: "bg-red-100 text-red-800 border-red-200",
  investment: "bg-blue-100 text-blue-800 border-blue-200",
  transfer: "bg-gray-100 text-gray-600 border-gray-200",
  ignore: "bg-gray-100 text-gray-500 border-gray-200",
};

// Sentinel for the "no parent — root category" Select option (ADR-0011: a
// category's own group-ness is derived from having children, never a flag —
// the form just offers "root" vs "under this existing root category").
const NO_PARENT = "__none__";

function CategoryIcon({ name, color }: { name: string; color: string }) {
  const Icon = ICON_MAP[name] ?? MoreHorizontal;
  return <Icon className="size-4" style={{ color }} />;
}

type CategoryFormValues = z.infer<typeof createCategorySchema>;

function emptyForm(): CategoryFormValues {
  return { name: "", type: "expense", icon: "MoreHorizontal", color: "#6366f1", parentId: null };
}

/** Root-level categories of the given type, minus `excludeId` — every valid move/detach target (ADR-0011: a parent must itself be a root; a populated one is rejected server-side with the guided path). */
function candidateParents(all: Category[], type: CategoryType, excludeId?: string): Category[] {
  return all
    .filter((c) => c.parentId === null && c.type === type && c.id !== excludeId)
    .sort((a, b) => a.name.localeCompare(b.name, "he"));
}

export function CategoriesSection({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = React.useState<Category[]>(initialCategories);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [deleting, setDeleting] = React.useState<Category | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deletingHasBudget, setDeletingHasBudget] = React.useState(false);
  const [detachError, setDetachError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();
  const [isDetachPending, startDetachTransition] = React.useTransition();
  const [isBudgetCheckPending, startBudgetCheckTransition] = React.useTransition();
  // Tracks which category id the in-flight budget check was requested for, so
  // a late response from a since-replaced dialog target (rapid
  // open -> close -> open on a different category) is dropped instead of
  // mislabeling the new target as budgeted (or not).
  const budgetCheckIdRef = React.useRef<string | null>(null);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: emptyForm(),
  });

  const tree = React.useMemo(
    (): CategoryTreeNode<Category>[] => buildCategoryTree(categories),
    [categories],
  );

  const childrenCount = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of categories) {
      if (c.parentId) counts.set(c.parentId, (counts.get(c.parentId) ?? 0) + 1);
    }
    return counts;
  }, [categories]);

  const watchedType = form.watch("type");
  const parentCandidates = React.useMemo(
    () => candidateParents(categories, watchedType, editing?.id),
    [categories, watchedType, editing],
  );
  const parentNameById = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  // A category already carrying children can never gain a parent of its own
  // (ADR-0011: depth capped at one level, enforced from the child side too) —
  // the picker is disabled rather than left to fail server-side every time.
  const editingIsGroup = editing ? (childrenCount.get(editing.id) ?? 0) > 0 : false;

  function openAdd() {
    setEditing(null);
    form.reset(emptyForm());
    setFormOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    form.reset({
      name: cat.name,
      type: cat.type,
      icon: cat.icon,
      color: cat.color,
      parentId: cat.parentId,
    });
    setFormOpen(true);
  }

  function openDelete(cat: Category) {
    setDeleting(cat);
    setDeleteError(null);
    setDeletingHasBudget(false);
    setDeleteOpen(true);
    budgetCheckIdRef.current = cat.id;
    // Schema `ON DELETE CASCADE` (ADR-0011 §8): deleting this category also
    // drops its budget, if any — checked on open so the confirm copy can name
    // that consequence before the user commits. The destructive confirm below
    // is disabled until this resolves (never delete-before-disclose).
    startBudgetCheckTransition(async () => {
      const result = await getCategoryBudgetAction({ id: cat.id });
      if (budgetCheckIdRef.current !== cat.id) return; // stale — dialog moved to a different category
      setDeletingHasBudget(result.hasBudget);
    });
  }

  function closeDeleteDialog(open: boolean) {
    setDeleteOpen(open);
    if (!open) budgetCheckIdRef.current = null;
  }

  function onSubmit(values: CategoryFormValues) {
    startTransition(async () => {
      const result = editing
        ? await updateCategoryAction({ id: editing.id, ...values })
        : await createCategoryAction(values);

      if (result.error || result.fieldErrors) {
        // Server-side validation lands in the same inline mechanism as client errors.
        applyActionErrors(form, result);
        return;
      }

      // Optimistic local state, layered on top of the server revalidation.
      if (editing) {
        setCategories((prev) =>
          prev.map((c) =>
            c.id === editing.id ? { ...c, ...values, parentId: values.parentId ?? null } : c,
          ),
        );
      } else if ("id" in result && result.id) {
        const id = result.id;
        setCategories((prev) => [
          ...prev,
          { id, ...values, parentId: values.parentId ?? null, isDefault: false },
        ]);
      }
      setFormOpen(false);
    });
  }

  function handleDelete() {
    if (!deleting) return;
    startDeleteTransition(async () => {
      const result = await deleteCategoryAction({ id: deleting.id });
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      const detachedIds = categories.filter((c) => c.parentId === deleting.id).map((c) => c.id);
      setCategories((prev) =>
        prev
          .filter((c) => c.id !== deleting.id)
          .map((c) => (detachedIds.includes(c.id) ? { ...c, parentId: null } : c)),
      );
      closeDeleteDialog(false);
    });
  }

  function handleDetach(cat: Category) {
    setDetachError(null);
    startDetachTransition(async () => {
      const result = await updateCategoryAction({ id: cat.id, parentId: null });
      if (result.error) {
        setDetachError(result.error);
        return;
      }
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, parentId: null } : c)));
    });
  }

  function renderRow(cat: Category, opts: { isGroup: boolean; indent: boolean }) {
    return (
      <div
        key={cat.id}
        className={`flex items-center justify-between gap-3 px-4 py-3 ${opts.indent ? "ps-10" : ""}`}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: `${cat.color}20` }}
          >
            <CategoryIcon name={cat.icon} color={cat.color} />
          </div>
          <span className="text-sm font-medium">{cat.name}</span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TYPE_CLASSES[cat.type]}`}
          >
            {TYPE_LABELS[cat.type]}
          </span>
          {opts.isGroup && (
            <span className="text-muted-foreground inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-xs font-medium">
              קבוצה
            </span>
          )}
          <span
            className="size-4 shrink-0 rounded-full border"
            style={{ backgroundColor: cat.color }}
            title={cat.color}
          />
        </div>
        <div className="flex items-center gap-2">
          {opts.indent && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDetach(cat)}
              disabled={isDetachPending}
            >
              <Unlink />
              נתק מהקבוצה
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => openEdit(cat)}>
            ערוך
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={cat.isDefault}
            onClick={() => !cat.isDefault && openDelete(cat)}
            className={
              cat.isDefault ? "cursor-not-allowed opacity-40" : "text-red-600 hover:text-red-700"
            }
          >
            מחק
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">קטגוריות</h3>
          <p className="text-muted-foreground text-sm">
            קטגוריה שיש לה תתי-קטגוריות הופכת אוטומטית לקבוצה. ניתן ליצור קבוצה חדשה, להעביר
            קטגוריות אליה ולנתק אותן בחזרה — מבלי לשנות סיווג של אף עסקה.
          </p>
        </div>
        <Button size="sm" onClick={openAdd}>
          הוסף קטגוריה
        </Button>
      </div>

      {detachError && <p className="text-destructive text-sm">{detachError}</p>}

      <div className="divide-y rounded-lg border">
        {tree.map((node) => (
          <React.Fragment key={node.id}>
            {renderRow(node, { isGroup: node.children.length > 0, indent: false })}
            {node.children.map((child) => renderRow(child, { isGroup: false, indent: true }))}
          </React.Fragment>
        ))}
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "ערוך קטגוריה" : "הוסף קטגוריה"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <div className="space-y-4 py-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>שם</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="שם הקטגוריה" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>סוג</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          if (v) {
                            field.onChange(v);
                            // Switching type invalidates a parent of the old type.
                            form.setValue("parentId", null);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <span>{TYPE_LABELS[field.value]}</span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(Object.keys(TYPE_LABELS) as CategoryType[]).map((t) => (
                            <SelectItem key={t} value={t}>
                              {TYPE_LABELS[t]}
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
                  name="parentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>קבוצת אב</FormLabel>
                      <Select
                        value={field.value ?? NO_PARENT}
                        onValueChange={(v) => {
                          if (v) field.onChange(v === NO_PARENT ? null : v);
                        }}
                        disabled={editingIsGroup}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <span>
                              {field.value
                                ? (parentNameById.get(field.value) ?? "קטגוריית שורש")
                                : "ללא (קטגוריית שורש)"}
                            </span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_PARENT}>ללא (קטגוריית שורש)</SelectItem>
                          {parentCandidates.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {editingIsGroup ? (
                        <p className="text-muted-foreground text-sm">
                          לקבוצה עם תתי-קטגוריות אין קבוצת אב משלה.
                        </p>
                      ) : (
                        <FormMessage />
                      )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="icon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>אייקון</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          if (v) field.onChange(v);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <span className="flex items-center gap-2">
                              {(() => {
                                const Icon = ICON_MAP[field.value] ?? MoreHorizontal;
                                return <Icon className="size-4" />;
                              })()}
                              {ICON_LABELS[field.value] ?? field.value}
                            </span>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {AVAILABLE_ICONS.map((iconName) => {
                            const Icon = ICON_MAP[iconName]!;
                            return (
                              <SelectItem key={iconName} value={iconName}>
                                <Icon className="size-4" />
                                {ICON_LABELS[iconName] ?? iconName}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>צבע</FormLabel>
                      <div className="flex items-center gap-2">
                        <FormControl>
                          <input
                            type="color"
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            name={field.name}
                            ref={field.ref}
                            className="h-9 w-12 cursor-pointer rounded border p-1"
                          />
                        </FormControl>
                        <span className="text-muted-foreground text-sm">{field.value}</span>
                      </div>
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
      <Dialog open={deleteOpen} onOpenChange={closeDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleting && childrenCount.get(deleting.id) ? "מחיקת קבוצה" : "מחיקת קטגוריה"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-2 text-sm">
            {deleting && childrenCount.get(deleting.id) ? (
              <>
                מחיקת הקבוצה &quot;{deleting.name}&quot; תנתק את תתי-הקטגוריות שבתוכה בחזרה
                לקטגוריות שורש. שום עסקה, כלל סיווג או זיכרון ספק המשויכים אליהן לא ייפגעו.
                {deletingHasBudget && <> לקבוצה זו יש תקציב חודשי — הוא יימחק יחד איתה.</>}
              </>
            ) : (
              <>
                האם למחוק את הקטגוריה &quot;{deleting?.name}&quot;? עסקאות משויכות יאבדו את הסיווג
                שלהן.
                {deletingHasBudget && <> לקטגוריה זו יש תקציב חודשי — הוא יימחק יחד איתה.</>}
              </>
            )}
            {isBudgetCheckPending && (
              <>
                {" "}
                <span className="italic">בודק אם יש תקציב מקושר...</span>
              </>
            )}
          </p>
          {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => closeDeleteDialog(false)}
              disabled={isDeletePending}
            >
              ביטול
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isDeletePending || isBudgetCheckPending}
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
