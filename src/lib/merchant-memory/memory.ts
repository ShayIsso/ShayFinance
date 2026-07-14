import { extractMerchant } from "@/lib/transaction-matching";
import { redactText, type RedactedString } from "@/lib/redaction";

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
  categorySource: CategorySource | null;
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
  getTransaction(id: string): Promise<CorrectionTxn | null>;
  getCategoryName(categoryId: string): Promise<string | null>;
  getOverwritableTransactions(): Promise<OverwritableTxn[]>;
  setTransactionCategory(
    ids: string[],
    categoryId: string,
    source: CategorySource,
    now: Date,
  ): Promise<void>;
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
 * match, overwritable under the law, excluding the transaction just touched.
 */
export function selectFanOutTargets(
  merchantKey: string,
  candidates: OverwritableTxn[],
  excludeTxnId: string,
): string[] {
  return candidates
    .filter((t) => t.id !== excludeTxnId)
    .filter((t) => canOverwrite(t.categorySource))
    .filter((t) => deriveMerchantKey(t.description) === merchantKey)
    .map((t) => t.id);
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
  excludeTxnId: string,
  store: MerchantMemoryStore,
  now: Date,
): Promise<number> {
  if (!merchantKey) return 0;
  const candidates = await store.getOverwritableTransactions();
  const targets = selectFanOutTargets(merchantKey, candidates, excludeTxnId);
  if (targets.length === 0) return 0;
  // Siblings acquire the category by automation applying a user-tier memory
  // entry → `memory`, not `user` (trust tier, not mechanism — ADR-0010 §2).
  await store.setTransactionCategory(targets, toCategoryId, "memory", now);
  return targets.length;
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
): Promise<{ fanOutCount: number }> {
  const { transactionId, toCategoryId, tier } = input;
  const txn = await store.getTransaction(transactionId);
  if (!txn) return { fanOutCount: 0 };

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

  const fanOutCount =
    tier === "user" ? await fanOut(merchantKey, toCategoryId, transactionId, store, now) : 0;
  return { fanOutCount };
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
): Promise<{ fanOutCount: number }> {
  const { transactionId, toCategoryId } = input;
  const txn = await store.getTransaction(transactionId);
  if (!txn) return { fanOutCount: 0 };

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

  const fanOutCount = await fanOut(merchantKey, toCategoryId, transactionId, store, now);
  return { fanOutCount };
}
