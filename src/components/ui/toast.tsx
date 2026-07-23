"use client";

import * as React from "react";
import { Check, AlertTriangle, X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Motion is defined locally (200ms in / 150ms out, per spec #194 §G) rather
// than via the shared .fade-in utility, which is single-duration (150ms) and
// owned by a parallel Band A slice — depending on it here would couple this
// component's landing order to that slice's.
const TOAST_EXIT_DURATION_MS = 150; // must match the "duration-150" exit class below
const TOAST_DEFAULT_DURATION_MS = 4000;

const toastVariants = cva(
  "flex items-start gap-2.5 rounded-xl p-3 text-sm ring-1 ring-foreground/10 transition-all ease-out",
  {
    variants: {
      variant: {
        success: "bg-emerald/10 dark:bg-emerald/15",
        error: "bg-destructive/10 dark:bg-destructive/20",
      },
    },
    defaultVariants: {
      variant: "success",
    },
  },
);

const toastIconVariants = cva("mt-0.5 h-4 w-4 shrink-0", {
  variants: {
    variant: {
      success: "text-emerald",
      error: "text-destructive",
    },
  },
  defaultVariants: {
    variant: "success",
  },
});

const TOAST_ICON = {
  success: Check,
  error: AlertTriangle,
} as const;

interface ToastProps extends VariantProps<typeof toastVariants> {
  children: React.ReactNode;
  /** Called once the exit transition finishes — stop rendering the toast here. */
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. Pass 0 to disable. @default 4000 */
  duration?: number;
  className?: string;
}

function Toast({
  variant = "success",
  children,
  onDismiss,
  duration = TOAST_DEFAULT_DURATION_MS,
  className,
}: ToastProps) {
  const [visible, setVisible] = React.useState(false);
  const dismissedRef = React.useRef(false);
  // Read through a ref so the mount-only effect below never has to depend on
  // (and restart its timer because of) the caller's onDismiss identity —
  // sync-panel re-renders on every SSE event while a toast is showing.
  const onDismissRef = React.useRef(onDismiss);
  React.useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  const close = React.useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setVisible(false);
    window.setTimeout(() => onDismissRef.current(), TOAST_EXIT_DURATION_MS);
  }, []);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    if (duration <= 0) {
      return () => cancelAnimationFrame(raf);
    }
    const timer = window.setTimeout(close, duration);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [close, duration]);

  const Icon = TOAST_ICON[variant ?? "success"];

  return (
    <div
      data-slot="toast"
      data-variant={variant}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={cn(
        toastVariants({ variant }),
        // Literal class names — Tailwind's static scanner can't see classes
        // built from interpolated durations, so the two states are spelled
        // out in full (duration-200 in / duration-150 out) rather than
        // templated from the ms constants above.
        visible
          ? "translate-y-0 opacity-100 duration-200"
          : "-translate-y-1 opacity-0 duration-150",
        className,
      )}
    >
      <Icon data-slot="toast-icon" className={toastIconVariants({ variant })} />
      <div data-slot="toast-content" className="min-w-0 flex-1 space-y-0.5">
        {children}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="סגור"
        className="text-muted-foreground hover:text-foreground -m-1 shrink-0 rounded-md p-1 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export { Toast };
export type { ToastProps };
