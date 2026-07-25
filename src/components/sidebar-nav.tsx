"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  List,
  RefreshCw,
  Settings,
  Inbox,
  Repeat,
  FileBarChart,
  Menu,
  X,
} from "lucide-react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
};

const baseNavItems: Omit<NavItem, "badge">[] = [
  { href: "/", label: "לוח בקרה", icon: LayoutDashboard },
  { href: "/transactions", label: "תנועות", icon: List },
  { href: "/reports", label: "דוחות", icon: FileBarChart },
  { href: "/reconciliation", label: "התאמות", icon: Inbox },
  { href: "/subscriptions", label: "מנויים", icon: Repeat },
  { href: "/sync", label: "סנכרון", icon: RefreshCw },
  { href: "/settings", label: "הגדרות", icon: Settings },
];

function NavLinks({
  navItems,
  pathname,
  onNavigate,
}: {
  navItems: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 p-3">
      {navItems.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
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
              <span className="bg-warning text-warning-foreground flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function SidebarNav({ pendingReconCount = 0 }: { pendingReconCount?: number }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Client-side navigation doesn't unmount the drawer, so close it explicitly
  // whenever the route changes (link tap, back/forward, or any other trigger).
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing drawer visibility to the router's pathname (an external signal), not derived render state
    setDrawerOpen(false);
  }, [pathname]);

  const navItems: NavItem[] = baseNavItems.map((item) => ({
    ...item,
    badge: item.href === "/reconciliation" && pendingReconCount > 0 ? pendingReconCount : undefined,
  }));

  return (
    <DrawerPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen} swipeDirection="right">
      <header className="bg-card sticky top-0 z-20 flex items-center justify-between border-b p-4 md:hidden">
        <h1 className="text-lg font-bold tracking-tight">ShayFinance</h1>
        <DrawerPrimitive.Trigger
          data-slot="sidebar-drawer-trigger"
          render={<Button variant="ghost" size="icon" aria-label="פתיחת תפריט ניווט" />}
        >
          <Menu className="h-5 w-5" />
        </DrawerPrimitive.Trigger>
      </header>

      <aside className="bg-card fixed top-0 right-0 z-10 hidden h-full w-56 flex-col border-l md:flex">
        <div className="border-b p-6">
          <h1 className="text-lg font-bold tracking-tight">ShayFinance</h1>
        </div>
        <NavLinks navItems={navItems} pathname={pathname} />
        <div className="border-t p-3">
          <ThemeToggle className="w-full" />
        </div>
      </aside>

      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Backdrop
          data-slot="sidebar-drawer-overlay"
          className={cn(
            "fixed inset-0 z-30 bg-black/30",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            "motion-reduce:animate-none",
          )}
        />
        <DrawerPrimitive.Popup
          data-slot="sidebar-drawer-content"
          className={cn(
            "bg-card fixed inset-y-0 right-0 z-40 flex h-full w-56 max-w-[85vw] flex-col border-l outline-none",
            "data-open:animate-in data-open:slide-in-from-right data-open:fade-in-0",
            "data-closed:animate-out data-closed:slide-out-to-right data-closed:fade-out-0",
            "motion-reduce:animate-none",
          )}
        >
          <div className="flex items-center justify-between border-b p-6">
            <h1 className="text-lg font-bold tracking-tight">ShayFinance</h1>
            <DrawerPrimitive.Close
              data-slot="sidebar-drawer-close"
              render={<Button variant="ghost" size="icon-sm" aria-label="סגירת תפריט ניווט" />}
            >
              <X className="h-4 w-4" />
            </DrawerPrimitive.Close>
          </div>
          <NavLinks
            navItems={navItems}
            pathname={pathname}
            onNavigate={() => setDrawerOpen(false)}
          />
          <div className="border-t p-3">
            <ThemeToggle className="w-full" />
          </div>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
