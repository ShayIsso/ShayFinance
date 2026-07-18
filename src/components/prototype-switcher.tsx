"use client";

/**
 * PROTOTYPE — throwaway (BGR3, #160). Floating variant switcher; never ships —
 * gated out of production builds and lives only on the prototype branch.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ChevronLeft } from "lucide-react";

export function PrototypeSwitcher({ variants }: { variants: { key: string; label: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("variant") ?? variants[0].key;
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const go = React.useCallback(
    (delta: number) => {
      const next = variants[(index + delta + variants.length) % variants.length];
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", next.key);
      router.replace(`?${params.toString()}`);
    },
    [index, variants, router, searchParams],
  );

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") go(1);
      if (e.key === "ArrowRight") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
      <button type="button" onClick={() => go(-1)} aria-label="הקודם" className="p-0.5">
        <ChevronRight className="size-4" />
      </button>
      <span className="min-w-40 text-center tabular-nums">
        {variants[index].key} — {variants[index].label}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="הבא" className="p-0.5">
        <ChevronLeft className="size-4" />
      </button>
    </div>
  );
}
