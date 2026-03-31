"use client";

import * as React from "react";
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
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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

type FormState = {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  type: "expense",
  icon: "MoreHorizontal",
  color: "#6366f1",
};

export function CategoriesSection({
  initialCategories,
}: {
  initialCategories: Category[];
}) {
  const [categories, setCategories] = React.useState<Category[]>(initialCategories);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [deleting, setDeleting] = React.useState<Category | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setForm({ name: cat.name, type: cat.type, icon: cat.icon, color: cat.color });
    setError(null);
    setFormOpen(true);
  }

  function openDelete(cat: Category) {
    setDeleting(cat);
    setDeleteOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError("שם הקטגוריה הוא שדה חובה");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const res = await fetch(`/api/categories/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("שגיאה בשמירה");
        setCategories((prev) =>
          prev.map((c) => (c.id === editing.id ? { ...c, ...form } : c)),
        );
      } else {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("שגיאה ביצירה");
        const { id } = await res.json();
        setCategories((prev) => [...prev, { id, ...form, isDefault: false }]);
      }
      setFormOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/categories/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("שגיאה במחיקה");
      setCategories((prev) => prev.filter((c) => c.id !== deleting.id));
      setDeleteOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
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
                className={cat.isDefault ? "opacity-40 cursor-not-allowed" : "text-red-600 hover:text-red-700"}
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
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">שם</Label>
              <Input
                id="cat-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="שם הקטגוריה"
              />
            </div>

            <div className="space-y-1.5">
              <Label>סוג</Label>
              <Select
                value={form.type}
                onValueChange={(v) => { if (v) setForm((f) => ({ ...f, type: v as CategoryType })); }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as CategoryType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>אייקון</Label>
              <Select
                value={form.icon}
                onValueChange={(v) => { if (v) setForm((f) => ({ ...f, icon: v as string })); }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_ICONS.map((iconName) => {
                    const Icon = ICON_MAP[iconName]!;
                    return (
                      <SelectItem key={iconName} value={iconName}>
                        <Icon className="size-4" />
                        {iconName}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-color">צבע</Label>
              <div className="flex items-center gap-2">
                <input
                  id="cat-color"
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-9 w-12 cursor-pointer rounded border p-1"
                />
                <span className="text-sm text-muted-foreground">{form.color}</span>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              ביטול
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת קטגוריה</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            האם למחוק את הקטגוריה &quot;{deleting?.name}&quot;? עסקאות משויכות יאבדו את הסיווג שלהן.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={saving}>
              ביטול
            </Button>
            <Button
              onClick={handleDelete}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {saving ? "מוחק..." : "מחק"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
