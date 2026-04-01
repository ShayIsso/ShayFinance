"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type BankSyncState = {
  status:
    | "idle"
    | "initializing"
    | "logging_in"
    | "login_success"
    | "scraping"
    | "importing"
    | "complete"
    | "error"
    | "otp_required"
    | "otp_timeout";
  error?: string;
  hasScreenshot?: boolean;
  transactionCount?: number;
};

type SyncSummary = {
  total: number;
  byBank: Record<string, number>;
};

// Client-side SSE event shape — otpHandler is stripped server-side before sending
type ClientSyncEvent =
  | { type: "progress"; bank: string; status: BankSyncState["status"] }
  | { type: "otp_required"; bank: string }
  | { type: "otp_timeout"; bank: string }
  | { type: "bank_complete"; bank: string }
  | { type: "bank_error"; bank: string; error: string; hasScreenshot: boolean }
  | { type: "sync_complete"; summary: SyncSummary };

type Bank = {
  id: string;
  bankType: string;
  displayName: string;
};

const BANK_LABELS: Record<string, string> = {
  discount: "דיסקונט",
  max: "מקס",
  visaCal: "Cal",
};

const STATUS_TEXT: Record<string, string> = {
  initializing: "מאתחל...",
  logging_in: "מתחבר...",
  login_success: "התחברות הצליחה",
  scraping: "מוריד תנועות...",
  importing: "מייבא לבסיס נתונים...",
  complete: "הושלם",
  error: "שגיאה",
  otp_required: "נדרש קוד אימות",
  otp_timeout: "פג תוקף הקוד",
};

const SPINNING_STATUSES = new Set(["initializing", "logging_in", "scraping", "importing"]);

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SyncPanel({ banks }: { banks: Bank[] }) {
  const [bankStates, setBankStates] = useState<Record<string, BankSyncState>>({});
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [otpCodes, setOtpCodes] = useState<Record<string, string>>({});
  const [otpCountdowns, setOtpCountdowns] = useState<Record<string, number>>({});
  const eventSourceRef = useRef<EventSource | null>(null);
  const countdownIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      for (const interval of Object.values(countdownIntervalsRef.current)) {
        clearInterval(interval);
      }
    };
  }, []);

  function clearCountdown(bank: string) {
    if (countdownIntervalsRef.current[bank]) {
      clearInterval(countdownIntervalsRef.current[bank]);
      delete countdownIntervalsRef.current[bank];
    }
  }

  function startSync() {
    eventSourceRef.current?.close();
    for (const interval of Object.values(countdownIntervalsRef.current)) {
      clearInterval(interval);
    }
    countdownIntervalsRef.current = {};

    setBankStates({});
    setSummary(null);
    setConnectionError(false);
    setOtpCodes({});
    setOtpCountdowns({});
    setSyncing(true);

    const es = new EventSource("/api/sync");
    eventSourceRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as ClientSyncEvent;

      if (event.type === "progress") {
        setBankStates((prev) => ({
          ...prev,
          [event.bank]: { ...prev[event.bank], status: event.status },
        }));
      } else if (event.type === "otp_required") {
        setBankStates((prev) => ({
          ...prev,
          [event.bank]: { ...prev[event.bank], status: "otp_required" },
        }));
        setOtpCountdowns((prev) => ({ ...prev, [event.bank]: 180 }));
        const { bank } = event;
        const interval = setInterval(() => {
          setOtpCountdowns((prev) => {
            const next = (prev[bank] ?? 1) - 1;
            if (next <= 0) {
              clearCountdown(bank);
              return { ...prev, [bank]: 0 };
            }
            return { ...prev, [bank]: next };
          });
        }, 1000);
        countdownIntervalsRef.current[bank] = interval;
      } else if (event.type === "otp_timeout") {
        clearCountdown(event.bank);
        setBankStates((prev) => ({
          ...prev,
          [event.bank]: { ...prev[event.bank], status: "otp_timeout" },
        }));
      } else if (event.type === "bank_complete") {
        setBankStates((prev) => ({
          ...prev,
          [event.bank]: { ...prev[event.bank], status: "complete" },
        }));
      } else if (event.type === "bank_error") {
        setBankStates((prev) => ({
          ...prev,
          [event.bank]: {
            status: "error",
            error: event.error,
            hasScreenshot: event.hasScreenshot,
          },
        }));
      } else if (event.type === "sync_complete") {
        setBankStates((prev) => {
          const next = { ...prev };
          for (const [bank, count] of Object.entries(event.summary.byBank)) {
            if (next[bank]) {
              next[bank] = { ...next[bank], transactionCount: count };
            }
          }
          return next;
        });
        setSummary(event.summary);
        setSyncing(false);
        es.close();
      }
    };

    es.onerror = () => {
      es.close();
      setSyncing(false);
      setConnectionError(true);
    };
  }

  async function submitOtp(bank: string) {
    const code = otpCodes[bank];
    if (!code?.trim()) return;
    clearCountdown(bank);
    setOtpCodes((prev) => ({ ...prev, [bank]: "" }));
    await fetch("/api/sync/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  }

  if (banks.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        אין חשבונות בנק מוגדרים. הוסף חשבון בהגדרות כדי להתחיל לסנכרן.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button onClick={startSync} disabled={syncing}>
          {syncing ? (
            <>
              <Loader2 className="animate-spin" />
              מסנכרן...
            </>
          ) : (
            "סנכרון הכל"
          )}
        </Button>
        {connectionError && <p className="text-destructive text-sm">שגיאת חיבור. נסה שוב.</p>}
      </div>

      <div className="space-y-3">
        {banks.map((bank) => {
          const state = bankStates[bank.bankType];
          const isSpinning = state !== undefined && SPINNING_STATUSES.has(state.status);
          const countdown = otpCountdowns[bank.bankType];

          return (
            <Card key={bank.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{BANK_LABELS[bank.bankType] ?? bank.bankType}</Badge>
                    <span className="font-medium">{bank.displayName}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-sm">
                    {state === undefined && (
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <span className="bg-muted-foreground/40 inline-block h-2 w-2 rounded-full" />
                        ממתין
                      </span>
                    )}
                    {isSpinning && (
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {STATUS_TEXT[state.status]}
                      </span>
                    )}
                    {state?.status === "login_success" && (
                      <span className="flex items-center gap-1.5 text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                        {STATUS_TEXT.login_success}
                      </span>
                    )}
                    {state?.status === "complete" && (
                      <span className="flex items-center gap-1.5 text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                        {state.transactionCount !== undefined
                          ? `${state.transactionCount} תנועות`
                          : STATUS_TEXT.complete}
                      </span>
                    )}
                    {state?.status === "otp_required" && (
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        {STATUS_TEXT.otp_required}
                      </span>
                    )}
                    {state?.status === "otp_timeout" && (
                      <span className="text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        {STATUS_TEXT.otp_timeout}
                      </span>
                    )}
                    {state?.status === "error" && (
                      <span className="text-destructive flex items-center gap-1.5">
                        <XCircle className="h-4 w-4" />
                        {state.error ?? STATUS_TEXT.error}
                      </span>
                    )}
                  </div>
                </div>

                {state?.status === "otp_required" && (
                  <div className="flex items-center gap-2">
                    <Input
                      className="max-w-[160px]"
                      placeholder="הזן קוד SMS"
                      value={otpCodes[bank.bankType] ?? ""}
                      onChange={(e) =>
                        setOtpCodes((prev) => ({ ...prev, [bank.bankType]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitOtp(bank.bankType);
                      }}
                    />
                    <Button size="sm" onClick={() => void submitOtp(bank.bankType)}>
                      אשר
                    </Button>
                    {countdown !== undefined && countdown > 0 && (
                      <span className="text-muted-foreground text-sm">
                        {formatCountdown(countdown)}
                      </span>
                    )}
                  </div>
                )}

                {(state?.status === "error" || state?.status === "otp_timeout") && (
                  <Button variant="outline" size="sm" onClick={startSync}>
                    נסה שוב
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {summary && (
        <Card>
          <CardContent className="space-y-2 py-4">
            <p className="font-semibold">סנכרון הושלם</p>
            <p className="text-muted-foreground text-sm">{`סה"כ תנועות: ${summary.total}`}</p>
            {Object.entries(summary.byBank).length > 0 && (
              <div className="space-y-1">
                {Object.entries(summary.byBank).map(([bank, count]) => (
                  <p key={bank} className="text-sm">
                    {BANK_LABELS[bank] ?? bank}: {count} תנועות
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
