export type ReconciliationTransaction = {
  id: string;
  bankAccountId: string;
  bankType: "discount" | "max" | "visaCal";
  date: string; // YYYY-MM-DD
  chargedAmount: number;
  description: string;
  categoryId: string | null;
  reconciliationGroupId: string | null;
};

export type ReconciliationCandidate = {
  bankLump: ReconciliationTransaction;
  cardDetails: ReconciliationTransaction[];
  confidence: number;
};

export type ApplyResult = {
  autoApplied: number;
  queued: number;
};
