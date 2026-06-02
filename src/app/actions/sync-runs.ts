"use server";

import { getLastRunPerBank, drizzleSyncRunStore } from "@/lib/sync/runs";
import type { SyncRunSummary } from "@/lib/sync/runs";

export type { SyncRunSummary };

export async function getLastSyncRunsAction(): Promise<SyncRunSummary[]> {
  return getLastRunPerBank(drizzleSyncRunStore);
}
