import { randomUUID } from "crypto";
import type { ApplyResult, P2MirrorCandidate } from "./types";
import type { ReconciliationStore } from "./store";

const AUTO_APPLY_THRESHOLD = 0.95;
const TRANSFER_CATEGORY_NAME = "העברה פנימית";

export async function applyP2Mirror(
  candidates: P2MirrorCandidate[],
  store: ReconciliationStore,
): Promise<ApplyResult> {
  if (candidates.length === 0) return { autoApplied: 0, queued: 0 };

  const transferCategoryId = await store.getCategoryIdByName(TRANSFER_CATEGORY_NAME);

  let autoApplied = 0;
  let queued = 0;

  for (const { bankSide, cardSide, confidence } of candidates) {
    const groupId = randomUUID();

    if (confidence >= AUTO_APPLY_THRESHOLD && transferCategoryId) {
      await store.applyAutoMirror({
        groupId,
        bankSideId: bankSide.id,
        cardSideId: cardSide.id,
        confidence,
        transferCategoryId,
      });
      autoApplied++;
    } else {
      await store.queueMirror({
        groupId,
        bankSideId: bankSide.id,
        cardSideId: cardSide.id,
        confidence,
      });
      queued++;
    }
  }

  return { autoApplied, queued };
}
