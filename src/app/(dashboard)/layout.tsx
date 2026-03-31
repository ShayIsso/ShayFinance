import { SidebarNav } from "@/components/sidebar-nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SidebarNav />
      <main className="mr-56 flex-1 p-8">{children}</main>
    </div>
  );
}
