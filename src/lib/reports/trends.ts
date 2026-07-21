/**
 * Pure trends-report aggregation core (BGR13 #170). No DB imports: like
 * `monthly.ts`, it composes the analytics module's pure functions —
 * {@link computeMonthlySummary}, {@link computeSpendingByCategory},
 * {@link rollUpSpendingByGroup} — over per-month rows a caller
 * (`reports/index.ts`) hands in, so the lens rules (transfer/ignore excluded,
 * investment tracked separately, group total = sum of leaves) all come from
 * analytics unchanged and never diverge from the monthly report or the
 * Dashboard.
 *
 * Direction over time (decision record #107): income / expenses / net savings
 * as a per-calendar-month series over a configurable range, with per-group and
 * per-leaf spend series for drill-down ("how is אוכל trending"), and annual
 * totals folded in as year rows — not a sibling report.
 */
import {
  computeMonthlySummary,
  computeSpendingByCategory,
  rollUpSpendingByGroup,
  type TransactionWithCategory,
  type RollupCategory,
  type CategorySpendingNode,
} from "@/lib/analytics";

/** One calendar month's rows — the unit the range read buckets transactions into. */
export type TrendsMonthInput = {
  year: number;
  month: number;
  transactions: TransactionWithCategory[];
};

/** A single month's headline metrics, lens-correct (matches the monthly report). */
export type TrendsMonthPoint = {
  year: number;
  month: number;
  /** True when the month had at least one transaction of any type. */
  hasData: boolean;
  income: number;
  expenses: number;
  netSavings: number;
  savingsRate: number;
  investment: number;
};

/** A category's expense spend across the range, one amount per month in `months`. */
export type TrendsCategorySeries = {
  categoryId: string;
  categoryName: string;
  color: string;
  icon: string;
  /** Aligned to `TrendsReport.months` (same order and length); zero where the category had no spend. */
  amounts: number[];
  /** Sum over the whole range. */
  total: number;
};

/** A top-level breakdown series — a group with its leaves' series, or a root leaf with none. */
export type TrendsGroupSeries = TrendsCategorySeries & {
  children: TrendsCategorySeries[];
};

/** Annual totals folded into the trends view (decision record #107 — not a sibling report). */
export type TrendsYearRow = {
  year: number;
  /** How many of this year's months fall in the range (a range edge can make it a partial year). */
  monthCount: number;
  income: number;
  expenses: number;
  netSavings: number;
  savingsRate: number;
  investment: number;
};

export type TrendsReport = {
  /** At least one month in the range has any transaction. */
  hasData: boolean;
  /** Chronological (oldest → newest). */
  months: TrendsMonthPoint[];
  /** Group-first spend series, sorted by range total descending; root leaves alongside. */
  breakdown: TrendsGroupSeries[];
  /** Per-year totals, newest year first. */
  years: TrendsYearRow[];
};

/**
 * The chronological list of calendar months ending at `today`'s month and
 * reaching back `rangeMonths` months (inclusive of both ends). Pure integer
 * month-index arithmetic — no `Date` — so it is deterministic across
 * timezones and wraps year boundaries cleanly.
 */
export function enumerateMonthRange(
  today: string,
  rangeMonths: number,
): { year: number; month: number }[] {
  const [year, month] = today.split("-").map(Number);
  const endIndex = year * 12 + (month - 1);
  const out: { year: number; month: number }[] = [];
  for (let i = rangeMonths - 1; i >= 0; i--) {
    const idx = endIndex - i;
    out.push({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  }
  return out;
}

function savingsRateOf(income: number, netSavings: number): number {
  return income > 0 ? (netSavings / income) * 100 : 0;
}

function buildBreakdownSeries(
  monthNodes: CategorySpendingNode[][],
  monthCount: number,
): TrendsGroupSeries[] {
  type Accum = {
    categoryId: string;
    categoryName: string;
    color: string;
    icon: string;
    amounts: number[];
    children: Map<string, Omit<TrendsCategorySeries, "total">>;
  };
  const groups = new Map<string, Accum>();

  const zeros = () => new Array<number>(monthCount).fill(0);

  monthNodes.forEach((nodes, i) => {
    for (const node of nodes) {
      let g = groups.get(node.categoryId);
      if (!g) {
        g = {
          categoryId: node.categoryId,
          categoryName: node.categoryName,
          color: node.color,
          icon: node.icon,
          amounts: zeros(),
          children: new Map(),
        };
        groups.set(node.categoryId, g);
      }
      // A group appears once per month in the roll-up, so this is an assignment,
      // not an accumulation across duplicates — `+=` only guards a defensive re-entry.
      g.amounts[i] += node.amount;
      for (const child of node.children) {
        let c = g.children.get(child.categoryId);
        if (!c) {
          c = {
            categoryId: child.categoryId,
            categoryName: child.categoryName,
            color: child.color,
            icon: child.icon,
            amounts: zeros(),
          };
          g.children.set(child.categoryId, c);
        }
        c.amounts[i] += child.amount;
      }
    }
  });

  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

  return Array.from(groups.values())
    .map((g) => ({
      categoryId: g.categoryId,
      categoryName: g.categoryName,
      color: g.color,
      icon: g.icon,
      amounts: g.amounts,
      total: sum(g.amounts),
      children: Array.from(g.children.values())
        .map((c) => ({ ...c, total: sum(c.amounts) }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);
}

function buildYearRows(points: TrendsMonthPoint[]): TrendsYearRow[] {
  const byYear = new Map<number, TrendsYearRow>();
  for (const p of points) {
    const row = byYear.get(p.year) ?? {
      year: p.year,
      monthCount: 0,
      income: 0,
      expenses: 0,
      netSavings: 0,
      savingsRate: 0,
      investment: 0,
    };
    row.monthCount += 1;
    row.income += p.income;
    row.expenses += p.expenses;
    row.netSavings += p.netSavings;
    row.investment += p.investment;
    byYear.set(p.year, row);
  }
  return Array.from(byYear.values())
    .map((r) => ({ ...r, savingsRate: savingsRateOf(r.income, r.netSavings) }))
    .sort((a, b) => b.year - a.year);
}

/**
 * Builds the trends report from the range's per-month rows (empty months
 * included — they become zero-valued points so the series stays continuous
 * across range edges) and the shared category roll-up structure.
 */
export function buildTrendsReport(
  months: TrendsMonthInput[],
  categories: RollupCategory[],
): TrendsReport {
  const points: TrendsMonthPoint[] = months.map((m) => {
    const s = computeMonthlySummary(m.transactions);
    return {
      year: m.year,
      month: m.month,
      hasData: m.transactions.length > 0,
      income: s.income,
      expenses: s.expenses,
      netSavings: s.netSavings,
      savingsRate: s.savingsRate,
      investment: s.investmentTotal,
    };
  });

  const hasData = points.some((p) => p.hasData);
  if (!hasData) {
    return { hasData: false, months: points, breakdown: [], years: [] };
  }

  const monthNodes = months.map((m) =>
    rollUpSpendingByGroup(computeSpendingByCategory(m.transactions), categories),
  );

  return {
    hasData: true,
    months: points,
    breakdown: buildBreakdownSeries(monthNodes, months.length),
    years: buildYearRows(points),
  };
}
