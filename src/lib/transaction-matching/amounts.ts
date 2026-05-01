export interface MatchOptions {
  amountTolerancePct?: number;
  dateDayWindow?: number;
}

export function amountsMatch(a: number, b: number, options?: MatchOptions): boolean {
  const tolerance = options?.amountTolerancePct ?? 0.1;

  if (a === 0 && b === 0) return true;
  // Opposite-sign (or zero vs non-zero) inputs never match
  if (Math.sign(a) !== Math.sign(b)) return false;

  const minAbs = Math.min(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) / minAbs <= tolerance;
}

export function sumMatches(items: number[], target: number, options?: MatchOptions): boolean {
  const total = items.reduce((acc, v) => acc + v, 0);
  return amountsMatch(total, target, options);
}
