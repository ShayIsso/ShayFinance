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
import { db } from "@/db";
import { bankAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";

// Module-level OTP handler — set during active sync, used by POST /api/sync/otp
let activeOtpHandler: OtpHandler | null = null;

export function submitOtp(code: string): boolean {
  if (!activeOtpHandler) return false;
  activeOtpHandler.resolveOtp(code);
  activeOtpHandler = null;
  return true;
}

export type SyncSummaryEvent =
  | (SyncEvent & { _credentialId?: string })
  | { type: "reconciliation_summary"; autoApplied: number; queued: number };

export async function* syncAllBanks(): AsyncGenerator<SyncSummaryEvent> {
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

    const generator = syncBank(rawCreds, bankType as "discount" | "max" | "visaCal", {
      startDate,
      isFirstSync,
    });

    let bankImported = 0;

    for await (const event of generator) {
      if (event.type === "otp_required") {
        activeOtpHandler = event.otpHandler;
        yield { type: "otp_required", bank: event.bank, otpHandler: event.otpHandler };
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

  yield { type: "sync_complete", summary: { total, byBank: importedByBank } };
}
