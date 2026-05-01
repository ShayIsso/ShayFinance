import { randomUUID } from "crypto";
import type { ApplyResult, ReconciliationCandidate } from "./types";
import type { ReconciliationStore } from "./store";

const AUTO_APPLY_THRESHOLD = 0.95;
const SETTLEMENT_CATEGORY_NAME = "הסדרה - כרטיס אשראי";

export async function applyReconciliation(
  candidates: ReconciliationCandidate[],
  store: ReconciliationStore,
): Promise<ApplyResult> {
  if (candidates.length === 0) return { autoApplied: 0, queued: 0 };

  const settlementCategoryId = await store.getCategoryIdByName(SETTLEMENT_CATEGORY_NAME);

  let autoApplied = 0;
  let queued = 0;

  for (const { bankLump, cardDetails, confidence } of candidates) {
    const groupId = randomUUID();
    const cardDetailIds = cardDetails.map((c) => c.id);

    if (confidence >= AUTO_APPLY_THRESHOLD && settlementCategoryId) {
      await store.applyAutoReconciliation({
        groupId,
        bankLumpId: bankLump.id,
        cardDetailIds,
        confidence,
        settlementCategoryId,
      });
      autoApplied++;
    } else {
      await store.queueReconciliation({
        groupId,
        bankLumpId: bankLump.id,
        cardDetailIds,
        confidence,
      });
      queued++;
    }
  }

  return { autoApplied, queued };
}
