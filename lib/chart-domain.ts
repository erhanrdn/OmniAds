export type ChartDomainMode = "adaptive" | "zero_based" | "symmetric";
export type ChartDetailLevel = "sparkline" | "detail" | "report";
export type ChartDomainUnit =
  | "currency"
  | "count"
  | "ratio"
  | "percent"
  | "duration_seconds"
  | "unknown";

export interface ResolvedChartDomain {
  min: number;
  max: number;
  center: number;
  includeZero: boolean;
  modeUsed: ChartDomainMode;
  clamped: boolean;
  normalizedValues: number[];
}

function sanitizeChartValues(values: number[]) {
  return values.filter((value) => Number.isFinite(value));
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function allowsNegative(unit: ChartDomainUnit) {
  return unit === "unknown";
}

function minPaddingByUnit(
  unit: ChartDomainUnit,
  center: number,
  detailLevel: ChartDetailLevel
) {
  const magnitude = Math.abs(center);

  if (unit === "percent") {
    return detailLevel === "sparkline"
      ? Math.max(0.05, magnitude * 0.15)
      : Math.max(0.1, magnitude * 0.12);
  }
  if (unit === "ratio") return Math.max(0.03, magnitude * 0.12);
  if (unit === "currency") return Math.max(1, magnitude * 0.08);
  if (unit === "count") return Math.max(1, magnitude * 0.08);
  if (unit === "duration_seconds") return Math.max(1, magnitude * 0.08);
  return Math.max(0.1, magnitude * 0.1);
}

export function normalizePercentSeries(values: number[]) {
  const sanitized = sanitizeChartValues(values);
  if (sanitized.length === 0) return [];
  const maxAbs = Math.max(...sanitized.map((value) => Math.abs(value)));
  if (maxAbs <= 0.1) {
    return sanitized.map((value) => Number((value * 100).toFixed(4)));
  }
  return sanitized;
}

export function resolveChartDomain(
  values: number[],
  options?: {
    unit?: ChartDomainUnit;
    mode?: ChartDomainMode;
    detailLevel?: ChartDetailLevel;
    includeZero?: boolean;
  }
): ResolvedChartDomain {
  const unit = options?.unit ?? "unknown";
  const mode = options?.mode ?? "adaptive";
  const detailLevel = options?.detailLevel ?? "detail";
  const sanitized = sanitizeChartValues(values);
  const normalizedValues = unit === "percent" ? normalizePercentSeries(sanitized) : sanitized;

  if (normalizedValues.length === 0) {
    return {
      min: 0,
      max: 1,
      center: 0,
      includeZero: true,
      modeUsed: mode,
      clamped: false,
      normalizedValues: [],
    };
  }

  const rawMin = Math.min(...normalizedValues);
  const rawMax = Math.max(...normalizedValues);
  const includeZero = options?.includeZero ?? mode === "zero_based";

  if (mode === "zero_based") {
    const padding = Math.max(
      (rawMax - Math.min(0, rawMin)) * 0.1,
      minPaddingByUnit(unit, rawMax, detailLevel)
    );
    const min = allowsNegative(unit) && rawMin < 0 ? rawMin - padding : 0;
    const max = rawMax + padding;
    return clampDomain({
      min,
      max,
      center: 0,
      includeZero: true,
      modeUsed: mode,
      clamped: false,
      normalizedValues,
      unit,
    });
  }

  if (mode === "symmetric") {
    const span = Math.max(Math.abs(rawMin), Math.abs(rawMax), 1);
    const padding = Math.max(span * 0.1, minPaddingByUnit(unit, span, detailLevel));
    return clampDomain({
      min: -span - padding,
      max: span + padding,
      center: 0,
      includeZero: true,
      modeUsed: mode,
      clamped: false,
      normalizedValues,
      unit,
    });
  }

  const center = median(normalizedValues);
  const unclampedSpread = Math.max(Math.abs(rawMax - center), Math.abs(rawMin - center));
  const outlierClampEnabled = detailLevel !== "sparkline" && normalizedValues.length >= 5;
  const effectiveMin = outlierClampEnabled
    ? Math.max(rawMin, center - unclampedSpread * 3)
    : rawMin;
  const effectiveMax = outlierClampEnabled
    ? Math.min(rawMax, center + unclampedSpread * 3)
    : rawMax;
  const spread = Math.max(
    Math.abs(effectiveMax - center),
    Math.abs(effectiveMin - center),
    0
  );
  const padding = Math.max(spread * 0.35, minPaddingByUnit(unit, center, detailLevel));
  const min = effectiveMin - padding;
  const max = effectiveMax + padding;

  return clampDomain({
    min,
    max,
    center,
    includeZero,
    modeUsed: mode,
    clamped: outlierClampEnabled && (effectiveMin !== rawMin || effectiveMax !== rawMax),
    normalizedValues,
    unit,
  });
}

export function computeNiceAxisTicks(min: number, max: number, tickCount = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    const safeMax = Number.isFinite(max) ? max : 1;
    return [0, safeMax];
  }

  const span = max - min;
  const roughStep = span / Math.max(tickCount, 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(roughStep) || 1)));
  const normalized = roughStep / magnitude;
  let niceStep: number;
  if (normalized <= 1) niceStep = magnitude;
  else if (normalized <= 2) niceStep = 2 * magnitude;
  else if (normalized <= 2.5) niceStep = 2.5 * magnitude;
  else if (normalized <= 5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let value = niceMin; value <= niceMax + niceStep / 2; value += niceStep) {
    ticks.push(Number(value.toFixed(10)));
  }
  return ticks;
}

function clampDomain(input: {
  min: number;
  max: number;
  center: number;
  includeZero: boolean;
  modeUsed: ChartDomainMode;
  clamped: boolean;
  normalizedValues: number[];
  unit: ChartDomainUnit;
}): ResolvedChartDomain {
  let min = input.min;
  let max = input.max;

  if (input.includeZero) {
    min = Math.min(min, 0);
    max = Math.max(max, 0);
  }

  if (input.unit === "percent") {
    min = Math.max(0, min);
    max = Math.min(100, max);
  } else if (!allowsNegative(input.unit)) {
    min = Math.max(0, min);
  }

  if (max <= min) {
    max = min + (input.unit === "percent" ? 0.1 : 1);
  }

  return {
    min,
    max,
    center: input.center,
    includeZero: input.includeZero,
    modeUsed: input.modeUsed,
    clamped: input.clamped,
    normalizedValues: input.normalizedValues,
  };
}
