import { db } from "@/db";
import { transactions, categories, bankAccounts, bankCredentials } from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";

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

export type AccountBalance = {
  accountNumber: string;
  balance: number | null;
  bankType: "discount" | "max" | "visaCal";
  displayName: string;
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

// ---------------------------------------------------------------------------
// DB-backed wrapper functions
// ---------------------------------------------------------------------------

function monthDateRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export async function getMonthlySummary(year: number, month: number): Promise<MonthlySummary> {
  const { from, to } = monthDateRange(year, month);

  const rows = await db
    .select({
      chargedAmount: transactions.chargedAmount,
      categoryType: categories.type,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, from), lte(transactions.date, to)));

  const analyticsRows: AnalyticsTransaction[] = rows.map((r) => ({
    chargedAmount: Number(r.chargedAmount),
    categoryType: r.categoryType ?? null,
  }));

  return computeMonthlySummary(analyticsRows);
}

export async function getSpendingByCategory(
  year: number,
  month: number,
): Promise<CategorySpending[]> {
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

  const withCategory: TransactionWithCategory[] = rows.map((r) => ({
    chargedAmount: Number(r.chargedAmount),
    categoryType: r.categoryType ?? null,
    categoryId: r.categoryId ?? null,
    categoryName: r.categoryName ?? "",
    categoryColor: r.categoryColor ?? "#888888",
    categoryIcon: r.categoryIcon ?? "MoreHorizontal",
  }));

  return computeSpendingByCategory(withCategory);
}

export async function getAccountBalances(): Promise<AccountBalance[]> {
  const rows = await db
    .select({
      accountNumber: bankAccounts.accountNumber,
      balance: bankAccounts.balance,
      bankType: bankCredentials.bankType,
      displayName: bankCredentials.displayName,
    })
    .from(bankAccounts)
    .innerJoin(bankCredentials, eq(bankAccounts.credentialId, bankCredentials.id));

  return rows.map((r) => ({
    accountNumber: r.accountNumber,
    balance: r.balance !== null ? Number(r.balance) : null,
    bankType: r.bankType,
    displayName: r.displayName,
  }));
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
