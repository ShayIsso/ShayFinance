"use client";

/**
 * PROTOTYPE-ONLY floating switcher (BGR3 convention, #160) — reused here for
 * BGR9 (#166). Cycles a `?<paramName>=` search param across `options` via
 * arrow buttons and, when `keyboard` is set, the ← / → keys. Never merges to
 * phase-3: it exists only to let variants be flipped through live in the
 * browser during the owner reaction pass.
 */

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type PrototypeSwitcherOption = { key: string; label: string };

export function PrototypeSwitcher({
  paramName,
  options,
  keyboard = false,
  className,
}: {
  paramName: string;
  options: PrototypeSwitcherOption[];
  keyboard?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(paramName) ?? options[0].key;
  const index = Math.max(
    0,
    options.findIndex((o) => o.key === current),
  );

  const go = React.useCallback(
    (nextIndex: number) => {
      const wrapped = (nextIndex + options.length) % options.length;
      const params = new URLSearchParams(searchParams.toString());
      params.set(paramName, options[wrapped].key);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [options, paramName, pathname, router, searchParams],
  );

  React.useEffect(() => {
    if (!keyboard) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (target?.isContentEditable) return;
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [go, index, keyboard]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className={`fixed inset-x-0 ${className ?? "bottom-4"} z-50 flex justify-center`}>
      <div className="flex items-center gap-3 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
        <button
          onClick={() => go(index - 1)}
          aria-label="הקודם"
          className="hover:text-emerald-300"
        >
          <ChevronRight className="size-4" />
        </button>
        <span className="min-w-44 text-center font-medium">
          {options[index].key} — {options[index].label}
        </span>
        <button onClick={() => go(index + 1)} aria-label="הבא" className="hover:text-emerald-300">
          <ChevronLeft className="size-4" />
        </button>
      </div>
    </div>
  );
}
