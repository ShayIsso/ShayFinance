"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, List, RefreshCw, Settings, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
};

const baseNavItems: Omit<NavItem, "badge">[] = [
  { href: "/", label: "לוח בקרה", icon: LayoutDashboard },
  { href: "/transactions", label: "תנועות", icon: List },
  { href: "/reconciliation", label: "התאמות", icon: Inbox },
  { href: "/sync", label: "סנכרון", icon: RefreshCw },
  { href: "/settings", label: "הגדרות", icon: Settings },
];

export function SidebarNav({ pendingReconCount = 0 }: { pendingReconCount?: number }) {
  const pathname = usePathname();

  const navItems: NavItem[] = baseNavItems.map((item) => ({
    ...item,
    badge: item.href === "/reconciliation" && pendingReconCount > 0 ? pendingReconCount : undefined,
  }));

  return (
    <aside className="bg-card fixed top-0 right-0 z-10 flex h-full w-56 flex-col border-l">
      <div className="border-b p-6">
        <h1 className="text-lg font-bold tracking-tight">ShayFinance</h1>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-xs font-semibold text-white tabular-nums">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
