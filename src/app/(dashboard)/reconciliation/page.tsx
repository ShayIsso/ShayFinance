export const dynamic = "force-dynamic";

import { getPendingInboxRows } from "@/lib/reconciliation/inbox-store";
import { ReconciliationInbox } from "@/components/reconciliation-inbox";

export default async function ReconciliationPage() {
  const rows = await getPendingInboxRows();

  // Group rows by reconciliationGroupId
  const groupMap = new Map<
    string,
    {
      groupId: string;
      confidence: number;
      members: typeof rows;
    }
  >();

  for (const row of rows) {
    const existing = groupMap.get(row.reconciliationGroupId);
    if (existing) {
      existing.members.push(row);
    } else {
      groupMap.set(row.reconciliationGroupId, {
        groupId: row.reconciliationGroupId,
        confidence: row.reconciliationConfidence,
        members: [row],
      });
    }
  }

  const groups = Array.from(groupMap.values());

  return <ReconciliationInbox groups={groups} />;
}
