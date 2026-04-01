export const dynamic = "force-dynamic";

import { DashboardPanel } from "@/components/dashboard-panel";
import { getCategories } from "@/lib/categories";

export default async function DashboardPage() {
  const categories = await getCategories();
  return <DashboardPanel categories={categories} />;
}
