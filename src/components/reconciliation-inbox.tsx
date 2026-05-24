"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  approveReconciliationAction,
  rejectReconciliationAction,
  approveReconciliationsAction,
  rejectReconciliationsAction,
} from "@/app/actions/reconciliation";

// ── Types ────────────────────────────────────────────────────────────────────

type InboxMember = {
  id: string;
  bankType: "discount" | "max" | "visaCal";
  credentialDisplayName: string;
  date: string;
  description: string;
  chargedAmount: number;
  categoryName: string | null;
  reconciliationRole: "settlement_lump" | "settlement_detail" | "transfer_pair";
};

type InboxGroup = {
  groupId: string;
  confidence: number;
  members: InboxMember[];
};

type Props = {
  groups: InboxGroup[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const BANK_LABELS: Record<string, string> = {
  discount: "דיסקונט",
  max: "מקס",
  visaCal: "ויזה כאל",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function confidenceLabel(confidence: number): string {
  const pct = Math.round(confidence * 100);
  return `${pct}%`;
}

function confidenceVariant(confidence: number): "outline" | "secondary" {
  return confidence >= 0.9 ? "outline" : "secondary";
}

// ── Group summary line ────────────────────────────────────────────────────────

function GroupSummary({ members }: { members: InboxMember[] }) {
  const lump = members.find((m) => m.reconciliationRole === "settlement_lump");
  const details = members.filter((m) => m.reconciliationRole === "settlement_detail");
  const pairs = members.filter((m) => m.reconciliationRole === "transfer_pair");

  if (lump && details.length > 0) {
    // P1 settlement
    const detailsTotal = details.reduce((sum, d) => sum + d.chargedAmount, 0);
    return (
      <p className="text-muted-foreground text-sm">
        <span className="font-medium text-zinc-800">{formatCurrency(lump.chargedAmount)}</span>
        {" חיוב בנקאי "}
        <span className="text-zinc-500">&#8596;</span>
        {` ${details.length} תנועות כרטיס בסך `}
        <span className="font-medium text-zinc-800">{formatCurrency(detailsTotal)}</span>
        {". אשר?"}
      </p>
    );
  }

  if (pairs.length === 2) {
    // P2 transfer mirror
    const [a, b] = pairs;
    return (
      <p className="text-muted-foreground text-sm">
        <span className="font-medium text-zinc-800">{formatCurrency(a.chargedAmount)}</span>
        {` ב${BANK_LABELS[a.bankType] ?? a.bankType}`}
        <span className="text-zinc-500"> &#8596; </span>
        <span className="font-medium text-zinc-800">{formatCurrency(b.chargedAmount)}</span>
        {` ב${BANK_LABELS[b.bankType] ?? b.bankType}`}
        {` (${formatDate(a.date)}). אשר?`}
      </p>
    );
  }

  return <p className="text-muted-foreground text-sm">{members.length} תנועות בקבוצה. אשר?</p>;
}

// ── Single group card ─────────────────────────────────────────────────────────

function GroupCard({
  group,
  selected,
  onToggle,
  onApprove,
  onReject,
}: {
  group: InboxGroup;
  selected: boolean;
  onToggle: () => void;
  onApprove: (groupId: string) => void;
  onReject: (groupId: string) => void;
}) {
  const [pending, setPending] = React.useState<"approve" | "reject" | null>(null);

  async function handleApprove() {
    setPending("approve");
    await onApprove(group.groupId);
    setPending(null);
  }

  async function handleReject() {
    setPending("reject");
    await onReject(group.groupId);
    setPending(null);
  }

  return (
    <Card className="relative">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Checkbox checked={selected} onCheckedChange={onToggle} aria-label="בחר קבוצה" />
            <div>
              <GroupSummary members={group.members} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant={confidenceVariant(group.confidence)}
              className="text-xs tabular-nums"
              title="ציון ביטחון של ההתאמה"
            >
              {confidenceLabel(group.confidence)}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={handleApprove}
              disabled={pending !== null}
              aria-label="אשר קבוצה"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
              אשר
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 border-red-200 text-red-700 hover:bg-red-50"
              onClick={handleReject}
              disabled={pending !== null}
              aria-label="דחה קבוצה"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              דחה
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y rounded-md border">
          {group.members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatDate(member.date)}
                </span>
                <span className="truncate font-medium">{member.description}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {member.categoryName && (
                  <Badge variant="outline" className="text-xs">
                    {member.categoryName}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">
                  {BANK_LABELS[member.bankType] ?? member.bankType}
                </Badge>
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    member.chargedAmount >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {formatCurrency(member.chargedAmount)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReconciliationInbox({ groups: initialGroups }: Props) {
  const [groups, setGroups] = React.useState(initialGroups);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = React.useState<"approve" | "reject" | null>(null);

  const allSelected = groups.length > 0 && groups.every((g) => selected.has(g.groupId));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(groups.map((g) => g.groupId)));
    }
  }

  function toggleOne(groupId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  async function handleApprove(groupId: string) {
    await approveReconciliationAction({ groupId });
    setGroups((prev) => prev.filter((g) => g.groupId !== groupId));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(groupId);
      return next;
    });
  }

  async function handleReject(groupId: string) {
    await rejectReconciliationAction({ groupId });
    setGroups((prev) => prev.filter((g) => g.groupId !== groupId));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(groupId);
      return next;
    });
  }

  async function handleBulkApprove() {
    if (selected.size === 0) return;
    setBulkPending("approve");
    const groupIds = Array.from(selected);
    await approveReconciliationsAction({ groupIds });
    setGroups((prev) => prev.filter((g) => !selected.has(g.groupId)));
    setSelected(new Set());
    setBulkPending(null);
  }

  async function handleBulkReject() {
    if (selected.size === 0) return;
    setBulkPending("reject");
    const groupIds = Array.from(selected);
    await rejectReconciliationsAction({ groupIds });
    setGroups((prev) => prev.filter((g) => !selected.has(g.groupId)));
    setSelected(new Set());
    setBulkPending(null);
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">תיבת ההתאמות</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {groups.length > 0
              ? `${groups.length} קבוצות ממתינות לאישור`
              : "אין התאמות הממתינות לאישור"}
          </p>
        </div>

        {/* Bulk action bar */}
        {groups.length > 0 && (
          <div className="flex items-center gap-3">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="בחר הכל" />
            <span className="text-muted-foreground text-sm">
              {selected.size > 0 ? `${selected.size} נבחרו` : "בחר הכל"}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={handleBulkApprove}
              disabled={selected.size === 0 || bulkPending !== null}
              aria-label="אשר נבחרים"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
              אשר נבחרים
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 border-red-200 text-red-700 hover:bg-red-50"
              onClick={handleBulkReject}
              disabled={selected.size === 0 || bulkPending !== null}
              aria-label="דחה נבחרים"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              דחה נבחרים
            </Button>
          </div>
        )}
      </div>

      {/* Group list */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground text-sm">
              אין התאמות ממתינות לאישור. כל ההתאמות טופלו.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <GroupCard
              key={group.groupId}
              group={group}
              selected={selected.has(group.groupId)}
              onToggle={() => toggleOne(group.groupId)}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
