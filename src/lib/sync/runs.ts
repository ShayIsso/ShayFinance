import { redact } from "@/lib/logging";
import type { SyncEvent } from "@/lib/scraper";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncRunStatus = "success" | "otp_skipped" | "error";
export type SyncTrigger = "manual" | "scheduled";

export type SyncRunRow = {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  bank: "discount" | "max" | "visaCal";
  status: SyncRunStatus;
  transactionsImported: number;
  errorMessage: string | null;
  triggeredBy: SyncTrigger;
};

export type SyncRunSummary = {
  id: string;
  bank: "discount" | "max" | "visaCal";
  status: SyncRunStatus;
  transactionsImported: number;
  startedAt: Date;
  finishedAt: Date | null;
};

// ── Store interface ───────────────────────────────────────────────────────────

export type SyncRunStore = {
  insert(row: SyncRunRow): Promise<void>;
  update(id: string, patch: Partial<Omit<SyncRunRow, "id">>): Promise<void>;
  getLastRunPerBank(): Promise<SyncRunSummary[]>;
};

// ── Drizzle implementation ────────────────────────────────────────────────────

export function makeDrizzleSyncRunStore(): SyncRunStore {
  return {
    async insert(row) {
      const { db } = await import("@/db");
      const { syncRuns } = await import("@/db/schema");
      await db.insert(syncRuns).values({
        id: row.id,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt ?? undefined,
        bank: row.bank,
        status: row.status,
        transactionsImported: row.transactionsImported,
        errorMessage: row.errorMessage ?? undefined,
        triggeredBy: row.triggeredBy,
      });
    },

    async update(id, patch) {
      const { db } = await import("@/db");
      const { syncRuns } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(syncRuns).set(patch).where(eq(syncRuns.id, id));
    },

    async getLastRunPerBank() {
      const { db } = await import("@/db");
      const { syncRuns } = await import("@/db/schema");
      const { desc } = await import("drizzle-orm");

      // selectDistinctOn: first ORDER BY column must match the DISTINCT ON column
      const rows = await db
        .selectDistinctOn([syncRuns.bank], {
          id: syncRuns.id,
          bank: syncRuns.bank,
          status: syncRuns.status,
          transactionsImported: syncRuns.transactionsImported,
          startedAt: syncRuns.startedAt,
          finishedAt: syncRuns.finishedAt,
        })
        .from(syncRuns)
        .orderBy(syncRuns.bank, desc(syncRuns.startedAt));

      return rows as SyncRunSummary[];
    },
  };
}

export const drizzleSyncRunStore: SyncRunStore = makeDrizzleSyncRunStore();

// ── Pure ID generator (injectable for tests) ──────────────────────────────────

function randomUuid(): string {
  return crypto.randomUUID();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Inserts an optimistic sync_run row with status=success.
 * Returns the new row id.
 */
export async function startSyncRun(
  store: SyncRunStore,
  opts: { bank: "discount" | "max" | "visaCal"; triggeredBy?: SyncTrigger },
): Promise<string> {
  const id = randomUuid();
  const row: SyncRunRow = {
    id,
    startedAt: new Date(),
    finishedAt: null,
    bank: opts.bank,
    status: "success",
    transactionsImported: 0,
    errorMessage: null,
    triggeredBy: opts.triggeredBy ?? "manual",
  };
  await store.insert(row);
  return id;
}

/**
 * Marks a run as successfully completed.
 */
export async function completeSyncRun(
  store: SyncRunStore,
  id: string,
  opts: { transactionsImported: number },
): Promise<void> {
  await store.update(id, {
    finishedAt: new Date(),
    transactionsImported: opts.transactionsImported,
    status: "success",
  });
}

/**
 * Marks a run as failed.
 * Error messages are run through `redact` before persistence (zero-leak policy).
 * For otp_skipped, errorMessage stays null.
 */
export async function failSyncRun(
  store: SyncRunStore,
  id: string,
  opts: { status: "error" | "otp_skipped"; error?: string },
): Promise<void> {
  const errorMessage =
    opts.status === "error" && opts.error != null ? String(redact(opts.error) ?? opts.error) : null;

  await store.update(id, {
    finishedAt: new Date(),
    status: opts.status,
    errorMessage,
  });
}

/**
 * Returns the most recent sync run per bank for the dashboard strip.
 */
export async function getLastRunPerBank(store: SyncRunStore): Promise<SyncRunSummary[]> {
  return store.getLastRunPerBank();
}

/**
 * Maps a scraper event to the terminal sync-run status it implies.
 *
 * The scraper does NOT throw on bank failure — it yields a terminal event and
 * returns. This helper is the single source of truth for translating those
 * yielded events into a `sync_runs` outcome:
 *   - `bank_error`  → "error"        (login/scrape failure; common path)
 *   - `otp_timeout` → "otp_skipped"  (OTP not submitted in time)
 *   - everything else → null         (not terminal; success is decided after the loop)
 */
export function syncRunStatusForEvent(event: SyncEvent): "error" | "otp_skipped" | null {
  if (event.type === "bank_error") return "error";
  if (event.type === "otp_timeout") return "otp_skipped";
  return null;
}
