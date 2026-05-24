export const dynamic = "force-dynamic";

import { DashboardPanel } from "@/components/dashboard-panel";
import { getCategories } from "@/lib/categories";
import { getPendingGroupCount } from "@/lib/reconciliation/inbox-store";

export default async function DashboardPage() {
  const [categories, pendingReconCount] = await Promise.all([
    getCategories(),
    getPendingGroupCount(),
  ]);
  return <DashboardPanel categories={categories} pendingReconCount={pendingReconCount} />;
}
