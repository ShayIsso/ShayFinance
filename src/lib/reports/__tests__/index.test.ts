import { describe, it, expect, vi } from "vitest";
import { exportTransactionsCsv } from "../index";
import type { ReportsStore } from "../store";
import type { ReportRow } from "../csv";

const row = (override: Partial<ReportRow> = {}): ReportRow => ({
  date: "2026-05-10",
  processedDate: "2026-05-11",
  description: "CAFE X",
  customDescription: null,
  bankType: "discount",
  accountNumber: "999",
  categoryName: "בתי קפה",
  categoryType: "expense",
  groupName: "מזון",
  chargedAmount: -35,
  chargedCurrency: "ILS",
  originalAmount: -35,
  originalCurrency: "ILS",
  installmentNumber: null,
  installmentTotal: null,
  status: "completed",
  categorySource: "user",
  memo: null,
  ...override,
});

// Stubs for the report methods this suite (CSV export) never exercises — the
// Store pattern needs the full interface, but exportTransactionsCsv only ever
// calls getFilteredTransactions.
const monthlyStubs = {
  async getMonthTransactions() {
    return [];
  },
  async getRollupCategories() {
    return [];
  },
  async getAvailableMonths() {
    return [];
  },
} satisfies Omit<ReportsStore, "getFilteredTransactions">;

/** In-memory ReportsStore fake — never mocks Drizzle (Store pattern). */
function makeStore(rows: ReportRow[]): { store: ReportsStore } {
  const store: ReportsStore = {
    async getFilteredTransactions() {
      return rows;
    },
    ...monthlyStubs,
  };
  return { store };
}

const noFilter = { uncategorized: false, needsReview: false } as const;

describe("exportTransactionsCsv", () => {
  it("reads every matching row through the store in a single unpaginated call", async () => {
    const rows = [row({ date: "2026-05-01" }), row({ date: "2026-05-20" })];
    const spy = vi.fn().mockResolvedValue(rows);
    const store: ReportsStore = { getFilteredTransactions: spy, ...monthlyStubs };
    const filters = { ...noFilter, page: 1, pageSize: 50 };

    await exportTransactionsCsv(filters, store);

    expect(spy).toHaveBeenCalledTimes(1);
    // page/pageSize ride along on the parsed filter schema but the export
    // ignores them — the store call itself has no offset/limit concept at all.
    expect(spy.mock.calls[0][0]).toEqual(filters);
  });

  it("renders the CSV body for exactly the rows the store returns (filters cleared = everything)", async () => {
    const rows = [row({ description: "A" }), row({ description: "B" }), row({ description: "C" })];
    const { store } = makeStore(rows);

    const result = await exportTransactionsCsv(noFilter, store);
    const text = result.text;

    expect(text).toContain("A");
    expect(text).toContain("B");
    expect(text).toContain("C");
    expect(text.split("\r\n").filter(Boolean)).toHaveLength(4); // header + 3 rows
  });

  it("derives the filename date range from the returned rows when the filter has no date bounds", async () => {
    const rows = [row({ date: "2026-02-01" }), row({ date: "2026-04-15" })];
    const { store } = makeStore(rows);

    const result = await exportTransactionsCsv(noFilter, store);

    expect(result.filename).toBe("shayfinance-transactions-2026-02-01_2026-04-15.csv");
  });

  it("uses the explicit dateFrom/dateTo filter bounds for the filename when given", async () => {
    const rows = [row({ date: "2026-02-01" }), row({ date: "2026-04-15" })];
    const { store } = makeStore(rows);

    const result = await exportTransactionsCsv(
      { ...noFilter, dateFrom: "2026-01-01", dateTo: "2026-12-31" },
      store,
    );

    expect(result.filename).toBe("shayfinance-transactions-2026-01-01_2026-12-31.csv");
  });

  it("produces a header-only CSV with a BOM for an empty matching set", async () => {
    const { store } = makeStore([]);

    const result = await exportTransactionsCsv(
      { ...noFilter, categoryId: "11111111-1111-1111-1111-111111111111" },
      store,
    );

    const bytes = new TextEncoder().encode(result.text);
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    expect(result.text).toContain("תאריך,תאריך חיוב");
  });
});
