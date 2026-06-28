import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared empty state (Phase 2 F3).
 *
 * Renders a muted Lucide icon (1.5px stroke), a Hebrew heading, a Hebrew
 * explainer, and an optional primary CTA in the emerald accent. Use on any
 * data-driven surface that can render with zero rows.
 *
 * Provide a CTA either as an internal link (`cta.href`) or a click handler
 * (`cta.onClick`) — not both.
 */
export type EmptyStateCta = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export function EmptyState({
  icon: Icon,
  heading,
  explainer,
  cta,
  className,
}: {
  icon: LucideIcon;
  heading: string;
  explainer?: string;
  cta?: EmptyStateCta;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}
    >
      <Icon className="text-muted-foreground/60 mb-4 h-10 w-10" strokeWidth={1.5} />
      <p className="text-foreground text-base font-medium">{heading}</p>
      {explainer && <p className="text-muted-foreground mt-1.5 max-w-sm text-sm">{explainer}</p>}
      {cta &&
        (cta.href ? (
          <Link
            href={cta.href}
            className={cn(
              buttonVariants({ size: "sm" }),
              "mt-4 bg-emerald-600 hover:bg-emerald-700",
            )}
          >
            {cta.label}
          </Link>
        ) : (
          <Button
            size="sm"
            className="mt-4 bg-emerald-600 hover:bg-emerald-700"
            onClick={cta.onClick}
          >
            {cta.label}
          </Button>
        ))}
    </div>
  );
}
