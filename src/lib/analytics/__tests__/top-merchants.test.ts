import { describe, it, expect } from "vitest";
import { computeTopMerchants, type MerchantTransaction } from "../index";

describe("computeTopMerchants", () => {
  it("aggregates expense transactions by canonicalized merchant", () => {
    const txs: MerchantTransaction[] = [
      { description: "רכישה בסופרמרקט רמי לוי", chargedAmount: -100, categoryType: "expense" },
      { description: "קניה בסופרמרקט רמי לוי", chargedAmount: -50, categoryType: "expense" },
    ];
    const result = computeTopMerchants(txs);
    expect(result).toEqual([{ merchant: "סופרמרקט רמי לוי", amount: 150 }]);
  });

  it("collapses cross-script brand aliases via canonicalizeMerchant", () => {
    const txs: MerchantTransaction[] = [
      { description: "רכישה בנטפליקס ישראל", chargedAmount: -40, categoryType: "expense" },
      { description: "NETFLIX.COM", chargedAmount: -40, categoryType: "expense" },
    ];
    const result = computeTopMerchants(txs);
    expect(result).toEqual([{ merchant: "netflix", amount: 80 }]);
  });

  it("is expense-only: excludes income, investment, transfer, ignore, and uncategorized rows", () => {
    const txs: MerchantTransaction[] = [
      { description: "משכורת", chargedAmount: 10000, categoryType: "income" },
      { description: "קרן השתלמות", chargedAmount: -1000, categoryType: "investment" },
      { description: "העברה לחשבון אחר", chargedAmount: -500, categoryType: "transfer" },
      { description: "בדיקה", chargedAmount: -50, categoryType: "ignore" },
      { description: "לא ידוע", chargedAmount: -30, categoryType: null },
      { description: "סופרמרקט רמי לוי", chargedAmount: -200, categoryType: "expense" },
    ];
    const result = computeTopMerchants(txs);
    expect(result).toEqual([{ merchant: "סופרמרקט רמי לוי", amount: 200 }]);
  });

  it("excludes a card_settlement lump even if it is (mis)categorized as expense", () => {
    const txs: MerchantTransaction[] = [
      { description: "חיוב ויזה", chargedAmount: -3500, categoryType: "expense" },
      { description: "מאסטרקארד", chargedAmount: -1200, categoryType: "expense" },
      { description: "כרטיס אשראי 4321", chargedAmount: -900, categoryType: "expense" },
      { description: "סופרמרקט רמי לוי", chargedAmount: -200, categoryType: "expense" },
    ];
    const result = computeTopMerchants(txs);
    expect(result).toEqual([{ merchant: "סופרמרקט רמי לוי", amount: 200 }]);
  });

  it("does not let a genuine merchant collide with the settlement filter", () => {
    // "סופרמרקט" contains no transfer-descriptor token — sanity check that the
    // card_settlement filter is a whole-token match, not a broad exclusion.
    const txs: MerchantTransaction[] = [
      { description: "סופרמרקט רמי לוי", chargedAmount: -200, categoryType: "expense" },
    ];
    expect(computeTopMerchants(txs)).toEqual([{ merchant: "סופרמרקט רמי לוי", amount: 200 }]);
  });

  it("ranks merchants descending by total spend", () => {
    const txs: MerchantTransaction[] = [
      { description: "בית קפה קטן", chargedAmount: -20, categoryType: "expense" },
      { description: "סופרמרקט רמי לוי", chargedAmount: -500, categoryType: "expense" },
      { description: "תחנת דלק", chargedAmount: -200, categoryType: "expense" },
    ];
    const result = computeTopMerchants(txs);
    expect(result.map((r) => r.merchant)).toEqual(["סופרמרקט רמי לוי", "תחנת דלק", "בית קפה קטן"]);
  });

  it("limits to top-N, defaulting to 5", () => {
    const txs: MerchantTransaction[] = Array.from({ length: 8 }, (_, i) => ({
      description: `חנות מספר ${i}`,
      chargedAmount: -(100 + i),
      categoryType: "expense" as const,
    }));
    const result = computeTopMerchants(txs);
    expect(result).toHaveLength(5);
    // Highest amounts (i=7 down to i=3) should be the top 5.
    expect(result.map((r) => r.amount)).toEqual([107, 106, 105, 104, 103]);
  });

  it("respects an explicit limit override", () => {
    const txs: MerchantTransaction[] = Array.from({ length: 8 }, (_, i) => ({
      description: `חנות מספר ${i}`,
      chargedAmount: -(100 + i),
      categoryType: "expense" as const,
    }));
    const result = computeTopMerchants(txs, 3);
    expect(result).toHaveLength(3);
  });

  it("returns an empty list for an empty month", () => {
    expect(computeTopMerchants([])).toEqual([]);
  });

  it("returns an empty list when nothing is a categorized expense", () => {
    const txs: MerchantTransaction[] = [
      { description: "משכורת", chargedAmount: 10000, categoryType: "income" },
      { description: "העברה", chargedAmount: -500, categoryType: "transfer" },
    ];
    expect(computeTopMerchants(txs)).toEqual([]);
  });
});
