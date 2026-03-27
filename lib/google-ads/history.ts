export const GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS = 730;

export function addDaysToIsoDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayCountInclusive(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

export function enumerateDays(startDate: string, endDate: string, recentFirst = false): string[] {
  const rows: string[] = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    rows.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return recentFirst ? rows.reverse() : rows;
}

export function getHistoricalWindowStart(
  endDate: string,
  totalDays = GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS
): string {
  return addDaysToIsoDate(endDate, -(totalDays - 1));
}
