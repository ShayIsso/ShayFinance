import { listCredentials, getDecryptedCredentials } from "@/lib/credentials";
import { syncBank, getSyncStartDate } from "@/lib/scraper";
import type { SyncEvent, OtpHandler } from "@/lib/scraper";
import { importScrapedAccounts } from "@/lib/transactions";
import { drizzleReconciliationStore, drizzleSuspectedTransferRouter } from "@/lib/reconciliation";
import { runDetection, drizzleRecurringStore } from "@/lib/recurring-detection";
import {
  createAiCategorizationStore,
  createConfiguredProvider,
  DEFAULT_PACING,
} from "@/lib/ai-categorization";
import { createMerchantMemoryStore } from "@/lib/merchant-memory";
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
import { runAiSyncStep } from "./ai-step";
import { runPostImportPipeline, type PostSyncEvent } from "./post-import";
import { createSyncClaim, acquireAndRelease, type ClaimedRun } from "./claim";

// Module-level OTP handler — set during active sync, used by POST /api/sync/otp
let activeOtpHandler: OtpHandler | null = null;

export function submitOtp(code: string): boolean {
  // No sync in progress — this specifically catches a stale handler left
  // bridged to an abandoned run's promise (e.g. an aborted SSE connection):
  // without this check, resolving it would silently go nowhere instead of
  // reporting "no active request" to the caller.
  if (!syncClaim.isHeld()) return false;
  if (!activeOtpHandler) return false;
  activeOtpHandler.resolveOtp(code);
  activeOtpHandler = null;
  return true;
}

// One in-progress sync at a time, across every entry point that can launch
// one — the SSE route and the scheduler (#246). Without this, two runs could
// both set `activeOtpHandler` above and race to resolve each other's OTP.
//
// Keyed off `globalThis`, not a bare module-level `const` — Next.js bundles
// the instrumentation hook (src/instrumentation.ts → the scheduler) into a
// separate chunk from the App Router route handlers, so `createSyncClaim()`
// called at plain module scope would run once per bundle and produce two
// independent claims that can never see each other, silently reopening the
// exact scheduler/manual overlap this guard exists to close. `globalThis` is
// shared across every bundle in the process, so this is a true singleton.
const GLOBAL_CLAIM_KEY = "__shayfinanceSyncClaim" as const;
const globalForSyncClaim = globalThis as typeof globalThis & {
  [GLOBAL_CLAIM_KEY]?: ReturnType<typeof createSyncClaim>;
};
const syncClaim = (globalForSyncClaim[GLOBAL_CLAIM_KEY] ??= createSyncClaim());

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

export type SyncSummaryEvent = (SyncEvent & { _credentialId?: string }) | PostSyncEvent;

// Real inter-batch pacing wiring: the pure DEFAULT_PACING policy decides the
// delay; the timer lives here (setTimeout), out of the pure run/policy code.
const syncBatchSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Not exported: every real caller must go through the claim (route.ts and
// scheduler/index.ts both use `syncAllBanksClaimed` below). Exporting this
// directly would reopen the exact bypass #246 exists to close.
async function* syncAllBanks(opts: SyncOptions = {}): AsyncGenerator<SyncSummaryEvent> {
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
    // Scheduled runs call event.otpHandler.skip() above — which rejects the bridge
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
    } finally {
      // `finally`, not a bare statement after the try/catch: a consumer
      // walking away (SSE client disconnect) while suspended at the
      // otp_required yield above unwinds via `.return()`, which skips any
      // code after the try/catch entirely — only a `finally` still runs,
      // and without it a live handler stays bridged to an abandoned
      // promise that `submitOtp` could still resolve.
      activeOtpHandler = null;
    }
  }

  yield* runPostImportPipeline({
    reconciliationStore: drizzleReconciliationStore,
    runRecurring: () => runDetection(drizzleRecurringStore),
    runAiStep: runAiSyncStep,
    ai: {
      createProvider: createConfiguredProvider,
      aiStore: createAiCategorizationStore(),
      memoryStore: createMerchantMemoryStore(),
      transferRouter: drizzleSuspectedTransferRouter,
      pacing: { policy: DEFAULT_PACING, sleep: syncBatchSleep },
    },
    importSummary: { total, byBank: importedByBank },
  });
}

/**
 * `syncAllBanks`, guarded by the process-lifetime claim: a second concurrent
 * call while one is already running returns `null` instead of starting —
 * the caller (the SSE route, the scheduler) must check for `null` and
 * refuse rather than iterate. On success, `events`'s claim releases once
 * iteration ends for any reason: completion, a genuine throw, or the
 * consumer walking away early (SSE client disconnect; the scheduler's own
 * abort path). The standalone `release` is there for a caller whose own
 * cleanup path must guarantee release even if it never starts consuming
 * `events` at all — see `acquireAndRelease`'s doc comment in `claim.ts`.
 */
export function syncAllBanksClaimed(opts: SyncOptions = {}): ClaimedRun<SyncSummaryEvent> | null {
  return acquireAndRelease(syncClaim, () => syncAllBanks(opts));
}
