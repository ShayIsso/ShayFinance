"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

type BankType = "discount" | "max" | "visaCal";

type Credential = {
  id: string;
  bankType: BankType;
  displayName: string;
  createdAt: string;
};

const BANK_LABELS: Record<BankType, string> = {
  discount: "דיסקונט",
  max: "מקס",
  visaCal: "Cal",
};

type FormState = {
  bankType: BankType;
  displayName: string;
  discountId: string;
  discountNum: string;
  username: string;
  password: string;
};

const EMPTY_FORM: FormState = {
  bankType: "discount",
  displayName: "",
  discountId: "",
  discountNum: "",
  username: "",
  password: "",
};

export function CredentialsSection() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchCredentials() {
    const res = await fetch("/api/credentials");
    if (res.ok) {
      setCredentials(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchCredentials();
  }, []);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setFormOpen(true);
  }

  async function openEdit(cred: Credential) {
    setEditingId(cred.id);
    setError(null);
    setForm({ ...EMPTY_FORM, bankType: cred.bankType, displayName: cred.displayName });
    setFormOpen(true);

    const res = await fetch(`/api/credentials/${cred.id}`);
    if (res.ok) {
      const data = await res.json();
      setForm((prev) => ({
        ...prev,
        discountId: data.safeFields?.id ?? "",
        discountNum: data.safeFields?.num ?? "",
        username: data.safeFields?.username ?? "",
      }));
    }
  }

  function openDelete(cred: Credential) {
    setDeleteTarget(cred);
    setDeleteOpen(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (editingId) {
        const body: { displayName?: string; credentials?: Record<string, string> } = {
          displayName: form.displayName,
        };
        if (form.password !== "") {
          body.credentials =
            form.bankType === "discount"
              ? { id: form.discountId, password: form.password, num: form.discountNum }
              : { username: form.username, password: form.password };
        }
        const res = await fetch(`/api/credentials/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "שגיאה בעדכון");
        }
      } else {
        const credentials =
          form.bankType === "discount"
            ? { id: form.discountId, password: form.password, num: form.discountNum }
            : { username: form.username, password: form.password };
        const res = await fetch("/api/credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankType: form.bankType,
            displayName: form.displayName,
            credentials,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "שגיאה בהוספה");
        }
      }
      setFormOpen(false);
      await fetchCredentials();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      await fetch(`/api/credentials/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteOpen(false);
      await fetchCredentials();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">חשבונות בנק</h3>
        <Button onClick={openAdd} size="sm">
          <Plus />
          הוסף חשבון
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">טוען...</p>
      ) : credentials.length === 0 ? (
        <p className="text-muted-foreground text-sm">אין חשבונות בנק מוגדרים.</p>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => (
            <Card key={cred.id} size="sm">
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{BANK_LABELS[cred.bankType]}</Badge>
                  <span className="text-sm font-medium">{cred.displayName}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(cred)}>
                    <Pencil />
                    <span className="sr-only">ערוך</span>
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => openDelete(cred)}>
                    <Trash2 className="text-destructive" />
                    <span className="sr-only">מחק</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "ערוך חשבון בנק" : "הוסף חשבון בנק"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {!editingId && (
              <div className="space-y-1.5">
                <Label htmlFor="bankType">סוג בנק</Label>
                <Select
                  value={form.bankType}
                  onValueChange={(val) =>
                    setForm({
                      ...EMPTY_FORM,
                      bankType: val as BankType,
                      displayName: form.displayName,
                    })
                  }
                >
                  <SelectTrigger id="bankType" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="discount">Bank Discount</SelectItem>
                    <SelectItem value="max">Max</SelectItem>
                    <SelectItem value="visaCal">Cal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="displayName">שם תצוגה</Label>
              <Input
                id="displayName"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="לדוגמה: חשבון עיקרי"
              />
            </div>

            {form.bankType === "discount" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="discountId">תעודת זהות</Label>
                  <Input
                    id="discountId"
                    value={form.discountId}
                    onChange={(e) => setForm({ ...form, discountId: e.target.value })}
                    placeholder="מספר ת.ז."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="discountPassword">סיסמה</Label>
                  <Input
                    id="discountPassword"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingId ? "ללא שינוי" : "סיסמה"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="discountNum">מספר חשבון</Label>
                  <Input
                    id="discountNum"
                    value={form.discountNum}
                    onChange={(e) => setForm({ ...form, discountNum: e.target.value })}
                    placeholder="מספר חשבון"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="username">שם משתמש</Label>
                  <Input
                    id="username"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="שם משתמש לאינטרנט"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">סיסמה</Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingId ? "ללא שינוי" : "סיסמה"}
                  />
                </div>
              </>
            )}

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת חשבון בנק</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            האם למחוק את &ldquo;{deleteTarget?.displayName}&rdquo;? פעולה זו אינה הפיכה.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting ? "מוחק..." : "מחק"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
