export const dynamic = "force-dynamic";

import { listCredentials } from "@/lib/credentials";
import { SyncPanel } from "@/components/sync-panel";
import { getLastRunPerBank, drizzleSyncRunStore } from "@/lib/sync/runs";

export default async function SyncPage() {
  // Persisted fallback for SyncPanel's live SSE state (#223) — the same
  // per-bank read the dashboard's SyncFreshnessPill already uses, so a
  // failure or otp_skipped run survives a reload instead of only living in
  // this tab's in-memory SSE state.
  const [credentials, lastRuns] = await Promise.all([
    listCredentials(),
    getLastRunPerBank(drizzleSyncRunStore),
  ]);
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">סנכרון</h2>
      <SyncPanel banks={credentials} lastRuns={lastRuns} />
    </div>
  );
}
