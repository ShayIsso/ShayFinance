"use client";

/**
 * THROWAWAY — dashboard widget-inventory prototype (#108). Floating variant
 * switcher for the `/dashboard-proto` gate. Not for production: gated on
 * NODE_ENV so a stray merge can't ship the bar to users.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({ variants }: { variants: { key: string; name: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("variant") ?? variants[0].key;
  const idx = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const go = React.useCallback(
    (nextIdx: number) => {
      const wrapped = (nextIdx + variants.length) % variants.length;
      router.replace(`?variant=${variants[wrapped].key}`);
    },
    [router, variants],
  );

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") go(idx + 1);
      if (e.key === "ArrowRight") go(idx - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, idx]);

  if (process.env.NODE_ENV === "production") return null;

  const active = variants[idx];

  return (
    <div
      dir="ltr"
      className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1.5 text-white shadow-xl"
    >
      <button
        onClick={() => go(idx - 1)}
        className="rounded-full p-1.5 hover:bg-slate-700"
        aria-label="previous variant"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-56 text-center text-sm font-medium select-none">
        {active.key} — {active.name}
      </span>
      <button
        onClick={() => go(idx + 1)}
        className="rounded-full p-1.5 hover:bg-slate-700"
        aria-label="next variant"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
