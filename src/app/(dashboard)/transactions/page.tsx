export const dynamic = "force-dynamic";

import { getCategories } from "@/lib/categories";
import { TransactionsTable } from "@/components/transactions-table";

export default async function TransactionsPage() {
  const categories = await getCategories();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">תנועות</h2>
      <TransactionsTable categories={categories} />
    </div>
  );
}
