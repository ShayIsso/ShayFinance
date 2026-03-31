"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, List, RefreshCw, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "לוח בקרה", icon: LayoutDashboard },
  { href: "/transactions", label: "תנועות", icon: List },
  { href: "/sync", label: "סנכרון", icon: RefreshCw },
  { href: "/settings", label: "הגדרות", icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();

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
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
