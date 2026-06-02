"use client";

import { useState, useTransition } from "react";
import { Repeat, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
import { cancelRecurringAction } from "@/app/actions/recurring";
import type { SubscriptionRow } from "./page";

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

// ── Main component ────────────────────────────────────────────────────────────

export function SubscriptionsTable({ subscriptions }: { subscriptions: SubscriptionRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("nextExpectedDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [cancelingId, setCancelingId] = useState<string | null>(null);
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

  async function handleCancel(id: string) {
    setCancelingId(id);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    startTransition(async () => {
      const result = await cancelRecurringAction({ id });
      if (result.error) {
        setErrors((prev) => ({ ...prev, [id]: result.error! }));
      }
      setCancelingId(null);
    });
  }

  if (subscriptions.length === 0) {
    return <EmptyState />;
  }

  const sorted = sortRows(subscriptions, sortKey, sortDir);

  return (
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
            <TableHead className="w-24 text-right">פעולות</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.merchant}</TableCell>
              <TableCell className="text-muted-foreground">{CADENCE_LABELS[row.cadence]}</TableCell>
              <TableCell>
                <Amount amount={row.expectedAmount} currency="ILS" colorize={false} />
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatDate(row.nextExpectedDate)}
              </TableCell>
              <TableCell>
                <Badge
                  variant={row.status === "active" ? "default" : "secondary"}
                  className="text-xs"
                >
                  {STATUS_LABELS[row.status]}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive h-7 text-xs"
                    disabled={cancelingId === row.id || isPending}
                    onClick={() => handleCancel(row.id)}
                  >
                    {cancelingId === row.id ? "מבטל..." : "בטל"}
                  </Button>
                  {errors[row.id] && <p className="text-destructive text-xs">{errors[row.id]}</p>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
