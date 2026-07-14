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
import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "@/app/actions/categories";

type CategoryType = "income" | "expense" | "investment" | "transfer" | "ignore";

type Category = {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  isDefault: boolean;
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

function CategoryIcon({ name, color }: { name: string; color: string }) {
  const Icon = ICON_MAP[name] ?? MoreHorizontal;
  return <Icon className="size-4" style={{ color }} />;
}

type CategoryFormValues = z.infer<typeof createCategorySchema>;

const EMPTY_FORM: CategoryFormValues = {
  name: "",
  type: "expense",
  icon: "MoreHorizontal",
  color: "#6366f1",
};

export function CategoriesSection({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = React.useState<Category[]>(initialCategories);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [deleting, setDeleting] = React.useState<Category | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: EMPTY_FORM,
  });

  function openAdd() {
    setEditing(null);
    form.reset(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    form.reset({ name: cat.name, type: cat.type, icon: cat.icon, color: cat.color });
    setFormOpen(true);
  }

  function openDelete(cat: Category) {
    setDeleting(cat);
    setDeleteError(null);
    setDeleteOpen(true);
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
        setCategories((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...values } : c)));
      } else if ("id" in result && result.id) {
        const id = result.id;
        setCategories((prev) => [...prev, { id, ...values, isDefault: false }]);
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
      setCategories((prev) => prev.filter((c) => c.id !== deleting.id));
      setDeleteOpen(false);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">קטגוריות</h3>
        <Button size="sm" onClick={openAdd}>
          הוסף קטגוריה
        </Button>
      </div>

      <div className="divide-y rounded-lg border">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center justify-between gap-3 px-4 py-3">
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
              <span
                className="size-4 shrink-0 rounded-full border"
                style={{ backgroundColor: cat.color }}
                title={cat.color}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => openEdit(cat)}>
                ערוך
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={cat.isDefault}
                onClick={() => !cat.isDefault && openDelete(cat)}
                className={
                  cat.isDefault
                    ? "cursor-not-allowed opacity-40"
                    : "text-red-600 hover:text-red-700"
                }
              >
                מחק
              </Button>
            </div>
          </div>
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
                          if (v) field.onChange(v);
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
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת קטגוריה</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-2 text-sm">
            האם למחוק את הקטגוריה &quot;{deleting?.name}&quot;? עסקאות משויכות יאבדו את הסיווג שלהן.
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
