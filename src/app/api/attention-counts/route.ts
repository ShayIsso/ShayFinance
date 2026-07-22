import { NextResponse } from "next/server";
import { getUncategorizedTransactionCount } from "@/lib/transactions";
import { createReviewStore } from "@/lib/ai-categorization";
import { countPendingAnomalies } from "@/lib/recurring-detection";
import { getPendingGroupCount } from "@/lib/reconciliation/inbox-store";

// Four independent scalars for the dashboard's attention feeder (#196) — the
// widget that renders them (C3) fetches this route rather than re-fetching
// full row lists or opening each source page. No input, so no Zod boundary.
export async function GET() {
  const [uncategorized, needsReview, anomalies, reviewQueue] = await Promise.all([
    getUncategorizedTransactionCount(),
    createReviewStore().getPendingSuggestionCount(),
    countPendingAnomalies(),
    getPendingGroupCount(),
  ]);

  return NextResponse.json({ uncategorized, needsReview, anomalies, reviewQueue });
}
