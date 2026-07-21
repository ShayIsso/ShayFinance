import { describe, it, expect, vi } from "vitest";
import { exportTransactionsCsv, getTrendsReport } from "../index";
import type { ReportsStore, RangeTransactionRow } from "../store";
import type { ReportRow } from "../csv";
import type { RollupCategory } from "@/lib/analytics";
import { transactionFiltersSchema } from "@/lib/transactions/schemas";
import { buildFilterSearchParams } from "@/lib/transactions/filter-params";
import { monthDateRange } from "@/lib/analytics/month-window";

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
  async getRangeTransactions() {
    return [];
  },
  async getBudgetConfigs() {
    return [];
  },
  async getSavingsTarget() {
    return null;
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

// (issue #169 — BGR12) The דוחות monthly report's "הורד שורות החודש" link
// builds its query string through the same `buildFilterSearchParams`
// (`@/lib/transactions/filter-params`) the transactions page's own CSV export
// button uses, and hits the same `/api/transactions/export` endpoint — no
// second export mechanism. Byte-identity between the two call sites is
// therefore guaranteed structurally (one shared builder, one endpoint); what
// actually needs pinning is that the preset the report page passes in
// resolves to exactly the month window and nothing else.
describe("month-scoped export preset (issue #169)", () => {
  it("parses the reports page's month-download preset to exactly the month window, with every other filter absent", () => {
    const { from, to } = monthDateRange(2026, 5);
    const params = buildFilterSearchParams({
      dateFrom: from,
      dateTo: to,
      categoryId: "",
      status: "",
      search: "",
    });

    const filters = transactionFiltersSchema.parse(Object.fromEntries(params));

    expect(filters.dateFrom).toBe("2026-05-01");
    expect(filters.dateTo).toBe("2026-05-31");
    expect(filters.categoryId).toBeUndefined();
    expect(filters.status).toBeUndefined();
    expect(filters.search).toBeUndefined();
    expect(filters.uncategorized).toBe(false);
    expect(filters.needsReview).toBe(false);
  });

  it("excludes rows outside the preset month bounds — the download can only ever contain that month's rows", async () => {
    const { from, to } = monthDateRange(2026, 5);
    const allRows = [
      row({ date: "2026-04-30", description: "APRIL" }),
      row({ date: "2026-05-01", description: "MAY-FIRST" }),
      row({ date: "2026-05-31", description: "MAY-LAST" }),
      row({ date: "2026-06-01", description: "JUNE" }),
    ];
    // A minimal date-bound filter, close enough to the real drizzleReportsStore's
    // WHERE clause to prove the preset only ever reaches May's rows — not a
    // duplicate-call comparison of the same builder against itself.
    const store: ReportsStore = {
      async getFilteredTransactions(filters) {
        return allRows.filter(
          (r) =>
            r.date >= (filters.dateFrom ?? "0000-01-01") &&
            r.date <= (filters.dateTo ?? "9999-12-31"),
        );
      },
      ...monthlyStubs,
    };

    const params = buildFilterSearchParams({
      dateFrom: from,
      dateTo: to,
      categoryId: "",
      status: "",
      search: "",
    });
    const filters = transactionFiltersSchema.parse(Object.fromEntries(params));

    const result = await exportTransactionsCsv(filters, store);

    expect(result.text).toContain("MAY-FIRST");
    expect(result.text).toContain("MAY-LAST");
    expect(result.text).not.toContain("APRIL");
    expect(result.text).not.toContain("JUNE");
  });
});

// (issue #170 — BGR13) The trends wrapper enumerates the calendar-month range
// from `today`, issues ONE range read, and buckets the rows per month before
// handing them to the pure core. A Store fake pins that threading (never mocks
// Drizzle); the series math itself is covered by trends.test.ts.
describe("getTrendsReport (wrapper)", () => {
  const rangeCategories: RollupCategory[] = [
    { id: "salary", name: "משכורת", color: "#10b981", icon: "Wallet", parentId: null },
    { id: "transport", name: "תחבורה", color: "#14b8a6", icon: "Bus", parentId: null },
  ];
  const rangeRow = (over: Partial<RangeTransactionRow>): RangeTransactionRow => ({
    year: 2026,
    month: 5,
    chargedAmount: 0,
    categoryType: null,
    categoryId: null,
    categoryName: "",
    categoryColor: "#888888",
    categoryIcon: "MoreHorizontal",
    ...over,
  });

  function makeTrendsStore(rows: RangeTransactionRow[]): {
    store: ReportsStore;
    rangeSpy: ReturnType<typeof vi.fn>;
  } {
    const rangeSpy = vi.fn().mockResolvedValue(rows);
    const store: ReportsStore = {
      async getFilteredTransactions() {
        return [];
      },
      ...monthlyStubs,
      getRangeTransactions: rangeSpy,
      async getRollupCategories() {
        return rangeCategories;
      },
    };
    return { store, rangeSpy };
  }

  it("reads the whole range in one call spanning the enumerated month window", async () => {
    const { store, rangeSpy } = makeTrendsStore([]);
    const report = await getTrendsReport(12, store, "2026-07-15");

    expect(rangeSpy).toHaveBeenCalledTimes(1);
    expect(rangeSpy).toHaveBeenCalledWith("2025-08-01", "2026-07-31");
    expect(report.months).toHaveLength(12);
    expect(report.months[0]).toMatchObject({ year: 2025, month: 8 });
    expect(report.months[11]).toMatchObject({ year: 2026, month: 7 });
    expect(report.hasData).toBe(false);
  });

  it("buckets range rows into their calendar month by the year/month tag", async () => {
    const rows: RangeTransactionRow[] = [
      rangeRow({
        year: 2026,
        month: 6,
        chargedAmount: 20000,
        categoryType: "income",
        categoryId: "salary",
      }),
      rangeRow({
        year: 2026,
        month: 7,
        chargedAmount: -1500,
        categoryType: "expense",
        categoryId: "transport",
        categoryName: "תחבורה",
      }),
    ];
    const { store } = makeTrendsStore(rows);
    const report = await getTrendsReport(3, store, "2026-07-15");

    const june = report.months.find((m) => m.month === 6)!;
    const july = report.months.find((m) => m.month === 7)!;
    expect(june.income).toBe(20000);
    expect(july.expenses).toBe(1500);
    expect(report.hasData).toBe(true);
  });
});
