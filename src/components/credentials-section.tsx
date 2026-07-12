"use client";

import * as React from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
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
import { addCredentialSchema, editCredentialSchema } from "@/lib/credentials/schemas";
import {
  addCredentialAction,
  updateCredentialAction,
  deleteCredentialAction,
} from "@/app/actions/credentials";

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

/**
 * Superset of both per-bank field shapes so a single RHF instance backs the
 * form; the module-owned discriminated-union schema validates only the
 * selected bank's fields.
 */
type CredentialFormValues = {
  bankType: BankType;
  displayName: string;
  credentials: { id: string; num: string; username: string; password: string };
};

const EMPTY_CREDENTIAL_FIELDS = { id: "", num: "", username: "", password: "" };

const EMPTY_FORM: CredentialFormValues = {
  bankType: "discount",
  displayName: "",
  credentials: EMPTY_CREDENTIAL_FIELDS,
};

export function CredentialsSection() {
  const [credentials, setCredentials] = React.useState<Credential[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Credential | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Credential | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [isDeletePending, startDeleteTransition] = React.useTransition();

  // The resolver reads the current dialog mode (add vs edit) through a ref so
  // one stable RHF instance can validate with the add schema (password
  // required) or the edit schema (blank password = keep the stored one).
  const editModeRef = React.useRef(false);
  // Snapshot of the edit form's prefilled non-password fields, to detect
  // changes that would be silently dropped without a replacement password.
  const prefillRef = React.useRef(EMPTY_CREDENTIAL_FIELDS);
  const resolver = React.useMemo<Resolver<CredentialFormValues>>(() => {
    // The union's input type is narrower per-branch than the superset form
    // values, hence the cast; the schemas are module-owned and shared with
    // the Server Actions, so parity is asserted in tests, not here.
    const addResolver = zodResolver(
      addCredentialSchema,
    ) as unknown as Resolver<CredentialFormValues>;
    const editResolver = zodResolver(
      editCredentialSchema,
    ) as unknown as Resolver<CredentialFormValues>;
    return (values, context, options) =>
      (editModeRef.current ? editResolver : addResolver)(values, context, options);
  }, []);

  const form = useForm<CredentialFormValues>({ resolver, defaultValues: EMPTY_FORM });
  const bankType = form.watch("bankType");

  async function fetchCredentials() {
    const res = await fetch("/api/credentials");
    if (res.ok) {
      setCredentials(await res.json());
    }
    setLoading(false);
  }

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the list stays client-fetched: #118 scoped Server Actions to mutations only, the GET routes remain
    fetchCredentials();
  }, []);

  function openAdd() {
    editModeRef.current = false;
    setEditing(null);
    form.reset(EMPTY_FORM);
    setFormOpen(true);
  }

  async function openEdit(cred: Credential) {
    editModeRef.current = true;
    prefillRef.current = EMPTY_CREDENTIAL_FIELDS;
    setEditing(cred);
    form.reset({
      bankType: cred.bankType,
      displayName: cred.displayName,
      credentials: EMPTY_CREDENTIAL_FIELDS,
    });
    setFormOpen(true);

    // Prefill the non-password fields; the password field always starts blank
    // and the stored password is never sent to the client.
    const res = await fetch(`/api/credentials/${cred.id}`);
    if (res.ok) {
      const data = await res.json();
      const prefill = {
        ...EMPTY_CREDENTIAL_FIELDS,
        id: data.safeFields?.id ?? "",
        num: data.safeFields?.num ?? "",
        username: data.safeFields?.username ?? "",
      };
      prefillRef.current = prefill;
      form.setValue("credentials.id", prefill.id);
      form.setValue("credentials.num", prefill.num);
      form.setValue("credentials.username", prefill.username);
    }
  }

  function openDelete(cred: Credential) {
    setDeleteTarget(cred);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  function onSubmit(values: CredentialFormValues) {
    // Without a replacement password the stored credentials can't be
    // re-encrypted, so edits to the other login fields would be silently
    // dropped — demand a password instead of pretending they saved.
    if (editing && values.credentials.password === "") {
      const prefill = prefillRef.current;
      const loginFieldsChanged =
        values.bankType === "discount"
          ? values.credentials.id !== prefill.id || values.credentials.num !== prefill.num
          : values.credentials.username !== prefill.username;
      if (loginFieldsChanged) {
        form.setError("credentials.password", {
          message: "כדי לעדכן את פרטי ההתחברות יש להזין סיסמה",
        });
        return;
      }
    }

    startTransition(async () => {
      // Only the selected bank's fields leave the client.
      const bankCredentials =
        values.bankType === "discount"
          ? {
              id: values.credentials.id,
              password: values.credentials.password,
              num: values.credentials.num,
            }
          : { username: values.credentials.username, password: values.credentials.password };

      const result = editing
        ? await updateCredentialAction({
            id: editing.id,
            bankType: values.bankType,
            displayName: values.displayName,
            // A blank password means "keep the stored credentials" — the
            // payload then carries no credential fields at all.
            ...(values.credentials.password === "" ? {} : { credentials: bankCredentials }),
          })
        : await addCredentialAction({
            bankType: values.bankType,
            displayName: values.displayName,
            credentials: bankCredentials,
          });

      if (result.error || result.fieldErrors) {
        // Server-side validation lands in the same inline mechanism as client errors.
        applyActionErrors(form, result);
        return;
      }

      setFormOpen(false);
      await fetchCredentials();
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startDeleteTransition(async () => {
      const result = await deleteCredentialAction({ id: deleteTarget.id });
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteOpen(false);
      await fetchCredentials();
    });
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
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={`skeleton-${i}`} size="sm">
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex items-center gap-1">
                  <Skeleton className="h-7 w-7 rounded-md" />
                  <Skeleton className="h-7 w-7 rounded-md" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : credentials.length === 0 ? (
        <EmptyState
          icon={Landmark}
          heading="לא הוגדרו חשבונות בנק"
          explainer="הוסף את הבנק הראשון שלך כדי להתחיל לסנכרן עסקאות."
          cta={{ label: "הוסף חשבון", onClick: openAdd }}
        />
      ) : (
        <div className="space-y-2 transition-opacity duration-150">
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
            <DialogTitle>{editing ? "ערוך חשבון בנק" : "הוסף חשבון בנק"}</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <div className="space-y-4 pt-2">
                {!editing && (
                  <FormField
                    control={form.control}
                    name="bankType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>סוג בנק</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) => {
                            if (!v) return;
                            field.onChange(v);
                            // Bank switch swaps the field set — start it clean.
                            form.setValue("credentials", EMPTY_CREDENTIAL_FIELDS);
                            form.clearErrors([
                              "credentials.id",
                              "credentials.num",
                              "credentials.username",
                              "credentials.password",
                            ]);
                          }}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <span>{BANK_LABELS[field.value]}</span>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="discount">Bank Discount</SelectItem>
                            <SelectItem value="max">Max</SelectItem>
                            <SelectItem value="visaCal">Cal</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>שם תצוגה</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="לדוגמה: חשבון עיקרי" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {bankType === "discount" ? (
                  <FormField
                    control={form.control}
                    name="credentials.id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>תעודת זהות</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="מספר ת.ז." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="credentials.username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>שם משתמש</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="שם משתמש לאינטרנט" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="credentials.password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>סיסמה</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder={editing ? "ללא שינוי" : "סיסמה"}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {bankType === "discount" && (
                  <FormField
                    control={form.control}
                    name="credentials.num"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>מספר חשבון</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="מספר חשבון" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>מחיקת חשבון בנק</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            האם למחוק את &ldquo;{deleteTarget?.displayName}&rdquo;? פעולה זו אינה הפיכה.
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
            <Button variant="destructive" onClick={handleDelete} disabled={isDeletePending}>
              {isDeletePending ? "מוחק..." : "מחק"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
