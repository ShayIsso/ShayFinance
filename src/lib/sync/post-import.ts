import {
  detectP1Settlement,
  applyReconciliation,
  detectP2Mirror,
  applyP2Mirror,
  detectP3InterAccount,
  applyP3InterAccount,
  type ReconciliationStore,
} from "@/lib/reconciliation";
import type { AiStepDeps, AiStepEvent } from "./ai-step";

export type ReconciliationSummaryEvent = {
  readonly type: "reconciliation_summary";
  readonly autoApplied: number;
  readonly queued: number;
};

export type SyncCompleteEvent = {
  readonly type: "sync_complete";
  readonly summary: { readonly total: number; readonly byBank: Record<string, number> };
};

export type PostSyncEvent = ReconciliationSummaryEvent | AiStepEvent | SyncCompleteEvent;

export interface PostImportDeps {
  readonly reconciliationStore: ReconciliationStore;
  /** Recurring detection, kept injectable so the pipeline's ordering is testable. */
  readonly runRecurring: () => Promise<unknown>;
  readonly runAiStep: (deps: AiStepDeps) => AsyncGenerator<AiStepEvent>;
  readonly ai: AiStepDeps;
  readonly importSummary: { total: number; byBank: Record<string, number> };
}

/**
 * The post-import pipeline: reconciliation P1–P3, then recurring detection, then
 * the AI categorization step, then `sync_complete`. Extracted from `syncAllBanks`
 * so the ordering and the failure isolation are exercisable through store fakes.
 *
 * Recurring detection and the AI step are each wrapped so a failure in either is
 * non-fatal — the pipeline always reaches `sync_complete`. Detection surfaces on
 * /subscriptions, not the stream; the AI step yields its own summary event.
 */
export async function* runPostImportPipeline(deps: PostImportDeps): AsyncGenerator<PostSyncEvent> {
  const store = deps.reconciliationStore;

  // P1: credit-card settlement lump detection
  const recentTxns = await store.getRecentTransactions(90);
  const p1Candidates = detectP1Settlement(recentTxns);
  const p1Result = await applyReconciliation(p1Candidates, store);

  // P2: 1:1 mirror detection — re-fetch so P1's updates are visible
  const recentTxnsAfterP1 = await store.getRecentTransactions(90);
  const p2Candidates = detectP2Mirror(recentTxnsAfterP1);
  const p2Result = await applyP2Mirror(p2Candidates, store);

  // P3: inter-account transfer detection — re-fetch so P2's updates are visible
  const recentTxnsAfterP2 = await store.getRecentTransactions(90);
  const p3Candidates = detectP3InterAccount(recentTxnsAfterP2);
  const p3Result = await applyP3InterAccount(p3Candidates, store);

  yield {
    type: "reconciliation_summary",
    autoApplied: p1Result.autoApplied + p2Result.autoApplied + p3Result.autoApplied,
    queued: p1Result.queued + p2Result.queued + p3Result.queued,
  };

  // Recurring detection runs after reconciliation so category-flipped
  // transactions are already settled.
  try {
    await deps.runRecurring();
  } catch {
    // Non-fatal — sync completes regardless.
  }

  // AI step is the FINAL stage: it runs over rows still NULL after reconciliation
  // (and its guard-routing depends on P3 having already paired what it could).
  try {
    yield* deps.runAiStep(deps.ai);
  } catch {
    // Non-fatal — sync completes regardless.
  }

  yield { type: "sync_complete", summary: deps.importSummary };
}
