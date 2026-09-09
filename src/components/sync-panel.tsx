"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/ui/toast";
import { EmptyState } from "@/components/empty-state";
import type { SyncRunSummary } from "@/lib/sync/runs";

export type BankSyncState = {
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
  screenshotFilename?: string;
  transactionCount?: number;
};

type SyncSummary = {
  total: number;
  byBank: Record<string, number>;
};

// Client-side SSE event shape — otpHandler is stripped server-side before sending
export type ClientSyncEvent =
  | { type: "progress"; bank: string; status: BankSyncState["status"] }
  | { type: "otp_required"; bank: string }
  | { type: "otp_timeout"; bank: string }
  | { type: "bank_complete"; bank: string }
  | {
      type: "bank_error";
      bank: string;
      error: string;
      hasScreenshot: boolean;
      screenshotFilename?: string;
    }
  | { type: "reconciliation_summary"; autoApplied: number; queued: number }
  | { type: "ai_summary"; applied: number; queued: number; skipped: number }
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

// ── Persisted-row precedence (#223) ──────────────────────────────────────────

export type BankDisplay =
  | { source: "live"; state: BankSyncState }
  | { source: "persisted"; run: SyncRunSummary }
  | { source: "none" };

/**
 * Live SSE state always wins over the persisted `sync_runs` row — a sync
 * that's in progress (or one that just finished this session) is strictly
 * more current than the snapshot the page loaded with. The persisted row is
 * only ever a fallback for a bank this tab hasn't heard from yet (a fresh
 * page load, or a bank the current run hasn't reached). Precedence is
 * decided here, once, rather than left to fall out of which branch happens
 * to render first.
 */
export function resolveBankDisplay(
  liveState: BankSyncState | undefined,
  lastRun: SyncRunSummary | undefined,
): BankDisplay {
  if (liveState !== undefined) return { source: "live", state: liveState };
  if (lastRun !== undefined) return { source: "persisted", run: lastRun };
  return { source: "none" };
}

/**
 * Mirrors sync-freshness-pill.tsx's bucket wording (minutes/hours/days) so a
 * persisted row here and the header pill never disagree on how "3 hours ago"
 * reads. Not imported from there: the pill only exports its classifier
 * (`classifySyncFreshness`), not this formatter, and #223's brief keeps that
 * file read-only — duplicating one small clock-free formatter costs less
 * than widening that file's surface for it. Takes `ageMs`, never a `Date`,
 * so it can't reintroduce the `Date.now()`-in-render pattern that is bug
 * #193.
 */
export function formatRelativeAge(ageMs: number): string {
  const minutes = Math.floor(ageMs / (60 * 1000));
  if (minutes < 1) return "לפני פחות מדקה";
  if (minutes < 60) return `לפני ${minutes} דקות`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}

// ── SSE-over-fetch framing (#246 — EventSource can't read the 409 status) ───

/**
 * Splits accumulated SSE text on the `\n\n` frame separator, returning the
 * complete frames and whatever incomplete tail to keep buffering. Pure so it
 * can be pinned against adversarial splits (a separator itself split across
 * two `reader.read()` chunks) without a real fetch stream.
 */
export function takeFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;
  let separatorIndex: number;
  while ((separatorIndex = rest.indexOf("\n\n")) !== -1) {
    frames.push(rest.slice(0, separatorIndex));
    rest = rest.slice(separatorIndex + 2);
  }
  return { frames, rest };
}

/**
 * True once `sync_complete` has been seen anywhere in `events` — the only
 * event that means the run actually finished. A stream that hits a clean
 * EOF without it is a failure (e.g. an unwrapped throw in the post-import
 * pipeline closes the server's stream early), not a quiet success.
 */
export function hasSyncComplete(events: ClientSyncEvent[]): boolean {
  return events.some((event) => event.type === "sync_complete");
}

function SyncPanelInner({ banks, lastRuns }: { banks: Bank[]; lastRuns: SyncRunSummary[] }) {
  const searchParams = useSearchParams();
  // ?bank=<bankType> deep-link target — highlights the flagged bank card
  const highlightedBank = searchParams.get("bank");
  const lastRunByBank = useMemo(() => {
    const map: Record<string, SyncRunSummary> = {};
    for (const run of lastRuns) map[run.bank] = run;
    return map;
  }, [lastRuns]);
  // Mounted-only clock seed — SSR and the hydration pass render the
  // no-age form below; classification (and its `new Date()` reads) only
  // runs once this is set, so a clock read never happens in the render
  // path shared with SSR (bug #193's exact trap; same shape as
  // sync-freshness-pill.tsx's `nowMs`).
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [bankStates, setBankStates] = useState<Record<string, BankSyncState>>({});
  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [reconciliationToast, setReconciliationToast] = useState<{
    autoApplied: number;
    queued: number;
  } | null>(null);
  const [aiSummary, setAiSummary] = useState<{
    applied: number;
    queued: number;
    skipped: number;
  } | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  // A second concurrent invocation was refused (409) — a sync is already
  // running (this tab, another tab, or the scheduler). Holds the server's
  // own message (route.ts's 409 body) so the common case tracks route.ts
  // without a second copy to maintain; the identical string appears once
  // more below only as the fallback for the rare case the body doesn't
  // parse. Distinct from connectionError so it doesn't read as a failure.
  const [alreadyRunningMessage, setAlreadyRunningMessage] = useState<string | null>(null);
  const [otpCodes, setOtpCodes] = useState<Record<string, string>>({});
  const [otpCountdowns, setOtpCountdowns] = useState<Record<string, number>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const countdownIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      for (const interval of Object.values(countdownIntervalsRef.current)) {
        clearInterval(interval);
      }
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount flag, mirrors sync-freshness-pill.tsx's nowMs seed
    setNowMs(Date.now());
  }, []);

  function clearCountdown(bank: string) {
    if (countdownIntervalsRef.current[bank]) {
      clearInterval(countdownIntervalsRef.current[bank]);
      delete countdownIntervalsRef.current[bank];
    }
  }

  function handleSyncEvent(event: ClientSyncEvent): void {
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
          screenshotFilename: event.screenshotFilename,
        },
      }));
    } else if (event.type === "reconciliation_summary") {
      if (event.autoApplied > 0 || event.queued > 0) {
        setReconciliationToast({ autoApplied: event.autoApplied, queued: event.queued });
      }
    } else if (event.type === "ai_summary") {
      if (event.applied > 0 || event.queued > 0 || event.skipped > 0) {
        setAiSummary({ applied: event.applied, queued: event.queued, skipped: event.skipped });
      }
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
    }
  }

  async function startSync() {
    // No pre-emptive abort of a prior controller here: the retry button
    // renders whenever ANY bank errors or times out, which routinely
    // happens while other banks are still mid-run (per-bank isolation).
    // Killing that still-useful stream just because one bank failed would
    // make the guard this button is about to trip (409) come back *because
    // of* this click, not despite it. Refusing a second start is exactly
    // the behavior #246 wants — the still-running stream keeps flowing.
    setConnectionError(false);
    setAlreadyRunningMessage(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let sawSyncComplete = false;

    try {
      const res = await fetch("/api/sync", {
        signal: controller.signal,
        headers: { Accept: "text/event-stream" },
      });

      if (res.status === 409) {
        // `syncing` is left untouched: if a run of ours is genuinely still
        // live, this refusal must not hide that fact by flipping it false.
        const body: unknown = await res.json().catch(() => null);
        const message =
          body != null &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "סנכרון כבר פועל";
        setAlreadyRunningMessage(message);
        return;
      }
      if (!res.ok || !res.body) {
        setConnectionError(true);
        return;
      }

      // Accepted — this really is a fresh run. Only now is it safe to clear
      // the previous run's display; a refused start above never reaches
      // here, so it can't wipe a still-active (or just-completed) run's data.
      for (const interval of Object.values(countdownIntervalsRef.current)) {
        clearInterval(interval);
      }
      countdownIntervalsRef.current = {};
      setBankStates({});
      setSummary(null);
      setReconciliationToast(null);
      setAiSummary(null);
      setOtpCodes({});
      setOtpCountdowns({});
      setSyncing(true);

      // Plain fetch instead of EventSource — EventSource exposes no way to
      // read the response status, and the 409 above has to be observable
      // before any stream is treated as open (#246).
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        // {stream: true} keeps a multi-byte UTF-8 char (Hebrew text in error
        // messages) that lands on a chunk boundary from decoding as garbage.
        buffer += decoder.decode(value, { stream: true });

        const { frames, rest } = takeFrames(buffer);
        buffer = rest;
        for (const frame of frames) {
          if (!frame.startsWith("data: ")) continue;
          const event = JSON.parse(frame.slice(6)) as ClientSyncEvent;
          sawSyncComplete ||= hasSyncComplete([event]);
          handleSyncEvent(event);
        }
      }

      if (!sawSyncComplete) {
        // A clean EOF that never yielded sync_complete means the server
        // closed the stream early (e.g. an unwrapped throw in the
        // post-import pipeline) — a failure, not a quiet success.
        // sync_complete is the only event that clears `syncing`, so
        // treating this any other way leaves the spinner stuck forever.
        setSyncing(false);
        setConnectionError(true);
      }
    } catch {
      const wasIntentional = controller.signal.aborted;
      // Guarantees the connection tears down even when WE threw (e.g. a
      // malformed frame) rather than the network — otherwise the server
      // keeps consuming the generator, and the claim, indefinitely.
      controller.abort();
      if (wasIntentional) return; // deliberate: unmount, or a newer startSync() call
      setSyncing(false);
      setConnectionError(true);
    }
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
        <Button onClick={() => void startSync()} disabled={syncing}>
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
        {alreadyRunningMessage && (
          <p className="text-muted-foreground text-sm">{alreadyRunningMessage}</p>
        )}
      </div>

      {!syncing && !summary && Object.keys(bankStates).length === 0 && lastRuns.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={RefreshCw}
              heading="עדיין לא בוצע סנכרון"
              explainer="הפעל סנכרון כדי להוריד את העסקאות האחרונות מחשבונות הבנק שלך."
              cta={{ label: "סנכרן עכשיו", onClick: () => void startSync() }}
            />
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {banks.map((bank) => {
          const display = resolveBankDisplay(
            bankStates[bank.bankType],
            lastRunByBank[bank.bankType],
          );
          const liveState = display.source === "live" ? display.state : undefined;
          const isSpinning = liveState !== undefined && SPINNING_STATUSES.has(liveState.status);
          const countdown = otpCountdowns[bank.bankType];
          const isHighlighted = highlightedBank === bank.bankType;
          const persistedAge =
            display.source === "persisted" && nowMs !== null
              ? formatRelativeAge(nowMs - new Date(display.run.startedAt).getTime())
              : null;
          const canRetry =
            liveState?.status === "error" ||
            liveState?.status === "otp_timeout" ||
            (display.source === "persisted" &&
              (display.run.status === "error" || display.run.status === "otp_skipped"));

          return (
            <Card
              key={bank.id}
              className={isHighlighted ? "border-warning/50 ring-warning/25 ring-1" : undefined}
            >
              <CardContent className="space-y-3 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{BANK_LABELS[bank.bankType] ?? bank.bankType}</Badge>
                    <span className="font-medium">{bank.displayName}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-sm">
                    {display.source === "none" && (
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <span className="bg-muted-foreground/40 inline-block h-2 w-2 rounded-full" />
                        מעולם לא סונכרן
                      </span>
                    )}
                    {isSpinning && liveState !== undefined && (
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {STATUS_TEXT[liveState.status]}
                      </span>
                    )}
                    {liveState?.status === "login_success" && (
                      <span className="text-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        {STATUS_TEXT.login_success}
                      </span>
                    )}
                    {liveState?.status === "complete" && (
                      <span className="text-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        {liveState.transactionCount !== undefined
                          ? `${liveState.transactionCount} תנועות`
                          : STATUS_TEXT.complete}
                      </span>
                    )}
                    {liveState?.status === "otp_required" && (
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        {STATUS_TEXT.otp_required}
                      </span>
                    )}
                    {liveState?.status === "otp_timeout" && (
                      <span className="text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        {STATUS_TEXT.otp_timeout}
                      </span>
                    )}
                    {liveState?.status === "error" && (
                      <span className="text-destructive flex items-center gap-1.5">
                        <XCircle className="h-4 w-4" />
                        {liveState.error ?? STATUS_TEXT.error}
                      </span>
                    )}

                    {display.source === "persisted" && display.run.status === "success" && (
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        {`${display.run.transactionsImported} תנועות`}
                        {persistedAge && ` · ${persistedAge}`}
                      </span>
                    )}
                    {display.source === "persisted" && display.run.status === "otp_skipped" && (
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Lock className="h-4 w-4" />
                        <span className="bg-warning text-warning-foreground rounded-full px-2 py-0.5 text-xs font-medium">
                          קוד אימות לא הוזן בזמן
                        </span>
                        {persistedAge && <span>{persistedAge}</span>}
                      </span>
                    )}
                    {display.source === "persisted" && display.run.status === "error" && (
                      <span className="text-destructive flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        {display.run.errorMessage ?? STATUS_TEXT.error}
                        {persistedAge && ` · ${persistedAge}`}
                      </span>
                    )}
                  </div>
                </div>

                {liveState?.status === "otp_required" && (
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

                {canRetry && (
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={() => void startSync()}>
                      נסה שוב
                    </Button>
                    {liveState?.screenshotFilename && (
                      <a
                        href={`/api/screenshots/${liveState.screenshotFilename}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-xs hover:underline"
                      >
                        צפה בצילום מסך
                      </a>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {reconciliationToast && (
        <Toast variant="success" onDismiss={() => setReconciliationToast(null)}>
          {reconciliationToast.autoApplied > 0 && (
            <p className="text-foreground">
              סווגו אוטומטית {reconciliationToast.autoApplied} עסקאות כהסדרת כרטיס אשראי
            </p>
          )}
          {reconciliationToast.queued > 0 && (
            <p className="text-muted-foreground">
              {reconciliationToast.queued} התאמות ממתינות לאישור
            </p>
          )}
        </Toast>
      )}

      {aiSummary && (
        <Card>
          <CardContent className="space-y-2 py-4">
            <p className="font-semibold">סיווג חכם</p>
            <div className="space-y-0.5 text-sm">
              {aiSummary.applied > 0 && (
                <p className="text-muted-foreground">{aiSummary.applied} עסקאות סווגו אוטומטית</p>
              )}
              {aiSummary.queued > 0 && (
                <p className="text-muted-foreground">{aiSummary.queued} עסקאות ממתינות לבדיקה</p>
              )}
              {aiSummary.skipped > 0 && (
                <p className="text-muted-foreground">{aiSummary.skipped} עסקאות נותרו ללא סיווג</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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

// useSearchParams requires a Suspense boundary (Next.js App Router requirement)
export function SyncPanel({ banks, lastRuns }: { banks: Bank[]; lastRuns: SyncRunSummary[] }) {
  return (
    <Suspense fallback={null}>
      <SyncPanelInner banks={banks} lastRuns={lastRuns} />
    </Suspense>
  );
}
