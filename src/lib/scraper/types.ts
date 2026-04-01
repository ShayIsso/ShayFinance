export type SyncEvent =
  | {
      type: "progress";
      bank: string;
      status: "initializing" | "logging_in" | "login_success" | "scraping" | "importing";
    }
  | { type: "otp_required"; bank: string; otpHandler: OtpHandler }
  | { type: "otp_timeout"; bank: string }
  | { type: "bank_complete"; bank: string; accounts: ScrapedAccount[] }
  | { type: "bank_error"; bank: string; error: string; hasScreenshot: boolean }
  | { type: "sync_complete"; summary: { total: number; byBank: Record<string, number> } };

export type ScrapedTransaction = {
  externalId: string | null;
  date: string;
  processedDate: string;
  description: string;
  memo: string | null;
  originalAmount: number;
  originalCurrency: string;
  chargedAmount: number;
  chargedCurrency: string | null;
  type: "normal" | "installments";
  installmentNumber: number | null;
  installmentTotal: number | null;
  status: "completed" | "pending";
};

export type ScrapedAccount = {
  accountNumber: string;
  balance: number | null;
  transactions: ScrapedTransaction[];
};

export type OtpHandler = {
  resolveOtp: (code: string) => void;
  promise: Promise<string>;
  cancel: () => void;
};
