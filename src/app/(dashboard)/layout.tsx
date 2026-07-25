import { SidebarNav } from "@/components/sidebar-nav";
import { getPendingGroupCount } from "@/lib/reconciliation/inbox-store";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pendingReconCount = await getPendingGroupCount();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <SidebarNav pendingReconCount={pendingReconCount} />
      <main className="view-wash flex-1 p-8 md:mr-56">{children}</main>
    </div>
  );
}
