import { describe, it, expect } from "vitest";
import {
  startSyncRun,
  completeSyncRun,
  failSyncRun,
  getLastRunPerBank,
  syncRunStatusForEvent,
} from "../runs";
import type { SyncRunStore, SyncRunRow, SyncRunSummary } from "../runs";
import type { SyncEvent } from "@/lib/scraper";

// ── In-memory store ───────────────────────────────────────────────────────────

function makeInMemoryStore(): SyncRunStore & { rows: Map<string, SyncRunRow> } {
  const rows = new Map<string, SyncRunRow>();

  return {
    rows,

    async insert(row: SyncRunRow) {
      rows.set(row.id, { ...row });
    },

    async update(id: string, patch: Partial<Omit<SyncRunRow, "id">>) {
      const existing = rows.get(id);
      if (existing) {
        rows.set(id, { ...existing, ...patch });
      }
    },

    async getLastRunPerBank(): Promise<SyncRunSummary[]> {
      // Group by bank, return most-recent per bank
      const latestByBank = new Map<string, SyncRunRow>();
      for (const row of rows.values()) {
        const existing = latestByBank.get(row.bank);
        if (!existing || row.startedAt > existing.startedAt) {
          latestByBank.set(row.bank, row);
        }
      }
      return Array.from(latestByBank.values()).map((r) => ({
        id: r.id,
        bank: r.bank,
        status: r.status,
        transactionsImported: r.transactionsImported,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
      }));
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("startSyncRun", () => {
  it("inserts a row with status success, startedAt set, finishedAt null, and returns id", async () => {
    const store = makeInMemoryStore();
    const id = await startSyncRun(store, { bank: "discount" });

    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const row = store.rows.get(id);
    expect(row).toBeDefined();
    expect(row!.status).toBe("success");
    expect(row!.finishedAt).toBeNull();
    expect(row!.startedAt).toBeInstanceOf(Date);
    expect(row!.bank).toBe("discount");
    expect(row!.transactionsImported).toBe(0);
    expect(row!.errorMessage).toBeNull();
  });

  it("records triggeredBy as manual by default", async () => {
    const store = makeInMemoryStore();
    const id = await startSyncRun(store, { bank: "max" });
    expect(store.rows.get(id)!.triggeredBy).toBe("manual");
  });

  it("records triggeredBy when explicitly set", async () => {
    const store = makeInMemoryStore();
    const id = await startSyncRun(store, { bank: "visaCal", triggeredBy: "scheduled" });
    expect(store.rows.get(id)!.triggeredBy).toBe("scheduled");
  });
});

describe("completeSyncRun", () => {
  it("sets finishedAt and transactionsImported", async () => {
    const store = makeInMemoryStore();
    const id = await startSyncRun(store, { bank: "max" });

    await completeSyncRun(store, id, { transactionsImported: 42 });

    const row = store.rows.get(id);
    expect(row!.transactionsImported).toBe(42);
    expect(row!.finishedAt).toBeInstanceOf(Date);
    expect(row!.status).toBe("success");
  });
});

describe("failSyncRun", () => {
  it("sets status error and stores a redacted errorMessage", async () => {
    const store = makeInMemoryStore();
    const id = await startSyncRun(store, { bank: "discount" });

    await failSyncRun(store, id, {
      status: "error",
      error: "Connection refused at timeout",
    });

    const row = store.rows.get(id);
    expect(row!.status).toBe("error");
    expect(row!.errorMessage).toBe("Connection refused at timeout");
    expect(row!.finishedAt).toBeInstanceOf(Date);
  });

  it("redacts credentials in the error string before persisting", async () => {
    const store = makeInMemoryStore();
    const id = await startSyncRun(store, { bank: "discount" });

    // Simulate an error message that accidentally contains a Bearer token
    await failSyncRun(store, id, {
      status: "error",
      error: "Request failed: Bearer abc123.xyz.token response 401",
    });

    const row = store.rows.get(id);
    expect(row!.errorMessage).toBe("Request failed: Bearer [REDACTED] response 401");
    expect(row!.errorMessage).not.toContain("abc123.xyz.token");
  });

  it("sets status otp_skipped and leaves errorMessage null", async () => {
    const store = makeInMemoryStore();
    const id = await startSyncRun(store, { bank: "visaCal" });

    await failSyncRun(store, id, { status: "otp_skipped" });

    const row = store.rows.get(id);
    expect(row!.status).toBe("otp_skipped");
    expect(row!.errorMessage).toBeNull();
    expect(row!.finishedAt).toBeInstanceOf(Date);
  });
});

describe("getLastRunPerBank", () => {
  it("returns empty array when no runs exist", async () => {
    const store = makeInMemoryStore();
    const result = await getLastRunPerBank(store);
    expect(result).toEqual([]);
  });

  it("returns the most recent run per bank when multiple exist", async () => {
    const store = makeInMemoryStore();

    // Insert two runs for discount — the second should be returned
    const id1 = await startSyncRun(store, { bank: "discount" });
    await completeSyncRun(store, id1, { transactionsImported: 5 });

    // Small delay to ensure different startedAt timestamps
    await new Promise((r) => setTimeout(r, 2));

    const id2 = await startSyncRun(store, { bank: "discount" });
    await completeSyncRun(store, id2, { transactionsImported: 12 });

    // Also a max run
    const id3 = await startSyncRun(store, { bank: "max" });
    await completeSyncRun(store, id3, { transactionsImported: 3 });

    const results = await getLastRunPerBank(store);

    expect(results).toHaveLength(2);

    const discountRun = results.find((r) => r.bank === "discount");
    expect(discountRun).toBeDefined();
    expect(discountRun!.transactionsImported).toBe(12);
    expect(discountRun!.id).toBe(id2);

    const maxRun = results.find((r) => r.bank === "max");
    expect(maxRun).toBeDefined();
    expect(maxRun!.transactionsImported).toBe(3);
  });

  it("includes all banks when each has a run", async () => {
    const store = makeInMemoryStore();

    await startSyncRun(store, { bank: "discount" });
    await startSyncRun(store, { bank: "max" });
    await startSyncRun(store, { bank: "visaCal" });

    const results = await getLastRunPerBank(store);
    expect(results).toHaveLength(3);

    const banks = results.map((r) => r.bank).sort();
    expect(banks).toEqual(["discount", "max", "visaCal"]);
  });
});

describe("syncRunStatusForEvent", () => {
  it("maps bank_error → error", () => {
    const event: SyncEvent = {
      type: "bank_error",
      bank: "discount",
      error: "LOGIN_FAILED",
      hasScreenshot: true,
      screenshotFilename: "discount-123.png",
    };
    expect(syncRunStatusForEvent(event)).toBe("error");
  });

  it("maps otp_timeout → otp_skipped", () => {
    const event: SyncEvent = { type: "otp_timeout", bank: "max" };
    expect(syncRunStatusForEvent(event)).toBe("otp_skipped");
  });

  it("maps bank_complete → null (not terminal — success decided after the loop)", () => {
    const event: SyncEvent = { type: "bank_complete", bank: "visaCal", accounts: [] };
    expect(syncRunStatusForEvent(event)).toBeNull();
  });

  it("maps progress → null", () => {
    const event: SyncEvent = { type: "progress", bank: "discount", status: "scraping" };
    expect(syncRunStatusForEvent(event)).toBeNull();
  });

  it("maps otp_required → null", () => {
    const event: SyncEvent = {
      type: "otp_required",
      bank: "max",
      otpHandler: {
        resolveOtp: () => {},
        promise: Promise.resolve(""),
        cancel: () => {},
      },
    };
    expect(syncRunStatusForEvent(event)).toBeNull();
  });
});
