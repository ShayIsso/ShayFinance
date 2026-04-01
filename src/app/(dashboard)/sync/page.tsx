export const dynamic = "force-dynamic";

import { listCredentials } from "@/lib/credentials";
import { SyncPanel } from "@/components/sync-panel";

export default async function SyncPage() {
  const credentials = await listCredentials();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">סנכרון</h2>
      <SyncPanel banks={credentials} />
    </div>
  );
}
