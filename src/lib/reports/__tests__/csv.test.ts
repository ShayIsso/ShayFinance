import { describe, it, expect } from "vitest";
import {
  CSV_HEADERS,
  buildCsv,
  buildCsvWithBom,
  resolveExportDateRange,
  buildExportFilename,
  type ReportRow,
} from "../csv";

const baseRow = (override: Partial<ReportRow> = {}): ReportRow => ({
  date: "2026-07-01",
  processedDate: "2026-07-02",
  description: "SUPER PHARM TLV",
  customDescription: null,
  bankType: "max",
  accountNumber: "1234",
  categoryName: "מזון",
  categoryType: "expense",
  groupName: null,
  chargedAmount: -120.5,
  chargedCurrency: "ILS",
  originalAmount: -120.5,
  originalCurrency: "ILS",
  installmentNumber: null,
  installmentTotal: null,
  status: "completed",
  categorySource: "rule",
  memo: null,
  ...override,
});

describe("CSV_HEADERS", () => {
  it("has the exact Hebrew header row in order", () => {
    expect(CSV_HEADERS).toEqual([
      "תאריך",
      "תאריך חיוב",
      "תיאור",
      "תיאור מקורי",
      "מוסד",
      "חשבון",
      "קטגוריה",
      "קבוצה",
      "סוג קטגוריה",
      "סכום",
      "מטבע",
      "סכום מקורי",
      "מטבע מקורי",
      "תשלום",
      "סטטוס",
      "מקור סיווג",
      "הערות",
    ]);
  });
});

describe("buildCsv", () => {
  it("renders only the header row for an empty result set", () => {
    const csv = buildCsv([]);
    expect(csv).toBe(CSV_HEADERS.join(",") + "\r\n");
  });

  it("CRLF-terminates every line, including the last", () => {
    const csv = buildCsv([baseRow()]);
    const lines = csv.split("\r\n");
    expect(lines[lines.length - 1]).toBe("");
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.includes("\n") && !csv.includes("\r\n")).toBe(false);
  });

  it("prefers custom_description for the display column but keeps the raw description too", () => {
    const csv = buildCsv([
      baseRow({ description: "MCDONALDS TLV", customDescription: "מקדונלד'ס" }),
    ]);
    const dataLine = csv.split("\r\n")[1];
    const fields = dataLine.split(",");
    expect(fields[2]).toBe("מקדונלד'ס");
    expect(fields[3]).toBe("MCDONALDS TLV");
  });

  it("uses the raw description for display when no custom_description is set", () => {
    const csv = buildCsv([baseRow({ description: "MCDONALDS TLV", customDescription: null })]);
    const fields = csv.split("\r\n")[1].split(",");
    expect(fields[2]).toBe("MCDONALDS TLV");
    expect(fields[3]).toBe("MCDONALDS TLV");
  });

  it("leaves קבוצה empty for a root leaf (no parent group)", () => {
    const csv = buildCsv([baseRow({ categoryName: "מזון ומשקאות", groupName: null })]);
    const fields = csv.split("\r\n")[1].split(",");
    expect(fields[6]).toBe("מזון ומשקאות");
    expect(fields[7]).toBe("");
  });

  it("carries the parent group name for a category-group leaf", () => {
    const csv = buildCsv([baseRow({ categoryName: "סופרמרקט", groupName: "מזון" })]);
    const fields = csv.split("\r\n")[1].split(",");
    expect(fields[6]).toBe("סופרמרקט");
    expect(fields[7]).toBe("מזון");
  });

  it("leaves קטגוריה, קבוצה, and סוג קטגוריה empty for an uncategorized row", () => {
    const csv = buildCsv([
      baseRow({ categoryName: null, categoryType: null, groupName: null, categorySource: null }),
    ]);
    const fields = csv.split("\r\n")[1].split(",");
    expect(fields[6]).toBe("");
    expect(fields[7]).toBe("");
    expect(fields[8]).toBe("");
    expect(fields[15]).toBe("");
  });

  it("exports transfer and ignore rows rather than dropping them", () => {
    const csv = buildCsv([
      baseRow({ categoryType: "transfer", categoryName: "העברה פנימית" }),
      baseRow({ categoryType: "ignore", categoryName: "התעלמות" }),
    ]);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(3); // header + 2 rows
    expect(csv).toContain("העברה");
    expect(csv).toContain("התעלם");
  });

  it("preserves sign exactly as stored — negative stays negative, positive stays positive", () => {
    const csv = buildCsv([
      baseRow({ chargedAmount: -120.5, originalAmount: -120.5 }),
      baseRow({ chargedAmount: 5000, originalAmount: 5000 }),
    ]);
    const rows = csv.split("\r\n").filter(Boolean).slice(1);
    expect(rows[0].split(",")[9]).toBe("-120.50");
    expect(rows[1].split(",")[9]).toBe("5000.00");
  });

  it("formats amounts with exactly two decimal places and no separators or symbols", () => {
    const csv = buildCsv([baseRow({ chargedAmount: 1000, originalAmount: 3.1 })]);
    const fields = csv.split("\r\n")[1].split(",");
    expect(fields[9]).toBe("1000.00");
    expect(fields[11]).toBe("3.10");
  });

  it("renders installment progress as N/M, empty for a normal transaction", () => {
    const csvNormal = buildCsv([baseRow({ installmentNumber: null, installmentTotal: null })]);
    expect(csvNormal.split("\r\n")[1].split(",")[13]).toBe("");

    const csvInstallment = buildCsv([baseRow({ installmentNumber: 3, installmentTotal: 12 })]);
    expect(csvInstallment.split("\r\n")[1].split(",")[13]).toBe("3/12");
  });

  it("defaults an empty chargedCurrency to ILS", () => {
    const csv = buildCsv([baseRow({ chargedCurrency: null })]);
    expect(csv.split("\r\n")[1].split(",")[10]).toBe("ILS");
  });

  it("maps bank type, status, and category source to their Hebrew labels", () => {
    const csv = buildCsv([
      baseRow({ bankType: "visaCal", status: "pending", categorySource: "memory" }),
    ]);
    const fields = csv.split("\r\n")[1].split(",");
    expect(fields[4]).toBe("ויזה כאל");
    expect(fields[14]).toBe("ממתין");
    expect(fields[15]).toBe("זיכרון בית עסק");
  });

  it("carries the memo field through as הערות", () => {
    const csv = buildCsv([baseRow({ memo: "תשלום דו-חודשי" })]);
    expect(csv.split("\r\n")[1].split(",")[16]).toBe("תשלום דו-חודשי");
  });

  describe("RFC 4180 escaping", () => {
    it("quotes a field containing a comma", () => {
      const csv = buildCsv([baseRow({ description: "קפה, מאפה ומיץ" })]);
      expect(csv).toContain('"קפה, מאפה ומיץ"');
    });

    it("doubles embedded quotes and wraps the field in quotes", () => {
      const csv = buildCsv([baseRow({ description: 'מסעדת "השף הגדול"' })]);
      expect(csv).toContain('"מסעדת ""השף הגדול"""');
    });

    it("quotes a field containing an embedded newline (Hebrew description)", () => {
      const csv = buildCsv([baseRow({ description: "שורה ראשונה\nשורה שנייה" })]);
      expect(csv).toContain('"שורה ראשונה\nשורה שנייה"');
    });

    it("does not quote a plain field with no special characters", () => {
      const csv = buildCsv([baseRow({ description: "רגיל" })]);
      expect(csv).toContain(",רגיל,");
    });
  });
});

/** Encodes the response body text the way the HTTP wire actually would, so
 * the BOM presence assertion checks real bytes, not just the string prefix. */
function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("buildCsvWithBom", () => {
  it("prefixes the UTF-8 byte stream with a BOM", () => {
    const bytes = encodeUtf8(buildCsvWithBom([baseRow()]));
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
  });

  it("is the BOM character followed by the plain CSV text", () => {
    const rows = [baseRow()];
    expect(buildCsvWithBom(rows)).toBe("﻿" + buildCsv(rows));
  });

  it("still carries the BOM for an empty result set", () => {
    expect(buildCsvWithBom([])).toBe("﻿" + CSV_HEADERS.join(",") + "\r\n");
  });
});

describe("resolveExportDateRange", () => {
  it("uses explicit filter bounds when both are given", () => {
    const range = resolveExportDateRange(
      { dateFrom: "2026-01-01", dateTo: "2026-01-31" },
      [{ date: "2026-06-15" }],
      "2026-07-18",
    );
    expect(range).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("derives from the min/max dates in the exported set when no bounds are given", () => {
    const range = resolveExportDateRange(
      {},
      [{ date: "2026-03-10" }, { date: "2026-01-05" }, { date: "2026-02-20" }],
      "2026-07-18",
    );
    expect(range).toEqual({ from: "2026-01-05", to: "2026-03-10" });
  });

  it("falls back to today for an empty result set with no filter bounds", () => {
    const range = resolveExportDateRange({}, [], "2026-07-18");
    expect(range).toEqual({ from: "2026-07-18", to: "2026-07-18" });
  });

  it("mixes an explicit dateFrom with a derived dateTo", () => {
    const range = resolveExportDateRange(
      { dateFrom: "2026-01-01" },
      [{ date: "2026-05-01" }, { date: "2026-06-01" }],
      "2026-07-18",
    );
    expect(range).toEqual({ from: "2026-01-01", to: "2026-06-01" });
  });
});

describe("buildExportFilename", () => {
  it("builds the ASCII filename from the resolved range", () => {
    expect(buildExportFilename("2026-01-01", "2026-01-31")).toBe(
      "shayfinance-transactions-2026-01-01_2026-01-31.csv",
    );
  });
});
