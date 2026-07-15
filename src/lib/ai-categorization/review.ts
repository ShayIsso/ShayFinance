import {
  recordAssignment,
  removeAiTierEntry,
  deriveMerchantKey,
  type MerchantMemoryStore,
  type FannedOutRow,
} from "@/lib/merchant-memory";

// The three user-driven transitions out of a queued/auto-applied suggestion
// (ADR-0008 §7 / db/schema.ts aiSuggestionStatusEnum). `pending_review` and
// `auto_applied` are written by the AI run itself, never here.
export type ReviewSuggestionStatus = "accepted" | "rejected" | "undone";

/** A pending suggestion as the review flow needs it: enough to render the chip and act on it. */
export interface PendingSuggestionRow {
  readonly transactionId: string;
  readonly suggestionId: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly confidence: number;
}

/** The suggestion behind a live AI-assigned row — enough to undo it. */
export interface ActiveAutoAppliedSuggestion {
  readonly suggestionId: string;
  readonly categoryId: string;
}

/**
 * Suggestion-lifecycle persistence seam (ticket #149). Mirrors the split in
 * run.ts: this store owns only ai_suggestions rows — memory reads/writes stay
 * in the injected MerchantMemoryStore, so this module composes rather than
 * re-implements merchant-memory's atomic operations.
 */
export interface ReviewStore {
  /** Pending-review suggestions for a set of transactions — the review-flow overlay and accept/reject targets. */
  getPendingSuggestions(transactionIds: string[]): Promise<PendingSuggestionRow[]>;
  /**
   * The `auto_applied` suggestion currently backing an ai-sourced transaction.
   * Undo looks this up server-side rather than trust a client-supplied
   * suggestion id — the UI only ever knows the transaction it's undoing.
   */
  getActiveAutoApplied(transactionId: string): Promise<ActiveAutoAppliedSuggestion | null>;
  markSuggestionStatus(suggestionId: string, status: ReviewSuggestionStatus): Promise<void>;
}

export interface AcceptSuggestionInput {
  readonly transactionId: string;
  readonly suggestionId: string;
  readonly categoryId: string;
}

/**
 * Accept = a user decision on a queued suggestion: first-time labeling, so it
 * composes `recordAssignment` at user-tier unchanged (user-tier memory write +
 * fan-out under the overwrite law, no corrections-log row) rather than adding
 * new memory semantics. The suggestion itself is then marked accepted.
 */
export async function acceptSuggestion(
  input: AcceptSuggestionInput,
  reviewStore: ReviewStore,
  memoryStore: MerchantMemoryStore,
  now: Date = new Date(),
): Promise<{ fanOutCount: number; fannedOut: FannedOutRow[] }> {
  const result = await recordAssignment(
    { transactionId: input.transactionId, toCategoryId: input.categoryId, tier: "user" },
    memoryStore,
    now,
  );
  await reviewStore.markSuggestionStatus(input.suggestionId, "accepted");
  return result;
}

export interface RejectSuggestionInput {
  readonly suggestionId: string;
}

/**
 * Reject: the transaction is left untouched (stays uncategorized). Marking the
 * suggestion 'rejected' is what the run's suppression check
 * (`getSuppressedPairs`) reads to never re-suggest this pair.
 */
export async function rejectSuggestion(
  input: RejectSuggestionInput,
  reviewStore: ReviewStore,
): Promise<void> {
  await reviewStore.markSuggestionStatus(input.suggestionId, "rejected");
}

export interface UndoAiAssignmentInput {
  readonly transactionId: string;
}

/**
 * Undo on an AI-assigned row (ticket #149): reverts the category to
 * uncategorized, retracts the merchant's ai-tier memory entry so the cache
 * can't re-apply it (`removeAiTierEntry` never touches a user-tier entry),
 * and marks the backing suggestion undone. Deliberately writes no
 * corrections-log row — undo is cancelling automation, not a user
 * recategorization (ADR-0010 §5 scopes the log to corrections of an
 * already-categorized row).
 *
 * Guards on `categorySource === "ai"` at apply time: a row a user has since
 * touched by other means is never reverted by this automated path. The
 * backing suggestion is looked up server-side (`getActiveAutoApplied`) rather
 * than trusting a client-supplied suggestion id.
 */
export async function undoAiAssignment(
  input: UndoAiAssignmentInput,
  reviewStore: ReviewStore,
  memoryStore: MerchantMemoryStore,
  now: Date = new Date(),
): Promise<{ undone: boolean }> {
  const txn = await memoryStore.getTransaction(input.transactionId);
  if (!txn || txn.categorySource !== "ai") return { undone: false };

  const active = await reviewStore.getActiveAutoApplied(input.transactionId);
  if (!active) return { undone: false };

  await memoryStore.restoreTransactionCategories(
    [{ id: input.transactionId, previousCategoryId: null, previousCategorySource: null }],
    now,
  );
  await removeAiTierEntry(deriveMerchantKey(txn.description), memoryStore);
  await reviewStore.markSuggestionStatus(active.suggestionId, "undone");
  return { undone: true };
}
