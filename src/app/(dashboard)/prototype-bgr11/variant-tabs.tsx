"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// PROTOTYPE ONLY (BGR11 #168). Flip between the three דוחות layout variants.

const TABS = [
  { href: "/prototype-bgr11", label: "סקירה" },
  { href: "/prototype-bgr11/a", label: "A · הד לוח בקרה" },
  { href: "/prototype-bgr11/b", label: "B · טבלת השוואה" },
  { href: "/prototype-bgr11/c", label: "C · אזור ייעודי" },
];

export function VariantTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex flex-wrap gap-2 border-b pb-3">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
