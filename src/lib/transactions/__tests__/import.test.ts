import { describe, it, expect, beforeEach } from "vitest";
import { importTransaction } from "../import";
import type { TransactionStore, StoredTransaction, NewTransaction } from "../import";
import type { ScrapedTransaction } from "@/lib/scraper/types";

// In-memory store for testing
function createMemoryStore(
  initial: StoredTransaction[] = [],
): TransactionStore & { rows: StoredTransaction[] } {
  const rows: StoredTransaction[] = [...initial];
  let nextId = 1;

  return {
    rows,
    async findByExternalId(externalId, bankAccountId) {
      return (
        rows.find((r) => r.externalId === externalId && r.bankAccountId === bankAccountId) ?? null
      );
    },
    async findByComposite(date, chargedAmount, description, bankAccountId) {
      return (
        rows.find(
          (r) =>
            r.date === date &&
            r.chargedAmount === chargedAmount &&
            r.description === description &&
            r.bankAccountId === bankAccountId,
        ) ?? null
      );
    },
    async insert(tx) {
      const id = String(nextId++);
      rows.push({ ...tx, id });
      return id;
    },
    async update(id, changes) {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx !== -1) Object.assign(rows[idx], changes);
    },
  };
}

const noCategorize = async (_desc: string): Promise<string | null> => null;
const categorizeFixed =
  (categoryId: string) =>
  async (_desc: string): Promise<string | null> =>
    categoryId;

function makeTx(overrides: Partial<ScrapedTransaction> = {}): ScrapedTransaction {
  return {
    externalId: "ext-1",
    date: "2024-01-15",
    processedDate: "2024-01-16",
    description: "Coffee Shop",
    memo: null,
    originalAmount: 10,
    originalCurrency: "ILS",
    chargedAmount: 10,
    chargedCurrency: "ILS",
    type: "normal",
    installmentNumber: null,
    installmentTotal: null,
    status: "completed",
    ...overrides,
  };
}

function makeStored(overrides: Partial<StoredTransaction> = {}): StoredTransaction {
  return {
    id: "stored-1",
    bankAccountId: "acct-1",
    externalId: "ext-1",
    date: "2024-01-15",
    processedDate: "2024-01-16",
    description: "Coffee Shop",
    chargedAmount: 10,
    status: "completed",
    categoryId: null,
    ...overrides,
  };
}

describe("importTransaction", () => {
  // ── External ID dedup ──────────────────────────────────────────────────────

  it("inserts new transaction with externalId", async () => {
    const store = createMemoryStore();
    const result = await importTransaction(makeTx(), "acct-1", store, noCategorize);
    expect(result).toBe("inserted");
    expect(store.rows).toHaveLength(1);
  });

  it("skips duplicate externalId in same bank account", async () => {
    const store = createMemoryStore([makeStored()]);
    const result = await importTransaction(makeTx(), "acct-1", store, noCategorize);
    expect(result).toBe("skipped");
    expect(store.rows).toHaveLength(1);
  });

  it("inserts when same externalId belongs to different bank account", async () => {
    const store = createMemoryStore([makeStored({ bankAccountId: "acct-2" })]);
    const result = await importTransaction(makeTx(), "acct-1", store, noCategorize);
    expect(result).toBe("inserted");
    expect(store.rows).toHaveLength(2);
  });

  it("updates pending→completed when externalId matches", async () => {
    const store = createMemoryStore([
      makeStored({ status: "pending", processedDate: "2024-01-15" }),
    ]);
    const tx = makeTx({ status: "completed", processedDate: "2024-01-16", chargedAmount: 10.5 });
    const result = await importTransaction(tx, "acct-1", store, noCategorize);
    expect(result).toBe("updated");
    expect(store.rows[0].status).toBe("completed");
    expect(store.rows[0].processedDate).toBe("2024-01-16");
    expect(store.rows[0].chargedAmount).toBe(10.5);
  });

  it("skips already-completed transaction (idempotent)", async () => {
    const store = createMemoryStore([makeStored({ status: "completed" })]);
    const result = await importTransaction(
      makeTx({ status: "completed" }),
      "acct-1",
      store,
      noCategorize,
    );
    expect(result).toBe("skipped");
    expect(store.rows).toHaveLength(1);
  });

  // ── Composite fallback (null externalId) ────────────────────────────────

  it("inserts when null externalId and no composite match", async () => {
    const store = createMemoryStore();
    const result = await importTransaction(
      makeTx({ externalId: null }),
      "acct-1",
      store,
      noCategorize,
    );
    expect(result).toBe("inserted");
  });

  it("updates pending→completed via composite match", async () => {
    const stored = makeStored({ externalId: null, status: "pending", processedDate: "2024-01-15" });
    const store = createMemoryStore([stored]);
    const tx = makeTx({ externalId: null, status: "completed", processedDate: "2024-01-16" });
    const result = await importTransaction(tx, "acct-1", store, noCategorize);
    expect(result).toBe("updated");
    expect(store.rows[0].status).toBe("completed");
  });

  it("skips already-completed composite match (idempotent)", async () => {
    const stored = makeStored({ externalId: null, status: "completed" });
    const store = createMemoryStore([stored]);
    const result = await importTransaction(
      makeTx({ externalId: null }),
      "acct-1",
      store,
      noCategorize,
    );
    expect(result).toBe("skipped");
  });

  // ── Auto-categorization ─────────────────────────────────────────────────

  it("assigns categoryId to new transaction via categorize", async () => {
    const store = createMemoryStore();
    const result = await importTransaction(makeTx(), "acct-1", store, categorizeFixed("cat-123"));
    expect(result).toBe("inserted");
    expect(store.rows[0].categoryId).toBe("cat-123");
  });

  it("preserves existing categoryId on pending→completed update", async () => {
    const stored = makeStored({ status: "pending", categoryId: "cat-existing" });
    const store = createMemoryStore([stored]);
    const tx = makeTx({ status: "completed" });
    const result = await importTransaction(tx, "acct-1", store, categorizeFixed("cat-new"));
    expect(result).toBe("updated");
    expect(store.rows[0].categoryId).toBe("cat-existing");
  });

  // ── Mixed batch ──────────────────────────────────────────────────────────

  it("handles batch of 5: 2 new, 2 duplicates, 1 pending→completed", async () => {
    const existing = [
      makeStored({ id: "s1", externalId: "dup-1" }),
      makeStored({ id: "s2", externalId: "dup-2" }),
      makeStored({ id: "s3", externalId: "pend-1", status: "pending" }),
    ];
    const store = createMemoryStore(existing);

    const txs: ScrapedTransaction[] = [
      makeTx({ externalId: "new-1" }),
      makeTx({ externalId: "new-2" }),
      makeTx({ externalId: "dup-1" }),
      makeTx({ externalId: "dup-2" }),
      makeTx({ externalId: "pend-1", status: "completed" }),
    ];

    const results = await Promise.all(
      txs.map((tx) => importTransaction(tx, "acct-1", store, noCategorize)),
    );

    expect(results.filter((r) => r === "inserted")).toHaveLength(2);
    expect(results.filter((r) => r === "skipped")).toHaveLength(2);
    expect(results.filter((r) => r === "updated")).toHaveLength(1);
  });
});
