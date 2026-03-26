export type MetricUnit =
  | "currency"
  | "count"
  | "ratio"
  | "percent"
  | "duration_seconds"
  | "unknown";

export function formatCurrencySmart(
  value: number,
  currencySymbol: string,
  options: { compactLarge?: boolean } = {}
): string {
  if (!Number.isFinite(value)) return `${currencySymbol}0`;

  const compactLarge = options.compactLarge ?? true;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (compactLarge && abs >= 1_000_000) {
    return `${sign}${currencySymbol}${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (compactLarge && abs >= 1_000) {
    return `${sign}${currencySymbol}${(abs / 1_000).toFixed(1)}K`;
  }

  const fractionDigits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${sign}${currencySymbol}${abs.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

export function formatPercentSmart(value: number): string {
  if (!Number.isFinite(value)) return "0%";

  const abs = Math.abs(value);
  const fractionDigits = abs >= 10 ? 1 : abs >= 1 ? 1 : 2;
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

export function formatPercentFromRatioSmart(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return formatPercentSmart(value * 100);
}

export function formatMetricValue(
  value: number | null,
  unit: MetricUnit,
  currencySymbol: string
): string {
  if (value === null || Number.isNaN(value)) return "\u2014";
  if (unit === "currency") return formatCurrencySmart(value, currencySymbol);
  if (unit === "count") return Math.round(value).toLocaleString();
  if (unit === "ratio") return value.toFixed(2);
  if (unit === "percent") return formatPercentSmart(value);
  if (unit === "duration_seconds") return `${Math.round(value)}s`;
  return String(value);
}
