import { SidebarNav } from "@/components/sidebar-nav";
import { getPendingGroupCount } from "@/lib/reconciliation/inbox-store";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pendingReconCount = await getPendingGroupCount();
  return (
    <div className="flex min-h-screen">
      <SidebarNav pendingReconCount={pendingReconCount} />
      <main className="mr-56 flex-1 p-8">{children}</main>
    </div>
  );
}
