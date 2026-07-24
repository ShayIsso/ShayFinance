"use client";

import * as React from "react";
import {
  Search,
  ChevronRight,
  ChevronLeft,
  Link2,
  Undo2,
  Repeat,
  SearchX,
  Inbox,
  Bot,
  Check,
  X,
  Download,
} from "lucide-react";
import { undoReconciliationAction } from "@/app/actions/reconciliation";
import {
  updateTransactionAction,
  bulkCategorizeAction,
  undoFanOutAction,
} from "@/app/actions/transactions";
import {
  acceptSuggestionAction,
  rejectSuggestionAction,
  undoAiAssignmentAction,
} from "@/app/actions/ai-review";
import type { FannedOutRow } from "@/lib/merchant-memory";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Category, CategoryTreeNode } from "@/lib/categories";
import {
  CategoryDot,
  GroupedCategorySelectItems,
  FilterCategorySelectItems,
} from "@/components/grouped-category-select-items";
import { Amount } from "@/components/ui/amount";
import { pageRange } from "@/lib/transactions/pagination";
import { buildFilterSearchParams } from "@/lib/transactions/filter-params";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type RecurringInfo = {
  id: string;
  merchant: string;
  cadence: "monthly" | "quarterly" | "annual";
};

type PendingSuggestion = {
  suggestionId: string;
  categoryId: string;
  categoryName: string;
  confidence: number;
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
  categorySource: "rule" | "memory" | "ai" | "user" | null;
  reconciliationGroupId: string | null;
  reconciliationConfirmedAt: string | null;
  recurringExpenseId: string | null;
  recurringExpense: RecurringInfo | null;
  pendingSuggestion: PendingSuggestion | null;
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

type TransactionsResponse = {
  data: Transaction[];
  total: number;
  page: number;
  pageSize: number;
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

// ── AI review affordances (ticket #149) ──────────────────────────────────────
// A pending suggestion renders as an inline chip with one-click accept/reject.
// Accept composes the same fan-out notice as manual assignment (recordAssignment
// at user-tier); reject just suppresses the suggestion. An ai-assigned row
// carries a marker instead, with one-click undo back to uncategorized.

function SuggestionChip({
  suggestion,
  onAccept,
  onReject,
}: {
  suggestion: PendingSuggestion;
  onAccept: () => Promise<void>;
  onReject: () => Promise<void>;
}) {
  const [busy, setBusy] = React.useState<"accept" | "reject" | null>(null);

  async function handleAccept() {
    setBusy("accept");
    await onAccept();
    setBusy(null);
  }

  async function handleReject() {
    setBusy("reject");
    await onReject();
    setBusy(null);
  }

  return (
    <div className="flex max-w-full items-center gap-1 rounded-md border border-dashed border-emerald-200 bg-emerald-50/60 px-1.5 py-0.5 text-xs">
      <span className="truncate text-emerald-800">הצעה: {suggestion.categoryName}</span>
      <span
        title={`רמת ביטחון ${suggestion.confidence} מתוך 7`}
        className="text-muted-foreground shrink-0"
      >
        ({suggestion.confidence}/7)
      </span>
      <button
        onClick={handleAccept}
        disabled={busy !== null}
        title="אשר הצעה"
        aria-label="אשר הצעה"
        className="shrink-0 text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <button
        onClick={handleReject}
        disabled={busy !== null}
        title="דחה הצעה"
        aria-label="דחה הצעה"
        className="text-muted-foreground shrink-0 hover:text-red-600 disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

function AiMarker({ onUndo }: { onUndo: () => Promise<void> }) {
  const [undoing, setUndoing] = React.useState(false);

  async function handleUndo() {
    setUndoing(true);
    await onUndo();
    setUndoing(false);
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span
        title="הקטגוריה שויכה אוטומטית על ידי AI"
        aria-label="קוטלג על ידי AI"
        className="text-muted-foreground inline-flex"
      >
        <Bot className="h-3.5 w-3.5" strokeWidth={1.5} />
      </span>
      <button
        onClick={handleUndo}
        disabled={undoing}
        title="בטל שיוך AI"
        aria-label="בטל שיוך AI"
        className="text-muted-foreground inline-flex items-center hover:text-red-600 disabled:opacity-50"
      >
        <Undo2 className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
    </span>
  );
}

function CategoryCell({
  transaction,
  categories,
  tree,
  onAssign,
  onAcceptSuggestion,
  onRejectSuggestion,
  onUndoAi,
}: {
  transaction: Transaction;
  categories: Category[];
  tree: CategoryTreeNode<Category>[];
  onAssign: (id: string, categoryId: string) => Promise<void>;
  onAcceptSuggestion: (transaction: Transaction) => Promise<void>;
  onRejectSuggestion: (transaction: Transaction) => Promise<void>;
  onUndoAi: (transaction: Transaction) => Promise<void>;
}) {
  const category = categories.find((c) => c.id === transaction.categoryId);

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <div className="flex w-full min-w-0 items-center gap-1">
        <Select
          value={transaction.categoryId ?? "__none__"}
          onValueChange={(v) => {
            if (v && v !== "__none__") onAssign(transaction.id, v);
          }}
        >
          <SelectTrigger className="hover:border-input hover:bg-background h-7 w-full min-w-[130px] gap-1 border-transparent bg-transparent px-1 text-sm shadow-none">
            {category ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <CategoryDot color={category.color} />
                <span className="truncate">{category.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">ללא קטגוריה</span>
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">
              <span className="text-muted-foreground">ללא קטגוריה</span>
            </SelectItem>
            <GroupedCategorySelectItems tree={tree} />
          </SelectContent>
        </Select>
        {transaction.categorySource === "ai" && <AiMarker onUndo={() => onUndoAi(transaction)} />}
      </div>
      {transaction.pendingSuggestion && (
        <SuggestionChip
          suggestion={transaction.pendingSuggestion}
          onAccept={() => onAcceptSuggestion(transaction)}
          onReject={() => onRejectSuggestion(transaction)}
        />
      )}
    </div>
  );
}

// ── Fan-out notice ────────────────────────────────────────────────────────────
// After a category assignment, merchant memory auto-applies the choice to
// same-key transactions (ADR-0010 §4): a count with one-click undo, not a
// confirmation modal. Undo restores the siblings' prior category+provenance;
// the memory entry the user wrote stays.

function FanOutNotice({
  count,
  onUndo,
  onDismiss,
}: {
  count: number;
  onUndo: () => Promise<void>;
  onDismiss: () => void;
}) {
  const [undoing, setUndoing] = React.useState(false);

  async function handleUndo() {
    setUndoing(true);
    await onUndo();
    setUndoing(false);
  }

  return (
    <div className="bg-muted/50 flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm">
      <span>הוחל על עוד {count} עסקאות של אותו בית עסק</span>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          סגור
        </Button>
        <Button size="sm" variant="outline" onClick={handleUndo} disabled={undoing}>
          {undoing ? "מבטל..." : "בטל החלה"}
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

export function TransactionsTable({
  categories,
  tree,
  initialCategoryFilter = "",
}: {
  categories: Category[];
  tree: CategoryTreeNode<Category>[];
  /** Seeds the categoryId sentinel from a dashboard deep link (#206) — e.g. `__uncategorized__`. */
  initialCategoryFilter?: string;
}) {
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [totalPages, setTotalPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [filters, setFilters] = React.useState<Filters>({
    dateFrom: "",
    dateTo: "",
    categoryId: initialCategoryFilter,
    status: "",
    search: "",
    page: 1,
    pageSize: 50,
  });
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = React.useState("");
  const [bulkApplying, setBulkApplying] = React.useState(false);
  const [fanOutNotice, setFanOutNotice] = React.useState<{
    count: number;
    rows: FannedOutRow[];
  } | null>(null);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- removed during Phase 2 Server Actions migration (see PRD issue #35)
    setLoading(true);

    const params = buildFilterSearchParams(filters);
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));

    fetch(`/api/transactions?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((res: TransactionsResponse) => {
        setTransactions(res.data);
        setTotal(res.total);
        setTotalPages(Math.max(1, Math.ceil(res.total / filters.pageSize)));
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
    startTransition(async () => {
      const result = await updateTransactionAction({ id, customDescription });
      if (!result.error) {
        setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, customDescription } : t)));
      }
    });
  }

  async function handleCategoryAssign(id: string, categoryId: string) {
    startTransition(async () => {
      const result = await updateTransactionAction({ id, categoryId });
      if (!result.error) {
        // Both the first-time label and the correction path land on 'user'
        // (changeTransactionCategory), which also clears any AI marker.
        setTransactions((prev) =>
          prev.map((t) => (t.id === id ? { ...t, categoryId, categorySource: "user" } : t)),
        );
        applyFanOutResult(categoryId, result.fannedOut);
      }
    });
  }

  function applyFanOutResult(categoryId: string, fannedOut: FannedOutRow[] | undefined) {
    if (fannedOut && fannedOut.length > 0) {
      const fannedIds = new Set(fannedOut.map((r) => r.id));
      // Fan-out siblings acquire the category via automation applying a
      // user-tier memory entry — provenance 'memory', not 'user' (ADR-0010 §4).
      setTransactions((prev) =>
        prev.map((t) => (fannedIds.has(t.id) ? { ...t, categoryId, categorySource: "memory" } : t)),
      );
      setFanOutNotice({ count: fannedOut.length, rows: fannedOut });
    } else {
      setFanOutNotice(null);
    }
  }

  async function handleUndoFanOut() {
    if (!fanOutNotice) return;
    const rows = fanOutNotice.rows;
    const result = await undoFanOutAction({ rows });
    if (!result.error) {
      setTransactions((prev) =>
        prev.map((t) => {
          const restored = rows.find((r) => r.id === t.id);
          return restored
            ? {
                ...t,
                categoryId: restored.previousCategoryId,
                categorySource: restored.previousCategorySource,
              }
            : t;
        }),
      );
      setFanOutNotice(null);
    }
  }

  async function handleAcceptSuggestion(tx: Transaction) {
    const suggestion = tx.pendingSuggestion;
    if (!suggestion) return;
    startTransition(async () => {
      const result = await acceptSuggestionAction({
        transactionId: tx.id,
        suggestionId: suggestion.suggestionId,
      });
      if (!result.error && result.accepted) {
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === tx.id
              ? {
                  ...t,
                  categoryId: suggestion.categoryId,
                  categorySource: "user",
                  pendingSuggestion: null,
                }
              : t,
          ),
        );
        applyFanOutResult(suggestion.categoryId, result.fannedOut);
      }
    });
  }

  async function handleRejectSuggestion(tx: Transaction) {
    const suggestion = tx.pendingSuggestion;
    if (!suggestion) return;
    startTransition(async () => {
      const result = await rejectSuggestionAction({ suggestionId: suggestion.suggestionId });
      if (!result.error && result.rejected) {
        setTransactions((prev) =>
          prev.map((t) => (t.id === tx.id ? { ...t, pendingSuggestion: null } : t)),
        );
      }
    });
  }

  async function handleUndoAiAssignment(tx: Transaction) {
    startTransition(async () => {
      const result = await undoAiAssignmentAction({ transactionId: tx.id });
      if (!result.error && result.undone) {
        setTransactions((prev) =>
          prev.map((t) => (t.id === tx.id ? { ...t, categoryId: null, categorySource: null } : t)),
        );
      }
    });
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
    const transactionIds = Array.from(selected);
    const categoryId = bulkCategoryId;
    startTransition(async () => {
      const result = await bulkCategorizeAction({ transactionIds, categoryId });
      if (!result.error) {
        setTransactions((prev) =>
          prev.map((t) => (selected.has(t.id) ? { ...t, categoryId, categorySource: "user" } : t)),
        );
        setSelected(new Set());
        setBulkCategoryId("");
        applyFanOutResult(categoryId, result.fannedOut);
      }
      setBulkApplying(false);
    });
  }

  const hasActiveFilters =
    filters.dateFrom || filters.dateTo || filters.categoryId || filters.status || filters.search;

  return (
    <div className="space-y-4">
      {fanOutNotice !== null && (
        <FanOutNotice
          count={fanOutNotice.count}
          onUndo={handleUndoFanOut}
          onDismiss={() => setFanOutNotice(null)}
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
                  : filters.categoryId === "__needs_review__"
                    ? "ממתין לסקירה"
                    : filters.categoryId
                      ? (categories.find((c) => c.id === filters.categoryId)?.name ?? "קטגוריה")
                      : "הכל"}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">הכל</SelectItem>
              <SelectItem value="__uncategorized__">ללא קטגוריה</SelectItem>
              <SelectItem value="__needs_review__">ממתין לסקירה</SelectItem>
              <FilterCategorySelectItems tree={tree} />
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
        {/* WYSIWYG export (issue #163): same query params the listing fetch
            just built above, minus paging — export always reads every row
            matching the active filters, so clearing filters exports everything. */}
        <a
          href={`/api/transactions/export?${buildFilterSearchParams(filters).toString()}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 self-end")}
        >
          <Download className="size-3.5" strokeWidth={1.5} />
          ייצוא ל-CSV
        </a>
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
              <GroupedCategorySelectItems tree={tree} />
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={applyBulkCategory}
            disabled={!bulkCategoryId || bulkApplying || isPending}
          >
            {bulkApplying ? "מחיל..." : "החל"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            ביטול
          </Button>
        </div>
      )}

      {/* Table */}
      <div
        className={`rounded-lg border transition-opacity duration-150 ${
          loading ? "opacity-70" : "opacity-100"
        }`}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="בחר הכל" />
              </TableHead>
              <TableHead className="w-28">תאריך</TableHead>
              <TableHead>תיאור</TableHead>
              <TableHead className="w-32 text-left">סכום</TableHead>
              <TableHead className="w-48">קטגוריה</TableHead>
              <TableHead className="w-24">סטטוס</TableHead>
              <TableHead className="w-16">פרטים</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell className="text-left">
                    <Skeleton className="ml-auto h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                </TableRow>
              ))
            ) : transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  {hasActiveFilters ? (
                    <EmptyState
                      icon={SearchX}
                      heading="לא נמצאו עסקאות התואמות את הסינון"
                      explainer="נסה לשנות את מסנני התאריך, הקטגוריה או החיפוש."
                      cta={{ label: "נקה סינון", onClick: clearFilters }}
                    />
                  ) : (
                    <EmptyState
                      icon={Inbox}
                      heading="אין עסקאות להצגה"
                      explainer="סנכרן את חשבונות הבנק שלך כדי לייבא עסקאות."
                      cta={{ label: "עבור לסנכרון", href: "/sync" }}
                    />
                  )}
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
                      tree={tree}
                      onAssign={handleCategoryAssign}
                      onAcceptSuggestion={handleAcceptSuggestion}
                      onRejectSuggestion={handleRejectSuggestion}
                      onUndoAi={handleUndoAiAssignment}
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
          {(() => {
            const { from, to } = pageRange(filters.page, filters.pageSize, total);
            return (
              <span className="text-muted-foreground text-sm">
                מציג {from}–{to} מתוך {total}
              </span>
            );
          })()}
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
