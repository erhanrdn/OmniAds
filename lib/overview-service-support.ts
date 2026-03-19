export function parseActionValue(
  actions: Array<{ action_type: string; value: string }> | undefined,
  actionType: string
): number {
  if (!Array.isArray(actions)) return 0;
  const found = actions.find((action) => action.action_type === actionType);
  return found ? parseFloat(found.value) || 0 : 0;
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseISODate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function enumerateDays(startDate: string, endDate: string) {
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    dates.push(toISODate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function nDaysAgo(n: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
