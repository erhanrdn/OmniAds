type CompareMode = "none" | "previous_period" | "previous_year" | "custom";

interface TrendMetrics {
  spendChange: number | null | undefined;
  revenueChange: number | null | undefined;
  conversionsChange: number | null | undefined;
  roasChange: number | null | undefined;
  ctrChange: number | null | undefined;
}

type RawRow = Record<string, unknown>;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "best",
  "buy",
  "for",
  "from",
  "in",
  "near",
  "of",
  "on",
  "review",
  "reviews",
  "sale",
  "shop",
  "the",
  "to",
  "vs",
  "with",
]);

export const COUNTRY_MAP: Record<number, string> = {
  2840: "United States",
  2826: "United Kingdom",
  2276: "Germany",
  2250: "France",
  2380: "Italy",
  2724: "Spain",
  2036: "Australia",
  2124: "Canada",
  2392: "Japan",
  2076: "Brazil",
  2484: "Mexico",
  2528: "Netherlands",
  2756: "Switzerland",
  2752: "Sweden",
  2578: "Norway",
  2208: "Denmark",
  2246: "Finland",
  2040: "Austria",
  2056: "Belgium",
  2620: "Portugal",
  2616: "Poland",
  2203: "Czech Republic",
  2348: "Hungary",
  2642: "Romania",
  2792: "Turkey",
  2356: "India",
  2156: "China",
  2410: "South Korea",
  2702: "Singapore",
  2764: "Thailand",
};

function parseIsoDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatIsoDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function getPreviousDateWindow(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const daySpan =
    Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);

  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);

  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (daySpan - 1));

  return {
    startDate: formatIsoDate(previousStart),
    endDate: formatIsoDate(previousEnd),
  };
}

function getPreviousYearWindow(startDate: string, endDate: string) {
  const previousStart = parseIsoDate(startDate);
  previousStart.setUTCFullYear(previousStart.getUTCFullYear() - 1);

  const previousEnd = parseIsoDate(endDate);
  previousEnd.setUTCFullYear(previousEnd.getUTCFullYear() - 1);

  return {
    startDate: formatIsoDate(previousStart),
    endDate: formatIsoDate(previousEnd),
  };
}

export function getComparisonWindow(params: {
  compareMode?: CompareMode | null;
  startDate: string;
  endDate: string;
  compareStart?: string | null;
  compareEnd?: string | null;
}) {
  const mode = params.compareMode ?? "previous_period";
  if (mode === "none") return null;
  if (mode === "custom") {
    if (!params.compareStart || !params.compareEnd) return null;
    return {
      mode,
      startDate: params.compareStart,
      endDate: params.compareEnd,
    };
  }

  return {
    mode,
    ...(mode === "previous_year"
      ? getPreviousYearWindow(params.startDate, params.endDate)
      : getPreviousDateWindow(params.startDate, params.endDate)),
  };
}

export function pctDelta(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function roundOrNull(value: number | null, digits = 2) {
  if (value === null) return null;
  return Number(value.toFixed(digits));
}

export function buildTrendMetrics(
  current: {
    spend: number;
    revenue: number;
    conversions: number;
    roas: number;
    ctr: number;
  },
  previous?: Partial<typeof current>
): TrendMetrics {
  if (!previous) {
    return {
      spendChange: undefined,
      revenueChange: undefined,
      conversionsChange: undefined,
      roasChange: undefined,
      ctrChange: undefined,
    };
  }

  return {
    spendChange: pctDelta(current.spend, Number(previous?.spend ?? 0)),
    revenueChange: pctDelta(current.revenue, Number(previous?.revenue ?? 0)),
    conversionsChange: pctDelta(current.conversions, Number(previous?.conversions ?? 0)),
    roasChange: pctDelta(current.roas, Number(previous?.roas ?? 0)),
    ctrChange: pctDelta(current.ctr, Number(previous?.ctr ?? 0)),
  };
}

export function normalizeAssetPerformanceLabel(value: string | null): "top" | "average" | "underperforming" {
  if (!value) return "average";
  const lower = value.toLowerCase();
  if (lower.includes("best")) return "top";
  if (lower.includes("low")) return "underperforming";
  return "average";
}

export function slugifyQueryCluster(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .slice(0, 3)
    .join(" ");
}

export function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function aggregateOverviewKpisFromCampaigns(rows: Array<Record<string, unknown>>) {
  return rows.reduce<{
    spend: number;
    revenue: number;
    conversions: number;
    clicks: number;
    impressions: number;
  }>(
    (acc, row) => {
      acc.spend += Number(row.spend ?? 0);
      acc.revenue += Number(row.revenue ?? 0);
      acc.conversions += Number(row.conversions ?? 0);
      acc.clicks += Number(row.clicks ?? 0);
      acc.impressions += Number(row.impressions ?? 0);
      return acc;
    },
    { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0 }
  );
}

export type { TrendMetrics, RawRow };
