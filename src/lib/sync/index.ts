import { listCredentials, getDecryptedCredentials } from "@/lib/credentials";
import { syncBank, getSyncStartDate } from "@/lib/scraper";
import type { SyncEvent, OtpHandler } from "@/lib/scraper";
import { importScrapedAccounts } from "@/lib/transactions";
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

export type SyncSummaryEvent = SyncEvent & { _credentialId?: string };

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
        // Suppress dangling timeout if OTP is never needed
        event.otpHandler.promise.catch(() => {});
        yield { type: "otp_required", bank: event.bank, otpHandler: event.otpHandler };
        continue;
      }

      if (event.type === "bank_complete") {
        yield { type: "progress", bank: event.bank, status: "importing" };
        bankImported = await importScrapedAccounts(cred.id, event.accounts);
        total += bankImported;
        importedByBank[event.bank] = bankImported;
        yield { ...event, _credentialId: cred.id };
        continue;
      }

      yield event;
    }

    activeOtpHandler = null;
  }

  yield { type: "sync_complete", summary: { total, byBank: importedByBank } };
}
