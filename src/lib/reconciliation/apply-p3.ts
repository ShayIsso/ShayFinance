import { randomUUID } from "crypto";
import type { ApplyResult, P3InterAccountCandidate } from "./types";
import type { ReconciliationStore } from "./store";

const AUTO_APPLY_THRESHOLD = 0.95;
const TRANSFER_CATEGORY_NAME = "העברה פנימית";

export async function applyP3InterAccount(
  candidates: P3InterAccountCandidate[],
  store: ReconciliationStore,
): Promise<ApplyResult> {
  if (candidates.length === 0) return { autoApplied: 0, queued: 0 };

  const transferCategoryId = await store.getCategoryIdByName(TRANSFER_CATEGORY_NAME);

  let autoApplied = 0;
  let queued = 0;

  for (const { outgoingSide, incomingSide, confidence } of candidates) {
    const groupId = randomUUID();

    if (confidence >= AUTO_APPLY_THRESHOLD && transferCategoryId) {
      await store.applyAutoInterAccount({
        groupId,
        outgoingSideId: outgoingSide.id,
        incomingSideId: incomingSide.id,
        confidence,
        transferCategoryId,
      });
      autoApplied++;
    } else {
      await store.queueInterAccount({
        groupId,
        outgoingSideId: outgoingSide.id,
        incomingSideId: incomingSide.id,
        confidence,
      });
      queued++;
    }
  }

  return { autoApplied, queued };
}
