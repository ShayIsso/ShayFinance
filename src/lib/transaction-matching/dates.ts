const MS_PER_DAY = 86400000;

export function datesWithin(a: Date, b: Date, dayWindow: number): boolean {
  const diff = Math.abs(a.getTime() - b.getTime());
  return Math.floor(diff / MS_PER_DAY) <= dayWindow;
}
