import type { ScrapedTransaction } from "@/lib/scraper/types";

export type StoredTransaction = {
  id: string;
  bankAccountId: string;
  externalId: string | null;
  date: string;
  processedDate: string;
  description: string;
  chargedAmount: number;
  status: "completed" | "pending";
  categoryId: string | null;
};

export type NewTransaction = Omit<ScrapedTransaction, ""> & {
  bankAccountId: string;
  categoryId: string | null;
};

export type TransactionStore = {
  findByExternalId(externalId: string, bankAccountId: string): Promise<StoredTransaction | null>;
  findByComposite(
    date: string,
    chargedAmount: number,
    description: string,
    bankAccountId: string,
  ): Promise<StoredTransaction | null>;
  insert(tx: NewTransaction): Promise<string>;
  update(
    id: string,
    changes: Partial<
      Pick<StoredTransaction, "status" | "processedDate" | "chargedAmount" | "externalId">
    >,
  ): Promise<void>;
};

export async function importTransaction(
  tx: ScrapedTransaction,
  bankAccountId: string,
  store: TransactionStore,
  categorize: (desc: string) => Promise<string | null>,
): Promise<"inserted" | "updated" | "skipped"> {
  // 1. Try external_id match
  if (tx.externalId) {
    const existing = await store.findByExternalId(tx.externalId, bankAccountId);
    if (existing) {
      if (existing.status === "pending" && tx.status === "completed") {
        await store.update(existing.id, {
          status: "completed",
          processedDate: tx.processedDate,
          chargedAmount: tx.chargedAmount,
        });
        return "updated";
      }
      return "skipped";
    }
  }

  // 2. Composite fallback for null externalId
  if (!tx.externalId) {
    const existing = await store.findByComposite(
      tx.date,
      tx.chargedAmount,
      tx.description,
      bankAccountId,
    );
    if (existing) {
      if (existing.status === "pending" && tx.status === "completed") {
        await store.update(existing.id, {
          status: "completed",
          processedDate: tx.processedDate,
          chargedAmount: tx.chargedAmount,
        });
        return "updated";
      }
      return "skipped";
    }
  }

  // 3. New transaction — auto-categorize and insert
  const categoryId = await categorize(tx.description);
  await store.insert({ ...tx, bankAccountId, categoryId });
  return "inserted";
}
