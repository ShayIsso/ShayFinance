"use client";

import { useState, useTransition } from "react";
import {
  Repeat,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  BellOff,
  Sparkles,
  CircleSlash,
} from "lucide-react";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cancelRecurringAction,
  acceptPriceChangeAction,
  pauseRecurringAction,
  confirmNewlyDetectedAction,
  dismissNewlyDetectedAction,
} from "@/app/actions/recurring";
import type { SubscriptionRow, AnomalyAlerts } from "./page";
import type { Category } from "@/lib/categories";

// ── Hebrew labels ─────────────────────────────────────────────────────────────

const CADENCE_LABELS: Record<SubscriptionRow["cadence"], string> = {
  monthly: "חודשי",
  quarterly: "רבעוני",
  annual: "שנתי",
};

const STATUS_LABELS: Record<SubscriptionRow["status"], string> = {
  active: "פעיל",
  paused: "מושהה",
  canceled: "בוטל",
};

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterTab =
  | "all"
  | "price_change"
  | "missed_payment"
  | "newly_detected"
  | "dormant"
  | "active";

const FILTER_LABELS: Record<FilterTab, string> = {
  all: "הכל",
  price_change: "שינוי במחיר",
  missed_payment: "תשלום שלא בוצע",
  newly_detected: "זוהה חדש",
  dormant: "לא פעיל",
  active: "פעיל",
};

// ── Sorting ───────────────────────────────────────────────────────────────────

type SortKey = "expectedAmount" | "nextExpectedDate";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="mr-1 h-3.5 w-3.5 opacity-50" />;
  return sortDir === "asc" ? (
    <ArrowUp className="mr-1 h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="mr-1 h-3.5 w-3.5" />
  );
}

function sortRows(rows: SubscriptionRow[], key: SortKey, dir: SortDir): SubscriptionRow[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === "expectedAmount") {
      cmp = a.expectedAmount - b.expectedAmount;
    } else {
      cmp = a.nextExpectedDate.localeCompare(b.nextExpectedDate);
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── Date formatter (client-side to prevent hydration mismatch) ────────────────

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("he-IL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(year, month - 1, day));
}

function formatDateObj(date: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Repeat className="text-muted-foreground mb-4 h-12 w-12 opacity-40" />
      <p className="text-muted-foreground text-base font-medium">עדיין לא זוהו הוצאות חוזרות</p>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm opacity-75">
        לאחר מספר חודשים של נתונים, המערכת תזהה אוטומטית תשלומים חוזרים כגון מנויים, ביטוחים,
        וחיובים תקופתיים.
      </p>
    </div>
  );
}

// ── Anomaly strip ─────────────────────────────────────────────────────────────

function AnomalyStrip({
  alerts,
  onFilterChange,
  activeFilter,
}: {
  alerts: AnomalyAlerts;
  onFilterChange: (tab: FilterTab) => void;
  activeFilter: FilterTab;
}) {
  const totalAnomalies =
    alerts.priceChanges.length +
    alerts.missedPayments.length +
    alerts.newlyDetected.length +
    alerts.dormant.length;

  if (totalAnomalies === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap gap-4 text-sm">
        {alerts.priceChanges.length > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange(activeFilter === "price_change" ? "all" : "price_change")}
            className={`flex items-center gap-1.5 rounded px-2 py-1 transition-colors ${
              activeFilter === "price_change"
                ? "bg-amber-100 text-amber-800"
                : "text-amber-700 hover:bg-amber-50"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="font-medium">{alerts.priceChanges.length}</span>
            <span>שינויי מחיר</span>
          </button>
        )}
        {alerts.missedPayments.length > 0 && (
          <button
            type="button"
            onClick={() =>
              onFilterChange(activeFilter === "missed_payment" ? "all" : "missed_payment")
            }
            className={`flex items-center gap-1.5 rounded px-2 py-1 transition-colors ${
              activeFilter === "missed_payment"
                ? "bg-red-100 text-red-800"
                : "text-red-700 hover:bg-red-50"
            }`}
          >
            <BellOff className="h-3.5 w-3.5" />
            <span className="font-medium">{alerts.missedPayments.length}</span>
            <span>תשלומים שלא בוצעו</span>
          </button>
        )}
        {alerts.newlyDetected.length > 0 && (
          <button
            type="button"
            onClick={() =>
              onFilterChange(activeFilter === "newly_detected" ? "all" : "newly_detected")
            }
            className={`flex items-center gap-1.5 rounded px-2 py-1 transition-colors ${
              activeFilter === "newly_detected"
                ? "bg-blue-100 text-blue-800"
                : "text-blue-700 hover:bg-blue-50"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="font-medium">{alerts.newlyDetected.length}</span>
            <span>זוהו חדש</span>
          </button>
        )}
        {alerts.dormant.length > 0 && (
          <button
            type="button"
            onClick={() => onFilterChange(activeFilter === "dormant" ? "all" : "dormant")}
            className={`flex items-center gap-1.5 rounded px-2 py-1 transition-colors ${
              activeFilter === "dormant"
                ? "bg-zinc-200 text-zinc-800"
                : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <CircleSlash className="h-3.5 w-3.5" />
            <span className="font-medium">{alerts.dormant.length}</span>
            <span>לא פעילים</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Naming dialog (inline) ────────────────────────────────────────────────────

function NamingForm({
  subId,
  categories,
  onDone,
}: {
  subId: string;
  categories: Category[];
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await confirmNewlyDetectedAction({
        id: subId,
        name: name.trim(),
        categoryId: categoryId || null,
      });
      if (result.error) {
        setError(result.error);
      } else {
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded border bg-white p-3 text-sm">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700" htmlFor={`name-${subId}`}>
          שם המנוי
        </label>
        <input
          id={`name-${subId}`}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="לדוגמה: ספוטיפיי"
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none"
          dir="rtl"
        />
      </div>
      {categories.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700" htmlFor={`cat-${subId}`}>
            קטגוריה (אופציונלי)
          </label>
          <select
            id={`cat-${subId}`}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none"
            dir="rtl"
          >
            <option value="">ללא קטגוריה</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending} className="h-7 text-xs">
          {isPending ? "שומר..." : "אשר"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onDone}
          disabled={isPending}
        >
          ביטול
        </Button>
      </div>
    </form>
  );
}

// ── Anomaly badge for rows ────────────────────────────────────────────────────

function AnomalyDetail({
  rowId,
  rowExpectedAmount,
  alerts,
  categories,
  isPending,
  onAcceptPrice,
  onPause,
  onCancel,
  onDismiss,
}: {
  rowId: string;
  rowExpectedAmount: number;
  alerts: AnomalyAlerts;
  categories: Category[];
  isPending: boolean;
  onAcceptPrice: (id: string) => void;
  onPause: (id: string) => void;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const [showNaming, setShowNaming] = useState(false);

  const priceAlert = alerts.priceChanges.find((a) => a.patternId === rowId);
  const missedAlert = alerts.missedPayments.find((a) => a.patternId === rowId);
  const newAlert = alerts.newlyDetected.find((a) => a.patternId === rowId);
  const dormantAlert = alerts.dormant.find((a) => a.patternId === rowId);

  if (!priceAlert && !missedAlert && !newAlert && !dormantAlert) return null;

  return (
    <div className="mt-1 space-y-1.5 text-xs">
      {priceAlert && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2">
          <p className="mb-1.5 font-medium text-amber-800">
            המחיר השתנה מ-
            <Amount amount={priceAlert.oldAmount} currency="ILS" colorize={false} />
            {" ל-"}
            <Amount amount={priceAlert.newAmount} currency="ILS" colorize={false} />
            {" ("}
            {priceAlert.pctChange > 0 ? "+" : ""}
            {(priceAlert.pctChange * 100).toFixed(1)}
            {"%)"}
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-6 border-amber-400 text-xs text-amber-800 hover:bg-amber-100"
              disabled={isPending}
              onClick={() => onAcceptPrice(rowId)}
            >
              אשר מחיר חדש
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive h-6 text-xs"
              disabled={isPending}
              onClick={() => onCancel(rowId)}
            >
              בטל מנוי
            </Button>
          </div>
        </div>
      )}
      {missedAlert && (
        <div className="rounded border border-red-200 bg-red-50 p-2">
          <p className="mb-1.5 font-medium text-red-800">
            {"צפוי "}
            <Amount amount={rowExpectedAmount} currency="ILS" colorize={false} />
            {" בתאריך "}
            {formatDateObj(missedAlert.nextExpectedDate)}
            {", לא זוהה"}
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-6 border-red-300 text-xs text-red-800 hover:bg-red-100"
              disabled={isPending}
              onClick={() => onPause(rowId)}
            >
              השהה
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive h-6 text-xs"
              disabled={isPending}
              onClick={() => onCancel(rowId)}
            >
              בטל מנוי
            </Button>
          </div>
        </div>
      )}
      {dormantAlert && (
        <div className="rounded border border-zinc-200 bg-zinc-50 p-2">
          <p className="mb-1.5 font-medium text-zinc-700">
            {"לא זוהה חיוב מאז "}
            {formatDateObj(dormantAlert.nextExpectedDate)}
            {` (מעל ${dormantAlert.daysOverdue} ימים) — ייתכן שהמנוי בוטל`}
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-6 border-zinc-300 text-xs text-zinc-700 hover:bg-zinc-100"
              disabled={isPending}
              onClick={() => onCancel(rowId)}
            >
              בטל מנוי
            </Button>
          </div>
        </div>
      )}
      {newAlert && (
        <div className="rounded border border-blue-200 bg-blue-50 p-2">
          <p className="mb-1.5 font-medium text-blue-800">
            <Amount amount={newAlert.expectedAmount} currency="ILS" colorize={false} />
            {" · "}
            {CADENCE_LABELS[newAlert.cadence]}
            {" — תן שם למנוי?"}
          </p>
          {showNaming ? (
            <NamingForm subId={rowId} categories={categories} onDone={() => setShowNaming(false)} />
          ) : (
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-6 border-blue-300 text-xs text-blue-800 hover:bg-blue-100"
                disabled={isPending}
                onClick={() => setShowNaming(true)}
              >
                אשר ותן שם
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-6 text-xs"
                disabled={isPending}
                onClick={() => onDismiss(rowId)}
              >
                התעלם
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Anomaly badge pill for status cell ───────────────────────────────────────

function AnomalyBadge({ rowId, alerts }: { rowId: string; alerts: AnomalyAlerts }) {
  const hasPriceChange = alerts.priceChanges.some((a) => a.patternId === rowId);
  const hasDormant = alerts.dormant.some((a) => a.patternId === rowId);
  const hasMissed = alerts.missedPayments.some((a) => a.patternId === rowId);
  const hasNew = alerts.newlyDetected.some((a) => a.patternId === rowId);

  if (hasPriceChange) {
    return (
      <Badge variant="outline" className="border-amber-400 bg-amber-50 text-xs text-amber-700">
        שינוי מחיר
      </Badge>
    );
  }
  // Dormant takes priority over missed: a long-overdue pattern is "likely
  // cancelled", not merely a one-off missed payment.
  if (hasDormant) {
    return (
      <Badge variant="outline" className="border-zinc-300 bg-zinc-50 text-xs text-zinc-600">
        לא פעיל
      </Badge>
    );
  }
  if (hasMissed) {
    return (
      <Badge variant="outline" className="border-red-300 bg-red-50 text-xs text-red-700">
        לא בוצע
      </Badge>
    );
  }
  if (hasNew) {
    return (
      <Badge variant="outline" className="border-blue-300 bg-blue-50 text-xs text-blue-700">
        חדש
      </Badge>
    );
  }
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export function SubscriptionsTable({
  subscriptions,
  alerts,
  categories,
}: {
  subscriptions: SubscriptionRow[];
  alerts: AnomalyAlerts;
  categories: Category[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("nextExpectedDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function handleSortClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function clearError(id: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleCancel(id: string) {
    setCancelingId(id);
    clearError(id);
    startTransition(async () => {
      const result = await cancelRecurringAction({ id });
      if (result.error) {
        setErrors((prev) => ({ ...prev, [id]: result.error! }));
      }
      setCancelingId(null);
    });
  }

  async function handleAcceptPrice(id: string) {
    setPendingActionId(id);
    clearError(id);
    startTransition(async () => {
      const result = await acceptPriceChangeAction({ id });
      if (result.error) {
        setErrors((prev) => ({ ...prev, [id]: result.error! }));
      }
      setPendingActionId(null);
    });
  }

  async function handlePause(id: string) {
    setPendingActionId(id);
    clearError(id);
    startTransition(async () => {
      const result = await pauseRecurringAction({ id });
      if (result.error) {
        setErrors((prev) => ({ ...prev, [id]: result.error! }));
      }
      setPendingActionId(null);
    });
  }

  async function handleDismiss(id: string) {
    setPendingActionId(id);
    clearError(id);
    startTransition(async () => {
      const result = await dismissNewlyDetectedAction({ id });
      if (result.error) {
        setErrors((prev) => ({ ...prev, [id]: result.error! }));
      }
      setPendingActionId(null);
    });
  }

  if (subscriptions.length === 0) {
    return <EmptyState />;
  }

  // Build a set of IDs that have anomalies for filter matching.
  const priceChangeIds = new Set(alerts.priceChanges.map((a) => a.patternId));
  const missedIds = new Set(alerts.missedPayments.map((a) => a.patternId));
  const newlyDetectedIds = new Set(alerts.newlyDetected.map((a) => a.patternId));
  const dormantIds = new Set(alerts.dormant.map((a) => a.patternId));

  function matchesFilter(row: SubscriptionRow): boolean {
    switch (activeFilter) {
      case "all":
        // Dormant patterns appear ONLY under the dormant tab.
        return !dormantIds.has(row.id);
      case "price_change":
        return priceChangeIds.has(row.id);
      case "missed_payment":
        return missedIds.has(row.id);
      case "newly_detected":
        return newlyDetectedIds.has(row.id);
      case "dormant":
        return dormantIds.has(row.id);
      case "active":
        // Dormant patterns appear ONLY under the dormant tab.
        return row.status === "active" && !dormantIds.has(row.id);
    }
  }

  const sorted = sortRows(subscriptions, sortKey, sortDir);
  const filtered = sorted.filter(matchesFilter);

  const hasAnomalies =
    alerts.priceChanges.length > 0 ||
    alerts.missedPayments.length > 0 ||
    alerts.newlyDetected.length > 0 ||
    alerts.dormant.length > 0;

  return (
    <div className="space-y-4">
      {/* Anomaly strip */}
      <AnomalyStrip alerts={alerts} onFilterChange={setActiveFilter} activeFilter={activeFilter} />

      {/* Filter tabs */}
      {hasAnomalies && (
        <div className="flex flex-wrap gap-1 border-b border-zinc-200 pb-2">
          {(
            [
              "all",
              "price_change",
              "missed_payment",
              "newly_detected",
              "dormant",
              "active",
            ] as FilterTab[]
          ).map((tab) => {
            const isVisible =
              tab === "all" ||
              tab === "active" ||
              (tab === "price_change" && alerts.priceChanges.length > 0) ||
              (tab === "missed_payment" && alerts.missedPayments.length > 0) ||
              (tab === "newly_detected" && alerts.newlyDetected.length > 0) ||
              (tab === "dormant" && alerts.dormant.length > 0);

            if (!isVisible) return null;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveFilter(tab)}
                className={`rounded px-3 py-1 text-sm transition-colors ${
                  activeFilter === tab
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {FILTER_LABELS[tab]}
              </button>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">שם העסק</TableHead>
              <TableHead className="text-right">תדירות</TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-3 h-8 font-medium"
                  onClick={() => handleSortClick("expectedAmount")}
                >
                  סכום צפוי
                  <SortIcon col="expectedAmount" sortKey={sortKey} sortDir={sortDir} />
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-3 h-8 font-medium"
                  onClick={() => handleSortClick("nextExpectedDate")}
                >
                  תשלום הבא
                  <SortIcon col="nextExpectedDate" sortKey={sortKey} sortDir={sortDir} />
                </Button>
              </TableHead>
              <TableHead className="text-right">סטטוס</TableHead>
              <TableHead className="w-32 text-right">פעולות</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center text-sm">
                  אין תוצאות עבור הסינון הנוכחי
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => {
                const displayLabel = row.displayName ?? row.merchant;
                const isRowPending =
                  cancelingId === row.id || pendingActionId === row.id || isPending;

                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      <div>
                        <span>{displayLabel}</span>
                        <AnomalyDetail
                          rowId={row.id}
                          rowExpectedAmount={row.expectedAmount}
                          alerts={alerts}
                          categories={categories}
                          isPending={isRowPending}
                          onAcceptPrice={handleAcceptPrice}
                          onPause={handlePause}
                          onCancel={handleCancel}
                          onDismiss={handleDismiss}
                        />
                        {errors[row.id] && (
                          <p className="text-destructive mt-1 text-xs">{errors[row.id]}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {CADENCE_LABELS[row.cadence]}
                    </TableCell>
                    <TableCell>
                      <Amount amount={row.expectedAmount} currency="ILS" colorize={false} />
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(row.nextExpectedDate)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          variant={row.status === "active" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {STATUS_LABELS[row.status]}
                        </Badge>
                        <AnomalyBadge rowId={row.id} alerts={alerts} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive h-7 text-xs"
                          disabled={isRowPending}
                          onClick={() => handleCancel(row.id)}
                        >
                          {cancelingId === row.id ? "מבטל..." : "בטל"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
