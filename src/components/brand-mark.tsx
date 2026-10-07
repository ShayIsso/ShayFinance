import { cn } from "@/lib/utils";

/**
 * The Yitra cut-Y, drawn inline so it follows the `--brand` token across themes.
 * Geometry is `brand/yitra-icon.svg`; the house rules in `brand/brand.md` (never
 * taper, round, outline, or add a second colour) apply. Decorative: it always
 * sits beside the visible name.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="2.1 0.1 79.8 99.9"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <g
        stroke="var(--brand)"
        strokeWidth="28"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        fill="none"
      >
        <path d="M12 10 L50 48 L50 100" />
        <path d="M50 48 L72 26" />
      </g>
    </svg>
  );
}
