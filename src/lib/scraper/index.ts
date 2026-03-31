import { createScraper, CompanyTypes } from "israeli-bank-scrapers-core";
import type { ScraperScrapingResult } from "israeli-bank-scrapers-core/lib/scrapers/interface";
import { ScraperErrorTypes } from "israeli-bank-scrapers-core/lib/scrapers/errors";
import { createOtpBridge } from "./otp";
import { mapAccount } from "./mapper";
import type { SyncEvent, OtpHandler } from "./types";

export type { SyncEvent, ScrapedTransaction, ScrapedAccount, OtpHandler } from "./types";
export { createOtpBridge } from "./otp";

const BANK_COMPANY_MAP = {
  discount: CompanyTypes.discount,
  max: CompanyTypes.max,
  visaCal: CompanyTypes.visaCal,
} as const;

export function getSyncStartDate(isFirstSync: boolean): Date {
  const now = new Date();
  const months = isFirstSync ? 12 : 3;
  return new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
}

export async function* syncBank(
  credentials: Record<string, string>,
  bankType: "discount" | "max" | "visaCal",
  options: { startDate: Date; isFirstSync: boolean },
): AsyncGenerator<SyncEvent> {
  const companyId = BANK_COMPANY_MAP[bankType];

  yield { type: "progress", bank: bankType, status: "initializing" };

  // OTP bridge — resolveOtp is handed to the sync orchestrator for external resolution
  const otpBridge: OtpHandler = createOtpBridge();

  // Signal promise: resolves (void) when the scraper calls otpCodeRetriever
  let signalOtpNeeded!: () => void;
  const otpNeededSignal = new Promise<void>((resolve) => {
    signalOtpNeeded = resolve;
  });

  // otpCodeRetriever: called by the scraper library when OTP is required.
  // Signals the generator, then blocks the scraper until resolveOtp is called externally.
  const otpCodeRetriever = async (): Promise<string> => {
    signalOtpNeeded();
    return otpBridge.promise;
  };

  const scraper = createScraper({
    companyId,
    startDate: options.startDate,
    combineInstallments: false,
    showBrowser: false,
    storeFailureScreenShotPath: "/tmp/scraper-failures",
  });

  // Start scrape as a non-blocking promise so we can detect OTP requests mid-flight
  const scrapePromise = scraper.scrape({
    ...credentials,
    otpCodeRetriever,
  } as Parameters<typeof scraper.scrape>[0]);

  let result: ScraperScrapingResult;

  try {
    // Race: scrape finishes normally OR scraper requests OTP
    const winner = await Promise.race([
      scrapePromise.then((r) => ({ tag: "done" as const, result: r })),
      otpNeededSignal.then(() => ({ tag: "otp_needed" as const })),
    ]);

    if (winner.tag === "otp_needed") {
      yield { type: "otp_required", bank: bankType };
      // Wait for scrape to complete — scraper is blocked on otpBridge.promise
      // which will either resolve (OTP submitted) or reject (timeout)
      result = await scrapePromise;
    } else {
      result = winner.result;
    }
  } catch (err) {
    if (err instanceof Error && err.message === "OTP_TIMEOUT") {
      yield { type: "otp_timeout", bank: bankType };
    } else {
      yield {
        type: "bank_error",
        bank: bankType,
        error: err instanceof Error ? err.message : String(err),
        hasScreenshot: false,
      };
    }
    return;
  }

  if (!result.success) {
    const hasScreenshot =
      result.errorType === ScraperErrorTypes.Timeout || (result.errorMessage?.length ?? 0) > 0;
    yield {
      type: "bank_error",
      bank: bankType,
      error: result.errorType ?? "UNKNOWN",
      hasScreenshot,
    };
    return;
  }

  yield { type: "progress", bank: bankType, status: "scraping" };

  const accounts = (result.accounts ?? []).map(mapAccount);

  yield { type: "bank_complete", bank: bankType, accounts };
}
