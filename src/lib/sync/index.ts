import { listCredentials, getDecryptedCredentials } from "@/lib/credentials";
import { syncBank, getSyncStartDate } from "@/lib/scraper";
import type { SyncEvent, OtpHandler } from "@/lib/scraper";
import { importScrapedAccounts } from "@/lib/transactions";
import {
  detectP1Settlement,
  applyReconciliation,
  detectP2Mirror,
  applyP2Mirror,
  detectP3InterAccount,
  applyP3InterAccount,
  drizzleReconciliationStore,
} from "@/lib/reconciliation";
import { runDetection, drizzleRecurringStore } from "@/lib/recurring-detection";
import { db } from "@/db";
import { bankAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  startSyncRun,
  completeSyncRun,
  failSyncRun,
  syncRunStatusForEvent,
  drizzleSyncRunStore,
} from "./runs";

// Module-level OTP handler — set during active sync, used by POST /api/sync/otp
let activeOtpHandler: OtpHandler | null = null;

export function submitOtp(code: string): boolean {
  if (!activeOtpHandler) return false;
  activeOtpHandler.resolveOtp(code);
  activeOtpHandler = null;
  return true;
}

export type SyncOptions = {
  /** Which surface triggered this sync — recorded in sync_runs.triggered_by. Defaults to "manual". */
  triggeredBy?: "manual" | "scheduled";
  /**
   * How to handle OTP requests:
   * - "interactive" (default): yield otp_required so the frontend can prompt the user.
   * - "skip": immediately call skip() on the OTP bridge so the scraper yields otp_timeout
   *   and the bank is skipped. Used by scheduled runs.
   */
  otpMode?: "interactive" | "skip";
};

export type SyncSummaryEvent =
  | (SyncEvent & { _credentialId?: string })
  | { type: "reconciliation_summary"; autoApplied: number; queued: number };

export async function* syncAllBanks(opts: SyncOptions = {}): AsyncGenerator<SyncSummaryEvent> {
  const triggeredBy = opts.triggeredBy ?? "manual";
  const otpMode = opts.otpMode ?? "interactive";

  const credentials = await listCredentials();
  const importedByBank: Record<string, number> = {};
  let total = 0;

  for (const cred of credentials) {
    const { bankType, credentials: rawCreds } = await getDecryptedCredentials(cred.id);

    const existingAccount = await db.query.bankAccounts.findFirst({
      where: eq(bankAccounts.credentialId, cred.id),
      columns: { id: true },
    });
    const isFirstSync = !existingAccount;
    const startDate = getSyncStartDate(isFirstSync);

    // Record the start of this per-bank sync run (optimistic: status=success)
    const runId = await startSyncRun(drizzleSyncRunStore, {
      bank: bankType as "discount" | "max" | "visaCal",
      triggeredBy,
    }).catch(() => null); // Never let sync_runs write abort the sync loop

    const generator = syncBank(rawCreds, bankType as "discount" | "max" | "visaCal", {
      startDate,
      isFirstSync,
    });

    let bankImported = 0;
    // Terminal outcome flag: set true once this run's sync_runs row has been
    // finalized (success / error / otp_skipped). Guards against double-recording.
    let runRecorded = false;

    // The scraper does NOT throw on bank failure — it YIELDS a terminal event
    // (bank_error / otp_timeout) and returns. So the outcome is driven primarily
    // by the events below. The try/catch is a safety net for GENUINE throws
    // (e.g. importScrapedAccounts hitting a DB error).
    //
    // S2: scheduled runs call event.otpHandler.skip() above — which rejects the bridge
    // promise with OTP_TIMEOUT. The scraper catches that and yields otp_timeout, which
    // syncRunStatusForEvent maps to otp_skipped below. No special fork needed here.
    try {
      for await (const event of generator) {
        if (event.type === "otp_required") {
          if (otpMode === "skip") {
            // Scheduled run: immediately reject so the scraper yields otp_timeout.
            // The existing otp_timeout handling below records otp_skipped and continues
            // to the next bank. We do NOT set activeOtpHandler or yield to SSE.
            event.otpHandler.skip();
            continue;
          }
          // Interactive (manual) path — unchanged.
          activeOtpHandler = event.otpHandler;
          yield { type: "otp_required", bank: event.bank, otpHandler: event.otpHandler };
          continue;
        }

        // Yielded terminal failure events — record the run outcome, then forward
        // the ORIGINAL event so the SSE stream keeps its screenshot fields intact.
        const terminalStatus = syncRunStatusForEvent(event);
        if (terminalStatus === "error") {
          if (runId != null) {
            await failSyncRun(drizzleSyncRunStore, runId, {
              status: "error",
              error: event.type === "bank_error" ? event.error : "UNKNOWN",
            }).catch(() => undefined);
          }
          runRecorded = true;
          yield event;
          continue;
        }
        if (terminalStatus === "otp_skipped") {
          if (runId != null) {
            await failSyncRun(drizzleSyncRunStore, runId, {
              status: "otp_skipped",
            }).catch(() => undefined);
          }
          runRecorded = true;
          yield event;
          continue;
        }

        if (event.type === "bank_complete") {
          yield { type: "progress", bank: event.bank, status: "importing" };
          const counts = await importScrapedAccounts(cred.id, event.accounts);
          bankImported = counts.inserted + counts.updated;
          total += bankImported;
          importedByBank[event.bank] = bankImported;
          yield { ...event, _credentialId: cred.id };
          continue;
        }

        yield event;
      }

      // Success path ONLY: the bank neither errored nor timed out.
      if (!runRecorded && runId != null) {
        await completeSyncRun(drizzleSyncRunStore, runId, {
          transactionsImported: bankImported,
        }).catch(() => undefined); // Never let sync_runs write abort the sync loop
      }
    } catch (err) {
      // Rare path: a GENUINE throw (e.g. DB error during import). The guard
      // prevents double-recording / double-yielding when a scraper terminal
      // event was already handled above.
      if (!runRecorded && runId != null) {
        await failSyncRun(drizzleSyncRunStore, runId, {
          status: "error",
          error: String(err),
        }).catch(() => undefined);
        runRecorded = true;
        // Synthetic bank_error so the SSE stream still signals failure — there is
        // no scraper event in this path, so a generic Hebrew message is fine.
        yield {
          type: "bank_error" as const,
          bank: bankType,
          error: "שגיאה בסנכרון",
          hasScreenshot: false,
        };
      }
    }

    activeOtpHandler = null;
  }

  // P1: credit-card settlement lump detection
  const recentTxns = await drizzleReconciliationStore.getRecentTransactions(90);
  const p1Candidates = detectP1Settlement(recentTxns);
  const p1Result = await applyReconciliation(p1Candidates, drizzleReconciliationStore);

  // P2: 1:1 mirror detection — re-fetch so P1's updates are visible
  const recentTxnsAfterP1 = await drizzleReconciliationStore.getRecentTransactions(90);
  const p2Candidates = detectP2Mirror(recentTxnsAfterP1);
  const p2Result = await applyP2Mirror(p2Candidates, drizzleReconciliationStore);

  // P3: inter-account transfer detection — re-fetch so P2's updates are visible
  const recentTxnsAfterP2 = await drizzleReconciliationStore.getRecentTransactions(90);
  const p3Candidates = detectP3InterAccount(recentTxnsAfterP2);
  const p3Result = await applyP3InterAccount(p3Candidates, drizzleReconciliationStore);

  yield {
    type: "reconciliation_summary",
    autoApplied: p1Result.autoApplied + p2Result.autoApplied + p3Result.autoApplied,
    queued: p1Result.queued + p2Result.queued + p3Result.queued,
  };

  // Recurring detection: runs after reconciliation so category-flipped transactions
  // are already settled. Wrapped in try/catch so a detection failure never breaks
  // sync completion — detection results surface on /subscriptions, not the SSE stream.
  try {
    await runDetection(drizzleRecurringStore);
  } catch {
    // Detection failure is non-fatal. The sync_complete event still fires below.
  }

  yield { type: "sync_complete", summary: { total, byBank: importedByBank } };
}
