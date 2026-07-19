// PROTOTYPE ONLY (BGR11 #168 stage-1 gate). Hardcoded Hebrew sample data for the
// דוחות monthly-report treatment. Not the real reports module — deleted before the
// implementation PR.

export type SampleLeaf = {
  id: string;
  name: string;
  color: string;
  amount: number;
  /** Same-month-last-year spend. null = last year's month has no data (honest "—"). */
  lastYear: number | null;
};

export type SampleNode = SampleLeaf & { children: SampleLeaf[] };

export type SampleTotals = {
  income: number;
  expenses: number;
  netSavings: number;
  savingsRate: number;
  investment: number;
  // Same-month-last-year values; null when last year's month has no data.
  incomeLY: number | null;
  expensesLY: number | null;
  netSavingsLY: number | null;
  savingsRateLY: number | null;
  investmentLY: number | null;
};

export type SampleReport = {
  key: string;
  label: string; // Hebrew month label, e.g. "יוני 2026"
  totals: SampleTotals;
  breakdown: SampleNode[];
};

// Category colors mirror the seeded palette style (distinct, calm).
const C = {
  food: "#f59e0b",
  grocery: "#fbbf24",
  restaurant: "#f97316",
  home: "#3b82f6",
  rent: "#60a5fa",
  bills: "#38bdf8",
  subs: "#818cf8",
  leisure: "#ec4899",
  fun: "#f472b6",
  shopping: "#a78bfa",
  gifts: "#c084fc",
  transport: "#14b8a6",
  health: "#10b981",
  cash: "#6b7280",
};

function node(
  id: string,
  name: string,
  color: string,
  lastYear: number | null,
  children: SampleLeaf[],
): SampleNode {
  const amount = children.reduce((s, c) => s + c.amount, 0);
  return { id, name, color, amount, lastYear, children };
}

function leaf(
  id: string,
  name: string,
  color: string,
  amount: number,
  lastYear: number | null,
): SampleLeaf {
  return { id, name, color, amount, lastYear };
}

// A root leaf appears beside groups in the breakdown (ADR-0011 §4), so it is a
// top-level node with no children.
function rootLeaf(
  id: string,
  name: string,
  color: string,
  amount: number,
  lastYear: number | null,
): SampleNode {
  return { id, name, color, amount, lastYear, children: [] };
}

// יוני 2026 — a full month with same-month-last-year (יוני 2025) data.
const june2026: SampleReport = {
  key: "2026-06",
  label: "יוני 2026",
  totals: {
    income: 24800,
    expenses: 17420,
    netSavings: 7380,
    savingsRate: 29.8,
    investment: 3000,
    incomeLY: 22600,
    expensesLY: 16850,
    netSavingsLY: 5750,
    savingsRateLY: 25.4,
    investmentLY: 2000,
  },
  breakdown: [
    node("g-food", "אוכל", C.food, 4360, [
      leaf("l-grocery", "מזון וסופר", C.grocery, 3120, 2980),
      leaf("l-restaurant", "מסעדות וקפה", C.restaurant, 1710, 1380),
    ]),
    node("g-home", "בית וחשבונות", C.home, null, [
      leaf("l-rent", "דיור ושכירות", C.rent, 5200, 5200),
      leaf("l-bills", "חשבונות ושירותים", C.bills, 1240, 1180),
      leaf("l-subs", "מנויים", C.subs, 289, 210),
    ]),
    node("g-leisure", "פנאי וקניות", C.leisure, null, [
      leaf("l-fun", "בילויים ופנאי", C.fun, 980, 1240),
      leaf("l-shopping", "קניות וביגוד", C.shopping, 1560, 890),
      leaf("l-gifts", "מתנות ואירועים", C.gifts, 420, 650),
    ]),
    rootLeaf("l-transport", "תחבורה", C.transport, 1490, 1620),
    rootLeaf("l-health", "בריאות וטיפוח", C.health, 380, 430),
    rootLeaf("l-cash", "מזומן ומשיכות", C.cash, 600, 400),
  ],
};

// Recompute group lastYear as sum of leaf lastYear where all children have data.
function withGroupLastYear(report: SampleReport): SampleReport {
  return {
    ...report,
    breakdown: report.breakdown.map((n) => {
      if (!n.children || n.children.length === 0) return n;
      const anyMissing = n.children.some((c) => c.lastYear === null);
      const ly = anyMissing ? null : n.children.reduce((s, c) => s + (c.lastYear ?? 0), 0);
      return { ...n, lastYear: ly };
    }),
  };
}

// מאי 2026 — another full month, slightly different shape.
const may2026: SampleReport = {
  key: "2026-05",
  label: "מאי 2026",
  totals: {
    income: 23100,
    expenses: 19260,
    netSavings: 3840,
    savingsRate: 16.6,
    investment: 1500,
    incomeLY: 21900,
    expensesLY: 17400,
    netSavingsLY: 4500,
    savingsRateLY: 20.5,
    investmentLY: 1500,
  },
  breakdown: [
    node("g-food", "אוכל", C.food, null, [
      leaf("l-grocery", "מזון וסופר", C.grocery, 3480, 3010),
      leaf("l-restaurant", "מסעדות וקפה", C.restaurant, 2240, 1520),
    ]),
    node("g-home", "בית וחשבונות", C.home, null, [
      leaf("l-rent", "דיור ושכירות", C.rent, 5200, 5000),
      leaf("l-bills", "חשבונות ושירותים", C.bills, 1620, 1240),
      leaf("l-subs", "מנויים", C.subs, 289, 210),
    ]),
    node("g-leisure", "פנאי וקניות", C.leisure, null, [
      leaf("l-fun", "בילויים ופנאי", C.fun, 1340, 980),
      leaf("l-shopping", "קניות וביגוד", C.shopping, 2870, 1100),
      leaf("l-gifts", "מתנות ואירועים", C.gifts, 180, 340),
    ]),
    rootLeaf("l-transport", "תחבורה", C.transport, 1710, 1550),
    rootLeaf("l-health", "בריאות וטיפוח", C.health, 520, 480),
    rootLeaf("l-cash", "מזומן ומשיכות", C.cash, 800, 300),
  ],
};

// ינואר 2025 — an early month whose same-month-last-year (ינואר 2024) has NO data.
// Demonstrates honest "—" handling across totals and breakdown.
const jan2025: SampleReport = {
  key: "2025-01",
  label: "ינואר 2025",
  totals: {
    income: 21500,
    expenses: 15900,
    netSavings: 5600,
    savingsRate: 26.0,
    investment: 1000,
    incomeLY: null,
    expensesLY: null,
    netSavingsLY: null,
    savingsRateLY: null,
    investmentLY: null,
  },
  breakdown: [
    node("g-food", "אוכל", C.food, null, [
      leaf("l-grocery", "מזון וסופר", C.grocery, 2890, null),
      leaf("l-restaurant", "מסעדות וקפה", C.restaurant, 1240, null),
    ]),
    node("g-home", "בית וחשבונות", C.home, null, [
      leaf("l-rent", "דיור ושכירות", C.rent, 5000, null),
      leaf("l-bills", "חשבונות ושירותים", C.bills, 1180, null),
      leaf("l-subs", "מנויים", C.subs, 210, null),
    ]),
    node("g-leisure", "פנאי וקניות", C.leisure, null, [
      leaf("l-fun", "בילויים ופנאי", C.fun, 760, null),
      leaf("l-shopping", "קניות וביגוד", C.shopping, 920, null),
      leaf("l-gifts", "מתנות ואירועים", C.gifts, 300, null),
    ]),
    rootLeaf("l-transport", "תחבורה", C.transport, 1380, null),
    rootLeaf("l-health", "בריאות וטיפוח", C.health, 220, null),
    rootLeaf("l-cash", "מזומן ומשיכות", C.cash, 400, null),
  ],
};

export const SAMPLE_REPORTS: SampleReport[] = [
  withGroupLastYear(june2026),
  withGroupLastYear(may2026),
  withGroupLastYear(jan2025),
];

// ── shared client formatting helpers (client-only per hydration rule) ──────────

export function formatILS(amount: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export type Delta = {
  /** signed percent change vs last year, or null when last year has no data */
  pct: number | null;
  direction: "up" | "down" | "flat" | "none";
};

export function computeDelta(current: number, lastYear: number | null): Delta {
  if (lastYear === null) return { pct: null, direction: "none" };
  if (lastYear === 0) return { pct: null, direction: current === 0 ? "flat" : "up" };
  const pct = ((current - lastYear) / Math.abs(lastYear)) * 100;
  const direction = Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
  return { pct, direction };
}

export function formatDeltaPct(delta: Delta): string {
  if (delta.pct === null) return "—";
  const sign = delta.pct > 0 ? "+" : "";
  return `${sign}${Math.round(delta.pct)}%`;
}
