import type { Transaction, TransactionsAccount } from "israeli-bank-scrapers-core/lib/transactions";
import type { ScrapedAccount, ScrapedTransaction } from "./types";

export function mapTransaction(tx: Transaction): ScrapedTransaction {
  const rawId = tx.identifier;
  let externalId: string | null = null;
  if (rawId !== undefined && rawId !== null && rawId !== 0 && rawId !== "") {
    externalId = String(rawId);
  }

  return {
    externalId,
    date: tx.date,
    processedDate: tx.processedDate,
    description: tx.description,
    memo: tx.memo ?? null,
    originalAmount: tx.originalAmount,
    originalCurrency: tx.originalCurrency || "ILS",
    chargedAmount: tx.chargedAmount,
    chargedCurrency: tx.chargedCurrency ?? null,
    type: tx.type === "installments" ? "installments" : "normal",
    installmentNumber: tx.installments?.number ?? null,
    installmentTotal: tx.installments?.total ?? null,
    status: tx.status === "pending" ? "pending" : "completed",
  };
}

export function mapAccount(account: TransactionsAccount): ScrapedAccount {
  return {
    accountNumber: account.accountNumber,
    balance: account.balance ?? null,
    transactions: account.txns.map(mapTransaction),
  };
}
