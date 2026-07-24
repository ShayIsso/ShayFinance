export const dynamic = "force-dynamic";

import { getCategories, getCategoryTree } from "@/lib/categories";
import { TransactionsTable } from "@/components/transactions-table";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ uncategorized?: string; needsReview?: string }>;
}) {
  const [categories, tree, params] = await Promise.all([
    getCategories(),
    getCategoryTree(),
    searchParams,
  ]);
  // Deep-links from the dashboard's attention counters (#206) land here as
  // `?uncategorized=true` / `?needsReview=true` — the same literal values
  // `transactionFiltersSchema` (src/lib/transactions/schemas.ts) accepts.
  // Mapped to the table's existing categoryId sentinels so both the manual
  // "קטגוריה" dropdown and a deep link drive the identical filter path.
  // needsReview wins if both are somehow present, matching resolveCategoryFilter's
  // own precedence (src/lib/transactions/index.ts).
  const initialCategoryFilter =
    params.needsReview === "true"
      ? "__needs_review__"
      : params.uncategorized === "true"
        ? "__uncategorized__"
        : "";
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">תנועות</h2>
      <TransactionsTable
        categories={categories}
        tree={tree}
        initialCategoryFilter={initialCategoryFilter}
      />
    </div>
  );
}
