"use client";

import * as React from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { previewRetroactiveApplyAction, applyRetroactivelyAction } from "@/app/actions/rules";

type MatchType = "contains" | "starts_with" | "exact" | "regex";

type CategoryRule = {
  id: string;
  categoryId: string;
  matchType: MatchType;
  pattern: string;
  priority: number;
};

type Category = {
  id: string;
  name: string;
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

type FormState = {
  categoryId: string;
  matchType: MatchType;
  pattern: string;
  priority: number;
};

function emptyForm(categories: Category[]): FormState {
  return {
    categoryId: categories[0]?.id ?? "",
    matchType: "contains",
    pattern: "",
    priority: 0,
  };
}

export function RulesSection({
  initialRules,
  categories,
}: {
  initialRules: CategoryRule[];
  categories: Category[];
}) {
  const [rules, setRules] = React.useState<CategoryRule[]>(initialRules);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CategoryRule | null>(null);
  const [deleting, setDeleting] = React.useState<CategoryRule | null>(null);
  const [applying, setApplying] = React.useState<CategoryRule | null>(null);
  const [applyPreviewCount, setApplyPreviewCount] = React.useState<number | null>(null);
  const [applySuccess, setApplySuccess] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>(() => emptyForm(categories));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const categoryMap = React.useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  function openAdd() {
    setEditing(null);
    setForm(emptyForm(categories));
    setError(null);
    setFormOpen(true);
  }

  function openEdit(rule: CategoryRule) {
    setEditing(rule);
    setForm({
      categoryId: rule.categoryId,
      matchType: rule.matchType,
      pattern: rule.pattern,
      priority: rule.priority,
    });
    setError(null);
    setFormOpen(true);
  }

  function openDelete(rule: CategoryRule) {
    setDeleting(rule);
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

  async function handleSave() {
    if (!form.pattern.trim()) {
      setError("תבנית היא שדה חובה");
      return;
    }
    if (!form.categoryId) {
      setError("יש לבחור קטגוריה");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const res = await fetch(`/api/category-rules/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("שגיאה בשמירה");
        setRules((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...form } : r)));
      } else {
        const res = await fetch("/api/category-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("שגיאה ביצירה");
        const { id } = await res.json();
        setRules((prev) => [...prev, { id, ...form }].sort((a, b) => b.priority - a.priority));
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
      const res = await fetch(`/api/category-rules/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("שגיאה במחיקה");
      setRules((prev) => prev.filter((r) => r.id !== deleting.id));
      setDeleteOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
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
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">כללי סיווג</h3>
        <Button size="sm" onClick={openAdd}>
          הוסף כלל
        </Button>
      </div>

      <div className="divide-y rounded-lg border">
        {rules.length === 0 && (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">אין כללים מוגדרים</p>
        )}
        {rules.map((rule) => (
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

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "ערוך כלל" : "הוסף כלל"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>קטגוריה</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => {
                  if (v) setForm((f) => ({ ...f, categoryId: v }));
                }}
              >
                <SelectTrigger className="w-full">
                  <span>{categoryMap[form.categoryId] ?? "בחר קטגוריה"}</span>
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>סוג התאמה</Label>
              <Select
                value={form.matchType}
                onValueChange={(v) => {
                  if (v) setForm((f) => ({ ...f, matchType: v as MatchType }));
                }}
              >
                <SelectTrigger className="w-full">
                  <span>{MATCH_TYPE_LABELS[form.matchType]}</span>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(MATCH_TYPE_LABELS) as MatchType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {MATCH_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-pattern">תבנית</Label>
              <Input
                id="rule-pattern"
                value={form.pattern}
                onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
                placeholder="לדוגמה: שופרסל"
                dir="auto"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-priority">עדיפות</Label>
              <Input
                id="rule-priority"
                type="number"
                min={0}
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: Math.max(0, parseInt(e.target.value) || 0) }))
                }
              />
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
            <DialogTitle>מחיקת כלל</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground py-2 text-sm">
            האם למחוק את הכלל עבור &quot;{deleting?.pattern}&quot;?
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={saving}>
              ביטול
            </Button>
            <Button
              onClick={handleDelete}
              disabled={saving}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {saving ? "מוחק..." : "מחק"}
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
