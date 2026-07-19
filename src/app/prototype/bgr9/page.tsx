"use client";

/**
 * PROTOTYPE — throwaway sandbox for BGR9 (#166) dashboard budget widgets.
 * Three layout variants (?variant=A|B|C) crossed with four canned scenarios
 * (?scenario=), all hardcoded — no DB, no module import. Never merges to
 * phase-3: frozen on prototype/bgr9-budget-widgets after the reaction pass.
 */

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { VariantA, VariantB, VariantC } from "./variants";
import { SCENARIOS, type ScenarioKey } from "./mock-data";

const VARIANT_OPTIONS = [
  { key: "A", label: "רשימה מלאה" },
  { key: "B", label: "באנר + רשת שבבים" },
  { key: "C", label: "סיכום מתקפל" },
];

const SCENARIO_OPTIONS = [
  { key: "populated", label: "4 תקציבים + שני יעדים" },
  { key: "targetsOnly", label: "יעדים בלי תקציבים" },
  { key: "monthClosed", label: "סוף חודש · יעד חיסכון הושג" },
  { key: "empty", label: "ריק לגמרי" },
];

function PrototypeBody() {
  const searchParams = useSearchParams();
  const variant = searchParams.get("variant") ?? "A";
  const scenario = (searchParams.get("scenario") ?? "populated") as ScenarioKey;
  const data = SCENARIOS[scenario];

  return (
    <div dir="rtl" className="mx-auto max-w-md space-y-4 p-6 pb-40">
      <div>
        <h1 className="text-lg font-semibold">BGR9 — ווידג&apos;ט תקציבים בדשבורד</h1>
        <p className="text-muted-foreground text-sm">
          וריאנט {variant} · תרחיש: {SCENARIOS[scenario] ? scenario : "?"}
        </p>
      </div>
      {variant === "A" && <VariantA data={data} />}
      {variant === "B" && <VariantB data={data} />}
      {variant === "C" && <VariantC data={data} />}
      <PrototypeSwitcher paramName="variant" options={VARIANT_OPTIONS} keyboard className="bottom-4" />
      <PrototypeSwitcher paramName="scenario" options={SCENARIO_OPTIONS} className="bottom-16" />
    </div>
  );
}

export default function PrototypeBgr9Page() {
  return (
    <React.Suspense fallback={null}>
      <PrototypeBody />
    </React.Suspense>
  );
}
