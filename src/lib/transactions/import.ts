import type { ScrapedTransaction } from "@/lib/scraper/types";
import type { CategorySource } from "@/lib/merchant-memory";

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
  categorySource: CategorySource | null;
};

/**
 * Categorization result for an imported transaction: the assigned category and
 * its provenance TIER (ADR-0010 §2). A rule match is `rule`; a user-tier memory
 * hit is `memory`; an ai-tier memory hit is `ai`. No category ⇒ both null.
 */
export type Categorization = {
  categoryId: string | null;
  source: CategorySource | null;
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
  categorize: (desc: string) => Promise<Categorization>,
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
  const { categoryId, source } = await categorize(tx.description);
  await store.insert({ ...tx, bankAccountId, categoryId, categorySource: source });
  return "inserted";
}
