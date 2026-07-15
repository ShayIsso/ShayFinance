import { describe, it, expect } from "vitest";
import { runPostImportPipeline, type PostSyncEvent } from "../post-import";
import type { AiStepDeps, AiStepEvent } from "../ai-step";
import type { ReconciliationStore } from "@/lib/reconciliation";

// Reconciliation store fake: no recent transactions → P1–P3 find nothing, so the
// reconciliation summary is all zeros. The pipeline's ordering and failure
// isolation are what these tests exercise, not the detection maths (covered in
// the reconciliation suites).
function emptyReconciliationStore(): ReconciliationStore {
  return {
    async getRecentTransactions() {
      return [];
    },
    async getCategoryIdByName() {
      return null;
    },
    async applyAutoReconciliation() {},
    async queueReconciliation() {},
    async applyAutoMirror() {},
    async queueMirror() {},
    async applyAutoInterAccount() {},
    async queueInterAccount() {},
  };
}

const noopAi: AiStepDeps = {
  createProvider: () => null,
  aiStore: {} as AiStepDeps["aiStore"],
  memoryStore: {} as AiStepDeps["memoryStore"],
  transferRouter: {} as AiStepDeps["transferRouter"],
};

async function collect(gen: AsyncGenerator<PostSyncEvent>): Promise<PostSyncEvent[]> {
  const out: PostSyncEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const IMPORT_SUMMARY = { total: 3, byBank: { max: 3 } };

describe("runPostImportPipeline", () => {
  it("runs the AI step after recurring detection, and yields summaries in order", async () => {
    const order: string[] = [];

    async function* aiStep(): AsyncGenerator<AiStepEvent> {
      order.push("ai");
      yield { type: "ai_summary", applied: 2, queued: 1, skipped: 0 };
    }

    const events = await collect(
      runPostImportPipeline({
        reconciliationStore: emptyReconciliationStore(),
        runRecurring: async () => {
          order.push("recurring");
        },
        runAiStep: aiStep,
        ai: noopAi,
        importSummary: IMPORT_SUMMARY,
      }),
    );

    expect(order).toEqual(["recurring", "ai"]);
    expect(events.map((e) => e.type)).toEqual([
      "reconciliation_summary",
      "ai_summary",
      "sync_complete",
    ]);
    expect(events[0]).toMatchObject({ type: "reconciliation_summary", autoApplied: 0, queued: 0 });
    expect(events[2]).toMatchObject({ type: "sync_complete", summary: IMPORT_SUMMARY });
  });

  it("still yields sync_complete when the AI step throws (failure isolation)", async () => {
    async function* throwingAiStep(): AsyncGenerator<AiStepEvent> {
      throw new Error("ai blew up");
    }

    const events = await collect(
      runPostImportPipeline({
        reconciliationStore: emptyReconciliationStore(),
        runRecurring: async () => {},
        runAiStep: throwingAiStep,
        ai: noopAi,
        importSummary: IMPORT_SUMMARY,
      }),
    );

    expect(events.map((e) => e.type)).toEqual(["reconciliation_summary", "sync_complete"]);
    expect(events.at(-1)).toMatchObject({ type: "sync_complete", summary: IMPORT_SUMMARY });
  });

  it("still yields sync_complete when recurring detection throws", async () => {
    async function* aiStep(): AsyncGenerator<AiStepEvent> {
      yield { type: "ai_summary", applied: 0, queued: 0, skipped: 0 };
    }

    const events = await collect(
      runPostImportPipeline({
        reconciliationStore: emptyReconciliationStore(),
        runRecurring: async () => {
          throw new Error("detection down");
        },
        runAiStep: aiStep,
        ai: noopAi,
        importSummary: IMPORT_SUMMARY,
      }),
    );

    expect(events.map((e) => e.type)).toEqual([
      "reconciliation_summary",
      "ai_summary",
      "sync_complete",
    ]);
  });
});
