import { extractMerchant } from "@/lib/transaction-matching";
import { redactText, type RedactedString } from "@/lib/redaction";
// Deep import, not the "@/lib/categories" module surface: that index.ts pulls
// in "@/db", and this module is the pure computation layer — importing it
// would drag Drizzle/postgres into every caller of merchant-memory's pure
// functions.
import { NotAssignableCategoryError } from "@/lib/categories/errors";

// Trust tier of a category assignment on a transaction (ADR-0010 §2). NULL
// (represented as `null`) means uncategorized.
export type CategorySource = "rule" | "memory" | "ai" | "user";

// Trust tier of a merchant-memory entry (ADR-0010 §4).
export type MemorySource = "user" | "ai";

export type MemoryEntry = {
  merchantKey: string;
  categoryId: string;
  source: MemorySource;
};

export type CorrectionTxn = {
  id: string;
  description: string;
  categoryId: string | null;
  categorySource: CategorySource | null;
};

export type OverwritableTxn = {
  id: string;
  description: string;
  categoryId: string | null;
  categorySource: CategorySource | null;
};

/**
 * Pre-fan-out state of a sibling transaction, captured so one-click undo
 * (ADR-0010 §4) can restore exactly what automation overwrote — no guessing.
 */
export type FannedOutRow = {
  id: string;
  previousCategoryId: string | null;
  previousCategorySource: CategorySource | null;
};

export type NewCorrection = {
  transactionId: string;
  merchantKey: string;
  descriptionRedacted: RedactedString;
  fromCategoryName: string;
  toCategoryName: string;
  fromCategoryId: string | null;
  toCategoryId: string | null;
  fromSource: CategorySource;
};

/**
 * Data-access surface for the module. The DB implementation lives in store.ts;
 * tests inject an in-memory version. applyCorrection's writes must be atomic —
 * the DB wrapper binds this store to a single transaction (ADR-0010 §6).
 */
export type MerchantMemoryStore = {
  findEntriesByKeys(keys: string[]): Promise<MemoryEntry[]>;
  recordHits(keys: string[], now: Date): Promise<void>;
  getEntry(merchantKey: string): Promise<MemoryEntry | null>;
  upsertEntry(entry: MemoryEntry, now: Date): Promise<void>;
  /**
   * Retracts an ai-tier memory entry (ticket #149 — AI-assignment undo only).
   * The tier constraint is part of the contract at every layer: implementations
   * must refuse to delete a user-tier row even when handed its key.
   */
  deleteAiTierEntry(merchantKey: string): Promise<void>;
  getTransaction(id: string): Promise<CorrectionTxn | null>;
  getCategoryName(categoryId: string): Promise<string | null>;
  /**
   * Candidate fan-out siblings for a merchant key: rows overwritable under the
   * law. May over-return (e.g. an SQL prefilter) — the exact key match happens
   * in selectFanOutTargets; it must never under-return for the given key.
   */
  getOverwritableTransactions(merchantKey: string): Promise<OverwritableTxn[]>;
  /**
   * Whether a category has children (ADR-0011 §3) — the one extra read every
   * assignment write needs so merchant memory can never learn a group's id.
   */
  categoryHasChildren(categoryId: string): Promise<boolean>;
  setTransactionCategory(
    ids: string[],
    categoryId: string,
    source: CategorySource,
    now: Date,
  ): Promise<void>;
  restoreTransactionCategories(rows: FannedOutRow[], now: Date): Promise<void>;
  appendCorrection(row: NewCorrection): Promise<void>;
};

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * The memory key is `extractMerchant(description)` on the RAW description
 * (never custom_description, never canonicalizeMerchant — ADR-0010 §4). This
 * delegates rather than duplicates so the key can never drift from matching.
 */
export function deriveMerchantKey(description: string): string {
  return extractMerchant(description);
}

/**
 * The single overwrite law (ADR-0010 §3): automation may overwrite only
 * uncategorized (NULL) and ai-sourced assignments. user/rule/memory are never
 * overwritten by automation.
 */
export function canOverwrite(source: CategorySource | null): boolean {
  return source === null || source === "ai";
}

/**
 * How a memory write resolves against an existing entry. User tier always
 * wins (last-write-wins, promotes ai→user). Ai tier never downgrades a
 * user-tier entry — a cached AI guess cannot displace a confirmed mapping.
 */
export function resolveEntryWrite(
  existing: { source: MemorySource } | null,
  tier: MemorySource,
): "write-user" | "write-ai" | "skip" {
  if (tier === "user") return "write-user";
  if (existing?.source === "user") return "skip";
  return "write-ai";
}

/**
 * Same-key siblings a user-tier write may auto-apply to: exact merchant-key
 * match, overwritable under the law, excluding the transactions just touched.
 */
export function selectFanOutTargets(
  merchantKey: string,
  candidates: OverwritableTxn[],
  excludeTxnIds: readonly string[],
): OverwritableTxn[] {
  return candidates
    .filter((t) => !excludeTxnIds.includes(t.id))
    .filter((t) => canOverwrite(t.categorySource))
    .filter((t) => deriveMerchantKey(t.description) === merchantKey);
}

/**
 * A group is never assignable (ADR-0011 §3) — guards every write that would
 * otherwise let merchant memory learn a group's id.
 */
async function assertAssignableCategory(
  categoryId: string,
  store: Pick<MerchantMemoryStore, "categoryHasChildren">,
): Promise<void> {
  if (await store.categoryHasChildren(categoryId)) {
    throw new NotAssignableCategoryError();
  }
}

// ── Store-injected orchestration ──────────────────────────────────────────────

/**
 * Bulk memory lookup consulted before any AI batch (ADR-0010 §1). Returns
 * key→entry for hits and records a hit on every found key — a lookup that
 * finds an entry is an application (the caller assigns it).
 */
export async function lookupMemory(
  keys: string[],
  store: MerchantMemoryStore,
  now: Date = new Date(),
): Promise<Map<string, MemoryEntry>> {
  if (keys.length === 0) return new Map();
  const entries = await store.findEntriesByKeys(keys);
  if (entries.length === 0) return new Map();
  await store.recordHits(
    entries.map((e) => e.merchantKey),
    now,
  );
  return new Map(entries.map((e) => [e.merchantKey, e]));
}

async function fanOut(
  merchantKey: string,
  toCategoryId: string,
  excludeTxnIds: readonly string[],
  store: MerchantMemoryStore,
  now: Date,
): Promise<FannedOutRow[]> {
  if (!merchantKey) return [];
  const candidates = await store.getOverwritableTransactions(merchantKey);
  const targets = selectFanOutTargets(merchantKey, candidates, excludeTxnIds);
  if (targets.length === 0) return [];
  // Siblings acquire the category by automation applying a user-tier memory
  // entry → `memory`, not `user` (trust tier, not mechanism — ADR-0010 §2).
  await store.setTransactionCategory(
    targets.map((t) => t.id),
    toCategoryId,
    "memory",
    now,
  );
  return targets.map((t) => ({
    id: t.id,
    previousCategoryId: t.categoryId,
    previousCategorySource: t.categorySource,
  }));
}

/**
 * One-click undo of a fan-out (ADR-0010 §4): restores each sibling to its
 * pre-fan-out category and provenance. Cancelling automation is not new
 * evidence — no corrections-log rows — and the memory entry the user wrote
 * stays as written.
 */
export async function undoFanOut(
  rows: FannedOutRow[],
  store: MerchantMemoryStore,
  now: Date = new Date(),
): Promise<void> {
  if (rows.length === 0) return;
  await store.restoreTransactionCategories(rows, now);
}

/**
 * Retracts a merchant's memory entry if — and only if — it is still ai-tier
 * (undoing an AI assignment, ticket #149: the cache must not re-apply a guess
 * the user just reverted). A user-tier entry is a confirmed mapping and is
 * never removed by this automated path, even under the same merchant key.
 */
export async function removeAiTierEntry(
  merchantKey: string,
  store: MerchantMemoryStore,
): Promise<void> {
  if (!merchantKey) return;
  const entry = await store.getEntry(merchantKey);
  if (entry?.source === "ai") {
    await store.deleteAiTierEntry(merchantKey);
  }
}

export type RecordAssignmentInput = {
  transactionId: string;
  toCategoryId: string;
  tier: MemorySource;
};

/**
 * First-time labeling of a transaction — a memory write with NO corrections
 * log row (ADR-0010 §5). User-tier fans out to same-key siblings under the
 * overwrite law; ai-tier marks the row AI-assigned and never fans out.
 */
export async function recordAssignment(
  input: RecordAssignmentInput,
  store: MerchantMemoryStore,
  now: Date = new Date(),
): Promise<{ fanOutCount: number; fannedOut: FannedOutRow[] }> {
  const { transactionId, toCategoryId, tier } = input;
  await assertAssignableCategory(toCategoryId, store);
  const txn = await store.getTransaction(transactionId);
  if (!txn) return { fanOutCount: 0, fannedOut: [] };

  const merchantKey = deriveMerchantKey(txn.description);
  const existing = await store.getEntry(merchantKey);
  const decision = resolveEntryWrite(existing, tier);
  if (decision !== "skip") {
    await store.upsertEntry(
      { merchantKey, categoryId: toCategoryId, source: decision === "write-user" ? "user" : "ai" },
      now,
    );
  }

  const targetSource: CategorySource = tier === "user" ? "user" : "ai";
  await store.setTransactionCategory([transactionId], toCategoryId, targetSource, now);

  const fannedOut =
    tier === "user" ? await fanOut(merchantKey, toCategoryId, [transactionId], store, now) : [];
  return { fanOutCount: fannedOut.length, fannedOut };
}

export type ApplyCorrectionInput = {
  transactionId: string;
  toCategoryId: string;
};

/**
 * Recategorizing an already-categorized transaction — one atomic operation
 * (ADR-0010 §6): overwrite+promote the memory entry to user-tier, append the
 * corrections-log row (redacted snapshot + category-name snapshots), and fan
 * out to same-key siblings under the overwrite law. Returns the fan-out count.
 */
export async function applyCorrection(
  input: ApplyCorrectionInput,
  store: MerchantMemoryStore,
  now: Date = new Date(),
): Promise<{ fanOutCount: number; fannedOut: FannedOutRow[] }> {
  const { transactionId, toCategoryId } = input;
  await assertAssignableCategory(toCategoryId, store);
  const txn = await store.getTransaction(transactionId);
  if (!txn) return { fanOutCount: 0, fannedOut: [] };
  // Re-selecting the current category is not a correction: no from-X-to-X log
  // row, no memory write, no fan-out.
  if (txn.categoryId === toCategoryId) return { fanOutCount: 0, fannedOut: [] };

  const merchantKey = deriveMerchantKey(txn.description);
  const fromCategoryId = txn.categoryId;
  // A categorized row with a null source predates the backfill; treat it as a
  // user decision (protective) rather than an overwritable guess.
  const fromSource: CategorySource = txn.categorySource ?? "user";
  const fromCategoryName = fromCategoryId
    ? ((await store.getCategoryName(fromCategoryId)) ?? "")
    : "";
  const toCategoryName = (await store.getCategoryName(toCategoryId)) ?? "";

  await store.upsertEntry({ merchantKey, categoryId: toCategoryId, source: "user" }, now);

  await store.appendCorrection({
    transactionId,
    merchantKey,
    descriptionRedacted: redactText(txn.description),
    fromCategoryName,
    toCategoryName,
    fromCategoryId,
    toCategoryId,
    fromSource,
  });

  await store.setTransactionCategory([transactionId], toCategoryId, "user", now);

  const fannedOut = await fanOut(merchantKey, toCategoryId, [transactionId], store, now);
  return { fanOutCount: fannedOut.length, fannedOut };
}

export type ApplyBulkCategorizationInput = {
  transactionIds: string[];
  toCategoryId: string;
};

/**
 * Bulk manual categorization — the same policy as the single-row operations,
 * composed for a selection (ADR-0010 §4–5): every selected previously-
 * categorized row that actually changes gets its own corrections-log row
 * (bulk flips are exactly the oscillation evidence #133 needs), every distinct
 * merchant learns a user-tier entry (last-write-wins), all selected rows are
 * marked `user`, and each distinct merchant fans out once to non-selected
 * siblings under the overwrite law.
 */
export async function applyBulkCategorization(
  input: ApplyBulkCategorizationInput,
  store: MerchantMemoryStore,
  now: Date = new Date(),
): Promise<{ fanOutCount: number; fannedOut: FannedOutRow[] }> {
  const { transactionIds, toCategoryId } = input;
  await assertAssignableCategory(toCategoryId, store);
  const toCategoryName = (await store.getCategoryName(toCategoryId)) ?? "";

  const found: CorrectionTxn[] = [];
  for (const id of transactionIds) {
    const txn = await store.getTransaction(id);
    if (txn) found.push(txn);
  }
  if (found.length === 0) return { fanOutCount: 0, fannedOut: [] };

  const nameCache = new Map<string, string>();
  for (const txn of found) {
    if (txn.categoryId === null || txn.categoryId === toCategoryId) continue;
    let fromCategoryName = nameCache.get(txn.categoryId);
    if (fromCategoryName === undefined) {
      fromCategoryName = (await store.getCategoryName(txn.categoryId)) ?? "";
      nameCache.set(txn.categoryId, fromCategoryName);
    }
    await store.appendCorrection({
      transactionId: txn.id,
      merchantKey: deriveMerchantKey(txn.description),
      descriptionRedacted: redactText(txn.description),
      fromCategoryName,
      toCategoryName,
      fromCategoryId: txn.categoryId,
      toCategoryId,
      // See applyCorrection: a categorized row with no source predates the
      // backfill and is treated as a user decision.
      fromSource: txn.categorySource ?? "user",
    });
  }

  const merchantKeys = new Set<string>();
  for (const txn of found) {
    const key = deriveMerchantKey(txn.description);
    if (key) merchantKeys.add(key);
  }
  for (const key of merchantKeys) {
    await store.upsertEntry({ merchantKey: key, categoryId: toCategoryId, source: "user" }, now);
  }

  await store.setTransactionCategory(
    found.map((t) => t.id),
    toCategoryId,
    "user",
    now,
  );

  const selectedIds = found.map((t) => t.id);
  const fannedOut: FannedOutRow[] = [];
  for (const key of merchantKeys) {
    fannedOut.push(...(await fanOut(key, toCategoryId, selectedIds, store, now)));
  }
  return { fanOutCount: fannedOut.length, fannedOut };
}
