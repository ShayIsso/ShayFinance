"use client";

import * as React from "react";
import { Search, ChevronRight, ChevronLeft, Link2, Undo2, Repeat } from "lucide-react";
import { undoReconciliationAction } from "@/app/actions/reconciliation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Category } from "@/lib/categories";
import { Amount } from "@/components/ui/amount";

// ── Types ───────────────────────────────────────────────────────────────────

type RecurringInfo = {
  id: string;
  merchant: string;
  cadence: "monthly" | "quarterly" | "annual";
};

type Transaction = {
  id: string;
  bankAccountId: string;
  date: string;
  description: string;
  customDescription: string | null;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  type: "normal" | "installments";
  installmentNumber: number | null;
  installmentTotal: number | null;
  status: "completed" | "pending";
  categoryId: string | null;
  reconciliationGroupId: string | null;
  reconciliationConfirmedAt: string | null;
  recurringExpenseId: string | null;
  recurringExpense: RecurringInfo | null;
};

type Filters = {
  dateFrom: string;
  dateTo: string;
  categoryId: string;
  status: string;
  search: string;
  page: number;
  pageSize: number;
};

type RuleSuggestion = {
  description: string;
  categoryId: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const CADENCE_LABELS: Record<RecurringInfo["cadence"], string> = {
  monthly: "חודשי",
  quarterly: "רבעוני",
  annual: "שנתי",
};

// ── Sub-components ───────────────────────────────────────────────────────────

function CategoryDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

function DescriptionCell({
  transaction,
  onSave,
}: {
  transaction: Transaction;
  onSave: (id: string, customDescription: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(transaction.customDescription ?? "");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    const trimmed = value.trim();
    const next = trimmed === "" ? null : trimmed;
    setEditing(false);
    await onSave(transaction.id, next);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") {
      setValue(transaction.customDescription ?? "");
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="h-7 text-sm"
      />
    );
  }

  const re = transaction.recurringExpense;
  const tooltipText = re
    ? `הוצאה חוזרת: ${re.merchant} (${CADENCE_LABELS[re.cadence]})`
    : undefined;

  return (
    <div className="flex items-start gap-1.5">
      {re && (
        <span title={tooltipText} aria-label={tooltipText} className="mt-0.5 shrink-0">
          <Repeat className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.5} />
        </span>
      )}
      <button
        onClick={() => setEditing(true)}
        className="group flex min-w-0 flex-1 flex-col items-start gap-0.5 text-right"
      >
        <span className="text-sm font-medium group-hover:underline">
          {transaction.customDescription ?? transaction.description}
        </span>
        {transaction.customDescription && (
          <span className="text-muted-foreground text-xs">{transaction.description}</span>
        )}
      </button>
    </div>
  );
}

function CategoryCell({
  transaction,
  categories,
  onAssign,
}: {
  transaction: Transaction;
  categories: Category[];
  onAssign: (id: string, categoryId: string) => Promise<void>;
}) {
  const category = categories.find((c) => c.id === transaction.categoryId);

  return (
    <Select
      value={transaction.categoryId ?? "__none__"}
      onValueChange={(v) => {
        if (v && v !== "__none__") onAssign(transaction.id, v);
      }}
    >
      <SelectTrigger className="hover:border-input hover:bg-background h-7 w-full min-w-[130px] gap-1 border-transparent bg-transparent px-1 text-sm shadow-none">
        {category ? (
          <span className="flex items-center gap-1.5">
            <CategoryDot color={category.color} />
            <span>{category.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">ללא קטגוריה</span>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">
          <span className="text-muted-foreground">ללא קטגוריה</span>
        </SelectItem>
        {categories.map((cat) => (
          <SelectItem key={cat.id} value={cat.id}>
            <span className="flex items-center gap-1.5">
              <CategoryDot color={cat.color} />
              {cat.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Rule suggestion banner ───────────────────────────────────────────────────

function RuleSuggestionBanner({
  suggestion,
  categories,
  onCreateRule,
  onDismiss,
}: {
  suggestion: RuleSuggestion;
  categories: Category[];
  onCreateRule: () => Promise<void>;
  onDismiss: () => void;
}) {
  const [creating, setCreating] = React.useState(false);
  const category = categories.find((c) => c.id === suggestion.categoryId);

  async function handleCreate() {
    setCreating(true);
    await onCreateRule();
    setCreating(false);
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-amber-50 px-4 py-3 text-sm">
      <span>
        ליצור כלל אוטומטי עבור &ldquo;{suggestion.description}&rdquo;
        {category ? ` → ${category.name}` : ""}?
      </span>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={onDismiss}>
          ביטול
        </Button>
        <Button size="sm" onClick={handleCreate} disabled={creating}>
          {creating ? "יוצר..." : "צור כלל"}
        </Button>
      </div>
    </div>
  );
}

// ── Undo reconciliation button ────────────────────────────────────────────────

function UndoReconciliationButton({ txnId, onUndone }: { txnId: string; onUndone: () => void }) {
  const [undoing, setUndoing] = React.useState(false);

  async function handleUndo() {
    setUndoing(true);
    const result = await undoReconciliationAction({ txnId });
    setUndoing(false);
    if (!result.error) {
      onUndone();
    }
  }

  return (
    <button
      onClick={handleUndo}
      disabled={undoing}
      title="בטל התאמה"
      className="text-muted-foreground inline-flex items-center hover:text-red-600 disabled:opacity-50"
      aria-label="בטל התאמה"
    >
      <Undo2 className="h-3.5 w-3.5" strokeWidth={1.5} />
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TransactionsTable({ categories }: { categories: Category[] }) {
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [totalPages, setTotalPages] = React.useState(1);
  const [filters, setFilters] = React.useState<Filters>({
    dateFrom: "",
    dateTo: "",
    categoryId: "",
    status: "",
    search: "",
    page: 1,
    pageSize: 50,
  });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = React.useState("");
  const [bulkApplying, setBulkApplying] = React.useState(false);
  const [ruleSuggestion, setRuleSuggestion] = React.useState<RuleSuggestion | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- removed during Phase 2 Server Actions migration (see PRD issue #35)
    setLoading(true);

    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.categoryId && filters.categoryId !== "__uncategorized__") {
      params.set("categoryId", filters.categoryId);
    }
    if (filters.status) params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));

    fetch(`/api/transactions?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: Transaction[]) => {
        let rows = data;
        if (filters.categoryId === "__uncategorized__") {
          rows = data.filter((t) => !t.categoryId);
        }
        setTransactions(rows);
        setTotalPages(data.length === filters.pageSize ? filters.page + 1 : filters.page);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name !== "AbortError") setLoading(false);
      });

    return () => controller.abort();
  }, [filters]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((f) => ({
      ...f,
      [key]: value,
      page: key === "page" ? (value as number) : 1,
    }));
    setSelected(new Set());
  }

  function clearFilters() {
    setFilters({
      dateFrom: "",
      dateTo: "",
      categoryId: "",
      status: "",
      search: "",
      page: 1,
      pageSize: filters.pageSize,
    });
    setSelected(new Set());
  }

  async function handleDescriptionSave(id: string, customDescription: string | null) {
    await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customDescription }),
    });
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, customDescription } : t)));
  }

  async function handleCategoryAssign(id: string, categoryId: string) {
    await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId }),
    });
    const tx = transactions.find((t) => t.id === id);
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, categoryId } : t)));
    if (tx) {
      setRuleSuggestion({
        description: tx.customDescription ?? tx.description,
        categoryId,
      });
    }
  }

  async function handleCreateRule() {
    if (!ruleSuggestion) return;
    await fetch("/api/category-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: ruleSuggestion.categoryId,
        matchType: "contains",
        pattern: ruleSuggestion.description,
        priority: 0,
      }),
    });
    setRuleSuggestion(null);
  }

  const allSelected = transactions.length > 0 && transactions.every((t) => selected.has(t.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(transactions.map((t) => t.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulkCategory() {
    if (!bulkCategoryId || selected.size === 0) return;
    setBulkApplying(true);
    await fetch("/api/transactions/bulk-categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionIds: Array.from(selected), categoryId: bulkCategoryId }),
    });
    setTransactions((prev) =>
      prev.map((t) => (selected.has(t.id) ? { ...t, categoryId: bulkCategoryId } : t)),
    );
    setSelected(new Set());
    setBulkCategoryId("");
    setBulkApplying(false);
  }

  const hasActiveFilters =
    filters.dateFrom || filters.dateTo || filters.categoryId || filters.status || filters.search;

  return (
    <div className="space-y-4">
      {ruleSuggestion && (
        <RuleSuggestionBanner
          suggestion={ruleSuggestion}
          categories={categories}
          onCreateRule={handleCreateRule}
          onDismiss={() => setRuleSuggestion(null)}
        />
      )}

      {/* Filter bar */}
      <div className="bg-card flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">מתאריך</span>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilter("dateFrom", e.target.value)}
            className="h-8 w-36 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">עד תאריך</span>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilter("dateTo", e.target.value)}
            className="h-8 w-36 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">קטגוריה</span>
          <Select
            value={filters.categoryId || "__all__"}
            onValueChange={(v) => setFilter("categoryId", v === "__all__" ? "" : (v ?? ""))}
          >
            <SelectTrigger className="h-8 w-44 text-sm">
              <span>
                {filters.categoryId === "__uncategorized__"
                  ? "ללא קטגוריה"
                  : filters.categoryId
                    ? (categories.find((c) => c.id === filters.categoryId)?.name ?? "קטגוריה")
                    : "הכל"}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">הכל</SelectItem>
              <SelectItem value="__uncategorized__">ללא קטגוריה</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">סטטוס</span>
          <Select
            value={filters.status || "__all__"}
            onValueChange={(v) => setFilter("status", v === "__all__" ? "" : (v ?? ""))}
          >
            <SelectTrigger className="h-8 w-32 text-sm">
              <span>
                {filters.status === "completed"
                  ? "הושלם"
                  : filters.status === "pending"
                    ? "ממתין"
                    : "הכל"}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">הכל</SelectItem>
              <SelectItem value="completed">הושלם</SelectItem>
              <SelectItem value="pending">ממתין</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-muted-foreground text-xs">חיפוש</span>
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 right-2 size-4 -translate-y-1/2" />
            <Input
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              placeholder="חיפוש לפי תיאור..."
              className="h-8 pr-8 text-sm"
            />
          </div>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 self-end">
            נקה סינון
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-blue-50 px-4 py-2 text-sm">
          <span className="font-medium">{selected.size} תנועות נבחרו</span>
          <Select value={bulkCategoryId} onValueChange={(v) => setBulkCategoryId(v ?? "")}>
            <SelectTrigger className="h-8 w-44 text-sm">
              <span>
                {bulkCategoryId
                  ? (categories.find((c) => c.id === bulkCategoryId)?.name ?? "בחר קטגוריה")
                  : "בחר קטגוריה"}
              </span>
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={applyBulkCategory} disabled={!bulkCategoryId || bulkApplying}>
            {bulkApplying ? "מחיל..." : "החל"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            ביטול
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="בחר הכל" />
              </TableHead>
              <TableHead className="w-28">תאריך</TableHead>
              <TableHead>תיאור</TableHead>
              <TableHead className="w-32 text-left">סכום</TableHead>
              <TableHead className="w-40">קטגוריה</TableHead>
              <TableHead className="w-24">סטטוס</TableHead>
              <TableHead className="w-16">פרטים</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-12 text-center">
                  טוען...
                </TableCell>
              </TableRow>
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-12 text-center">
                  אין תנועות להצגה. סנכרן חשבונות בנק כדי לייבא תנועות.
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((tx) => (
                <TableRow key={tx.id} data-state={selected.has(tx.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(tx.id)}
                      onCheckedChange={() => toggleOne(tx.id)}
                      aria-label="בחר שורה"
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(tx.date)}
                  </TableCell>
                  <TableCell>
                    <DescriptionCell transaction={tx} onSave={handleDescriptionSave} />
                  </TableCell>
                  <TableCell className="text-left">
                    <Amount
                      amount={tx.chargedAmount}
                      currency={tx.chargedCurrency ?? "ILS"}
                      colorize
                      className="text-sm font-medium"
                    />
                    {tx.originalCurrency !== "ILS" && (
                      <div className="text-muted-foreground text-xs">
                        <Amount
                          amount={tx.originalAmount}
                          currency={tx.originalCurrency}
                          colorize={false}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <CategoryCell
                      transaction={tx}
                      categories={categories}
                      onAssign={handleCategoryAssign}
                    />
                  </TableCell>
                  <TableCell>
                    {tx.status === "completed" ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        הושלם
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-amber-700"
                      >
                        ממתין
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {tx.type === "installments" &&
                        tx.installmentNumber != null &&
                        tx.installmentTotal != null && (
                          <Badge variant="secondary" className="text-xs">
                            {tx.installmentNumber}/{tx.installmentTotal}
                          </Badge>
                        )}
                      {tx.reconciliationGroupId && (
                        <span title="חלק מקבוצת התאמה" className="inline-flex">
                          <Link2 className="text-muted-foreground h-3.5 w-3.5" strokeWidth={1.5} />
                        </span>
                      )}
                      {tx.reconciliationGroupId && tx.reconciliationConfirmedAt && (
                        <UndoReconciliationButton
                          txnId={tx.id}
                          onUndone={() => {
                            setTransactions((prev) =>
                              prev.map((t) =>
                                t.id === tx.id
                                  ? {
                                      ...t,
                                      reconciliationGroupId: null,
                                      reconciliationConfirmedAt: null,
                                    }
                                  : t,
                              ),
                            );
                          }}
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <span>שורות בעמוד:</span>
          <Select
            value={String(filters.pageSize)}
            onValueChange={(v) => {
              if (v) setFilter("pageSize", Number(v) as Filters["pageSize"]);
            }}
          >
            <SelectTrigger className="h-7 w-16 text-sm">
              <span>{filters.pageSize}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            עמוד {filters.page} מתוך {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilter("page", filters.page - 1)}
            disabled={filters.page <= 1}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilter("page", filters.page + 1)}
            disabled={filters.page >= totalPages}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
