import {
  runAiCategorization,
  type AiCategorizationStore,
  type BatchPacing,
  type CategorizationProvider,
} from "@/lib/ai-categorization";
import type { MerchantMemoryStore } from "@/lib/merchant-memory";
import type { SuspectedTransferRouter } from "@/lib/reconciliation";

/**
 * The AI summary surfaced on the Sync page, mirroring the reconciliation
 * summary. Every uncategorized row the step considered lands in exactly one
 * bucket: `applied` (categorized — memory or auto-apply), `queued` (an AI review
 * suggestion, or a suspected transfer routed to the reconciliation inbox), or
 * `skipped` (still uncategorized — low confidence, suppressed, overwrite-locked,
 * or transfer-guarded without a routing). So applied + queued + skipped equals
 * the total the run examined.
 */
export interface AiSummary {
  readonly applied: number;
  readonly queued: number;
  readonly skipped: number;
}

export type AiStepEvent = { readonly type: "ai_summary" } & AiSummary;

export interface AiStepDeps {
  /** Off short-circuits to `null` before any provider/run work (fresh install). */
  readonly createProvider: () => CategorizationProvider | null;
  readonly aiStore: AiCategorizationStore;
  readonly memoryStore: MerchantMemoryStore;
  readonly transferRouter: SuspectedTransferRouter;
  readonly pacing?: BatchPacing;
  readonly now?: Date;
}

/**
 * The final post-sync stage: categorize NULL-category rows the rules and
 * merchant memory could not resolve, and route transfer-guarded-but-unpaired
 * rows into the reconciliation inbox. Wired after reconciliation P1–P3 and
 * recurring detection (see `post-import.ts`).
 *
 * Failure isolation (recurring-detection idiom): provider construction, a thrown
 * run, rate-limit exhaustion, and routing errors are all swallowed and the sync
 * still completes, leaving unresolved rows honestly uncategorized. A failure
 * before the run yields no summary; a failure during inbox routing still yields
 * it — categories were already applied, and hiding them would misreport the
 * sync. Provider "off" short-circuits before any AI code path.
 */
export async function* runAiSyncStep(deps: AiStepDeps): AsyncGenerator<AiStepEvent> {
  let provider: CategorizationProvider | null;
  try {
    provider = deps.createProvider();
  } catch {
    return;
  }
  if (!provider) return;

  let summary;
  try {
    summary = await runAiCategorization(
      {
        aiStore: deps.aiStore,
        memoryStore: deps.memoryStore,
        provider,
        pacing: deps.pacing,
      },
      deps.now ?? new Date(),
    );
  } catch {
    return;
  }

  let routed = 0;
  try {
    const unpaired = await deps.transferRouter.filterUnpaired([...summary.transferSkippedIds]);
    for (const id of unpaired) {
      await deps.transferRouter.queueSuspectedTransfer(id);
      routed++;
    }
  } catch {
    // Routing is best-effort: the guarded rows stay out of AI either way and
    // surface again next sync; the applied/queued counts below stay honest.
  }

  const applied = summary.memoryApplied + summary.autoApplied;
  const queued = summary.queuedForReview + routed;
  const skipped = Math.max(0, summary.totalUncategorized - applied - queued);
  yield { type: "ai_summary", applied, queued, skipped };
}
