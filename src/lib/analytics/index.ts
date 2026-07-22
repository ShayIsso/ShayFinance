import { db } from "@/db";
import { transactions, categories, bankAccounts, bankCredentials } from "@/db/schema";
import { eq, and, gte, lte, gt, inArray, desc } from "drizzle-orm";
import { monthDateRange } from "./month-window";
import {
  extractMerchant,
  canonicalizeMerchant,
  matchesTransferDescriptor,
} from "@/lib/transaction-matching";

export { monthDateRange } from "./month-window";

export type AnalyticsTransaction = {
  chargedAmount: number;
  categoryType: "income" | "expense" | "investment" | "transfer" | "ignore" | null;
};

export type TransactionWithCategory = AnalyticsTransaction & {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
};

export type MonthlySummary = {
  income: number;
  expenses: number;
  netSavings: number;
  savingsRate: number;
  investmentTotal: number;
};

export type CategorySpending = {
  categoryId: string;
  categoryName: string;
  amount: number;
  color: string;
  icon: string;
};

/**
 * A top-level entry in the group-first spending breakdown (ADR-0011 §4, the
 * aggregation lens). Either a group — `children` holds its leaves' spending for
 * drill-down and `amount` is defined as their sum — or a root leaf, where
 * `children` is empty and `amount` is the leaf's own spend. The lens never
 * changes a total: the sum of every node's `amount` equals the sum of the flat
 * leaf breakdown it was rolled up from.
 */
export type CategorySpendingNode = CategorySpending & {
  children: CategorySpending[];
};

/** Minimal category metadata the roll-up reads for structure and group display. */
export type RollupCategory = {
  id: string;
  name: string;
  color: string;
  icon: string;
  parentId: string | null;
};

export type AccountBalance = {
  id: string;
  accountNumber: string;
  balance: number | null;
  bankType: "discount" | "max" | "visaCal";
  displayName: string;
  /**
   * Only set for card accounts (max/visaCal): the window date carrying the
   * largest absolute next-debit charge. Null when there is no upcoming debit
   * to estimate. Always null/absent for Discount (scraper-truth balance).
   */
  nextDebitDate?: string | null;
};

/** Input row for {@link computeNextDebitEstimate} — status is deliberately not part of this shape. */
export type NextDebitTransaction = {
  /** YYYY-MM-DD, as returned by Drizzle for a `date` column. */
  processedDate: string;
  chargedAmount: number;
};

export type NextDebitEstimate = {
  estimate: number;
  nextDebitDate: string | null;
};

export type RecentTransaction = {
  id: string;
  date: string;
  description: string;
  customDescription: string | null;
  chargedAmount: number;
  chargedCurrency: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryType: "income" | "expense" | "investment" | "transfer" | "ignore" | null;
  categoryColor: string | null;
};

// ---------------------------------------------------------------------------
// Pure computation functions
// ---------------------------------------------------------------------------

export function computeMonthlySummary(transactions: AnalyticsTransaction[]): MonthlySummary {
  const income = transactions
    .filter((t) => t.categoryType === "income")
    .reduce((sum, t) => sum + t.chargedAmount, 0);

  const expenses = transactions
    .filter((t) => t.categoryType === "expense")
    .reduce((sum, t) => sum + Math.abs(t.chargedAmount), 0);

  const investmentTotal = transactions
    .filter((t) => t.categoryType === "investment")
    .reduce((sum, t) => sum + Math.abs(t.chargedAmount), 0);

  const netSavings = income - expenses;
  const savingsRate = income > 0 ? (netSavings / income) * 100 : 0;

  return {
    income,
    expenses,
    netSavings,
    savingsRate,
    investmentTotal,
  };
}

export function computeSpendingByCategory(
  transactions: TransactionWithCategory[],
): CategorySpending[] {
  const map = new Map<string, CategorySpending>();

  for (const t of transactions) {
    if (t.categoryType !== "expense" || !t.categoryId) continue;
    const existing = map.get(t.categoryId);
    if (existing) {
      existing.amount += Math.abs(t.chargedAmount);
    } else {
      map.set(t.categoryId, {
        categoryId: t.categoryId,
        categoryName: t.categoryName,
        amount: Math.abs(t.chargedAmount),
        color: t.categoryColor,
        icon: t.categoryIcon,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

export type MerchantTransaction = {
  description: string;
  chargedAmount: number;
  categoryType: AnalyticsTransaction["categoryType"];
};

export type TopMerchant = {
  merchant: string;
  amount: number;
};

const DEFAULT_TOP_MERCHANTS_LIMIT = 5;

/**
 * Ranks the month's real spending merchants, top-N descending by total spend.
 * Expense-only (income/investment/transfer/ignore/uncategorized rows never
 * rank), grouped by canonicalized merchant (transaction-matching's
 * `extractMerchant` + `canonicalizeMerchant`, so brand variants like
 * "רכישה בנטפליקס" and "NETFLIX.COM" collapse into one entry).
 *
 * The `card_settlement` transfer-descriptor (מקס/כ.א.ל bill lump, CONTEXT.md
 * "The Paradox") is excluded by description shape in addition to the
 * expense-only filter — a settlement lump that hasn't yet been reconciled to
 * `transfer` must still never masquerade as a top merchant.
 */
export function computeTopMerchants(
  transactions: MerchantTransaction[],
  limit: number = DEFAULT_TOP_MERCHANTS_LIMIT,
): TopMerchant[] {
  const totals = new Map<string, number>();

  for (const t of transactions) {
    if (t.categoryType !== "expense") continue;
    if (matchesTransferDescriptor(t.description, ["card_settlement"])) continue;

    const merchant = canonicalizeMerchant(extractMerchant(t.description));
    if (!merchant) continue;

    totals.set(merchant, (totals.get(merchant) ?? 0) + Math.abs(t.chargedAmount));
  }

  return Array.from(totals.entries())
    .map(([merchant, amount]) => ({ merchant, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/**
 * Rolls the flat leaf breakdown up into a group-first view (ADR-0011 §4). Every
 * leaf in `spending` lands under its group (when its `parentId` names a known
 * group) or stays at the top level as a root leaf, so the rolled-up total is
 * byte-identical to the flat one — grouping is a lens, never a re-computation.
 * A group appears only when at least one of its leaves has spending; its amount
 * is the sum of those leaves. Top level and each group's children are sorted by
 * amount, descending.
 */
export function rollUpSpendingByGroup(
  spending: CategorySpending[],
  categories: RollupCategory[],
): CategorySpendingNode[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const groups = new Map<string, { meta: RollupCategory; children: CategorySpending[] }>();
  const rootLeaves: CategorySpending[] = [];

  for (const leaf of spending) {
    const category = categoryById.get(leaf.categoryId);
    const parent = category?.parentId != null ? categoryById.get(category.parentId) : undefined;
    if (parent) {
      const entry = groups.get(parent.id) ?? { meta: parent, children: [] };
      entry.children.push(leaf);
      groups.set(parent.id, entry);
    } else {
      rootLeaves.push(leaf);
    }
  }

  const nodes: CategorySpendingNode[] = rootLeaves.map((leaf) => ({ ...leaf, children: [] }));

  for (const { meta, children } of groups.values()) {
    const sortedChildren = [...children].sort((a, b) => b.amount - a.amount);
    nodes.push({
      categoryId: meta.id,
      categoryName: meta.name,
      amount: sortedChildren.reduce((sum, c) => sum + c.amount, 0),
      color: meta.color,
      icon: meta.icon,
      children: sortedChildren,
    });
  }

  return nodes.sort((a, b) => b.amount - a.amount);
}

const NEXT_DEBIT_WINDOW_DAYS = 31;

/**
 * Julian Day Number for a Gregorian calendar date (Fliegel & Van Flandern).
 * Pure integer arithmetic — deliberately avoids the `Date` object so date
 * math stays fully deterministic and independent of timezone/DST quirks.
 */
function toJulianDayNumber(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** Inverse of {@link toJulianDayNumber}. */
function fromJulianDayNumber(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

/** Adds `days` to a YYYY-MM-DD ISO date string, returning a YYYY-MM-DD string. */
function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const {
    year: y,
    month: m,
    day: d,
  } = fromJulianDayNumber(toJulianDayNumber(year, month, day) + days);
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Estimates the upcoming credit-card debit (החיוב הקרוב) from already-stored
 * transactions, for banks (Max/Cal) whose scraper does not reliably report
 * account balance. See issue #40 / grilling session #102 for the semantics
 * decision.
 *
 * Window: `today < processedDate <= today + 31 days` — exclusive today,
 * inclusive at +31 days. Status is intentionally ignored: the date predicate
 * alone decides. A stale past-dated pending row falls out on the date check
 * alone; a future-dated pending or completed row both count. Installments
 * need no special casing — each payment is its own row with its own
 * processedDate, so the window naturally catches only the next payment.
 *
 * The hint date is the in-window date whose *summed* chargedAmount has the
 * largest absolute value — not the date with the most transactions or the
 * earliest date — so a small off-cycle straggler can't outrank the main
 * billing cycle date. Ties fall to the earlier date (arbitrary tie-break;
 * unspecified by the issue).
 *
 * Pure function: `today` (YYYY-MM-DD) is passed in and this function never
 * calls `new Date()` — all date arithmetic is done via Julian Day Number
 * conversion, so results are fully deterministic for tests.
 */
export function computeNextDebitEstimate(
  transactions: NextDebitTransaction[],
  today: string,
): NextDebitEstimate {
  const windowEnd = addDaysToIsoDate(today, NEXT_DEBIT_WINDOW_DAYS);

  const inWindow = transactions.filter(
    (t) => t.processedDate > today && t.processedDate <= windowEnd,
  );

  if (inWindow.length === 0) {
    return { estimate: 0, nextDebitDate: null };
  }

  const estimate = inWindow.reduce((sum, t) => sum + t.chargedAmount, 0);

  const sumsByDate = new Map<string, number>();
  for (const t of inWindow) {
    sumsByDate.set(t.processedDate, (sumsByDate.get(t.processedDate) ?? 0) + t.chargedAmount);
  }

  let nextDebitDate: string | null = null;
  let largestAbsSum = -1;
  for (const date of Array.from(sumsByDate.keys()).sort()) {
    const absSum = Math.abs(sumsByDate.get(date) as number);
    if (absSum > largestAbsSum) {
      largestAbsSum = absSum;
      nextDebitDate = date;
    }
  }

  return { estimate, nextDebitDate };
}

/**
 * Coalesces one joined transaction row (the analytics month/range select shape)
 * to {@link TransactionWithCategory}. Single owner of the null defaults so the
 * month read and the reports range read can never drift — the "reports windows
 * can't diverge" invariant (issue #168 / #170) is enforced here structurally,
 * not by two hand-copied mappers agreeing by convention.
 */
export function toTransactionWithCategory(row: {
  chargedAmount: string | number;
  categoryType: AnalyticsTransaction["categoryType"];
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
}): TransactionWithCategory {
  return {
    chargedAmount: Number(row.chargedAmount),
    categoryType: row.categoryType ?? null,
    categoryId: row.categoryId ?? null,
    categoryName: row.categoryName ?? "",
    categoryColor: row.categoryColor ?? "#888888",
    categoryIcon: row.categoryIcon ?? "MoreHorizontal",
  };
}

// ---------------------------------------------------------------------------
// DB-backed wrapper functions
// ---------------------------------------------------------------------------

/**
 * The normalized month read every month-scoped analytics/report calculation
 * shares (issue #168): all transactions on `transactions.date` within the
 * calendar month, joined to category metadata and coalesced to the
 * `TransactionWithCategory` shape. Single owner of the select/join + null
 * coalescing — {@link getMonthlySummary}, {@link getSpendingByCategory}, and
 * the reports store all consume it, so their windows can never diverge.
 */
export async function getMonthTransactions(
  year: number,
  month: number,
): Promise<TransactionWithCategory[]> {
  const { from, to } = monthDateRange(year, month);

  const rows = await db
    .select({
      chargedAmount: transactions.chargedAmount,
      categoryType: categories.type,
      categoryId: categories.id,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)));

  return rows.map(toTransactionWithCategory);
}

/** The category roll-up structure (ADR-0011 shape) — single owner for group-first breakdowns. */
export async function getRollupCategories(): Promise<RollupCategory[]> {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      icon: categories.icon,
      parentId: categories.parentId,
    })
    .from(categories);
}

export async function getMonthlySummary(year: number, month: number): Promise<MonthlySummary> {
  return computeMonthlySummary(await getMonthTransactions(year, month));
}

export async function getSpendingByCategory(
  year: number,
  month: number,
): Promise<CategorySpending[]> {
  return computeSpendingByCategory(await getMonthTransactions(year, month));
}

/**
 * The month read {@link getTopMerchants} aggregates over: the raw `description`
 * alongside `chargedAmount`/category type, for the same calendar-month window
 * {@link getMonthTransactions} uses. Kept separate from that shared shape
 * because `description` is merchant-matching input, not part of the
 * type-driven totals reader's contract.
 */
export async function getMonthMerchantTransactions(
  year: number,
  month: number,
): Promise<MerchantTransaction[]> {
  const { from, to } = monthDateRange(year, month);

  const rows = await db
    .select({
      description: transactions.description,
      chargedAmount: transactions.chargedAmount,
      categoryType: categories.type,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)));

  return rows.map((r) => ({
    description: r.description,
    chargedAmount: Number(r.chargedAmount),
    categoryType: r.categoryType ?? null,
  }));
}

export async function getTopMerchants(
  year: number,
  month: number,
  limit?: number,
): Promise<TopMerchant[]> {
  return computeTopMerchants(await getMonthMerchantTransactions(year, month), limit);
}

/**
 * Group-first spending breakdown for a month (ADR-0011 §4): the same leaf
 * totals as {@link getSpendingByCategory}, rolled up under their groups with
 * root leaves alongside. Type-driven totals are untouched — this is a lens over
 * the existing expense breakdown, not a new financial computation.
 */
export async function getSpendingRollup(
  year: number,
  month: number,
): Promise<CategorySpendingNode[]> {
  const [spending, rollupCategories] = await Promise.all([
    getSpendingByCategory(year, month),
    getRollupCategories(),
  ]);

  return rollUpSpendingByGroup(spending, rollupCategories);
}

/** Bank types whose scraper doesn't reliably report account balance — display shows a derived estimate instead. */
const CARD_BANK_TYPES = new Set<AccountBalance["bankType"]>(["max", "visaCal"]);

export async function getAccountBalances(): Promise<AccountBalance[]> {
  const rows = await db
    .select({
      id: bankAccounts.id,
      accountNumber: bankAccounts.accountNumber,
      balance: bankAccounts.balance,
      bankType: bankCredentials.bankType,
      displayName: bankCredentials.displayName,
    })
    .from(bankAccounts)
    .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id));

  const cardAccountIds = rows.filter((r) => CARD_BANK_TYPES.has(r.bankType)).map((r) => r.id);

  // Computed once here, then threaded into the pure function — see
  // computeNextDebitEstimate's doc comment for why it never calls Date itself.
  const today = new Date().toISOString().slice(0, 10);

  const txByAccount = new Map<string, NextDebitTransaction[]>();
  if (cardAccountIds.length > 0) {
    const txRows = await db
      .select({
        bankAccountId: transactions.bankAccountId,
        processedDate: transactions.processedDate,
        chargedAmount: transactions.chargedAmount,
      })
      .from(transactions)
      .where(
        and(
          inArray(transactions.bankAccountId, cardAccountIds),
          gt(transactions.processedDate, today),
        ),
      );

    for (const t of txRows) {
      const list = txByAccount.get(t.bankAccountId) ?? [];
      list.push({ processedDate: t.processedDate, chargedAmount: Number(t.chargedAmount) });
      txByAccount.set(t.bankAccountId, list);
    }
  }

  return rows.map((r) => {
    if (CARD_BANK_TYPES.has(r.bankType)) {
      const { estimate, nextDebitDate } = computeNextDebitEstimate(
        txByAccount.get(r.id) ?? [],
        today,
      );
      return {
        id: r.id,
        accountNumber: r.accountNumber,
        balance: estimate,
        bankType: r.bankType,
        displayName: r.displayName,
        nextDebitDate,
      };
    }

    return {
      id: r.id,
      accountNumber: r.accountNumber,
      balance: r.balance !== null ? Number(r.balance) : null,
      bankType: r.bankType,
      displayName: r.displayName,
      nextDebitDate: null,
    };
  });
}

export async function getRecentTransactions(limit: number): Promise<RecentTransaction[]> {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      customDescription: transactions.customDescription,
      chargedAmount: transactions.chargedAmount,
      chargedCurrency: transactions.chargedCurrency,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryType: categories.type,
      categoryColor: categories.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    description: r.description,
    customDescription: r.customDescription,
    chargedAmount: Number(r.chargedAmount),
    chargedCurrency: r.chargedCurrency,
    categoryId: r.categoryId,
    categoryName: r.categoryName ?? null,
    categoryType: r.categoryType ?? null,
    categoryColor: r.categoryColor ?? null,
  }));
}
