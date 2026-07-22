import { SidebarNav } from "@/components/sidebar-nav";
import { getPendingGroupCount } from "@/lib/reconciliation/inbox-store";
// PROTOTYPE #109 (throwaway, dev-only) — re-skins the real dashboard.
import { ProtoScope } from "@/app/prototype-design/proto-scope";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pendingReconCount = await getPendingGroupCount();
  return (
    <ProtoScope>
      <div className="flex min-h-screen">
        <SidebarNav pendingReconCount={pendingReconCount} />
        <main className="mr-56 flex-1 p-8">{children}</main>
      </div>
    </ProtoScope>
  );
}
