export const dynamic = "force-dynamic";

import { getCategories, getCategoryTree } from "@/lib/categories";
import { TransactionsTable } from "@/components/transactions-table";
import { PrototypeSwitcher } from "@/components/prototype-switcher";
import { PROTOTYPE_VARIANTS } from "@/components/category-picker-prototype";

// PROTOTYPE — throwaway (BGR3, #160): variant wiring on this page lives only
// on the prototype branch.
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const { variant = "A" } = await searchParams;
  const categories = await getCategories();
  const tree = await getCategoryTree();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">תנועות</h2>
      <TransactionsTable categories={categories} pickerPrototype={{ variant, tree }} />
      <PrototypeSwitcher variants={PROTOTYPE_VARIANTS} />
    </div>
  );
}
