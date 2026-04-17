import {
  getGoogleAdsOverviewReport,
} from "@/lib/google-ads/serving";
import { getOverviewData, getOverviewTrendBundle, getShopifyOverviewServingData } from "@/lib/overview-service";
import { getMetaCreativesDbPayload } from "@/lib/meta/creatives-api";
import {
  DEFAULT_OVERVIEW_BENCHMARK_BASELINE_FILE,
  loadOverviewBenchmarkBaselineMap,
  resolveOverviewBenchmarkBaselinePath,
} from "@/scripts/overview-benchmark-lib";

type ScenarioResult = {
  name: string;
  iterations: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  sampleCardinality: number | null;
  baselineMs: number | null;
  deltaMs: number | null;
  deltaPercent: number | null;
  validityNote: string;
};

type ScenarioObservation = {
  sampleCardinality: number | null;
  validityNote: string;
  sourceKey?: string | null;
};

function describeScenarioError(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").trim();
  }
  return String(error).replace(/\s+/g, " ").trim();
}

function parseArgs(argv: string[]) {
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    parsed.set(key, value);
    if (value !== "true") index += 1;
  }
  return parsed;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return Number(sorted[0]?.toFixed(2) ?? 0);
  const rank = percentileValue * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lowerValue = sorted[lowerIndex] ?? 0;
  const upperValue = sorted[upperIndex] ?? lowerValue;
  if (lowerIndex === upperIndex) {
    return Number(lowerValue.toFixed(2));
  }
  const weight = rank - lowerIndex;
  return Number((lowerValue + (upperValue - lowerValue) * weight).toFixed(2));
}

async function measureScenario(
  name: string,
  iterations: number,
  baselineMs: number | null,
  operation: () => Promise<ScenarioObservation>,
): Promise<ScenarioResult> {
  const durations: number[] = [];
  const sampleCardinalities: Array<number | null> = [];
  const validityNotes: string[] = [];
  const sourceKeys = new Set<string>();

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = performance.now();
    try {
      const result = await operation();
      const durationMs = performance.now() - startedAt;
      durations.push(durationMs);
      sampleCardinalities.push(result.sampleCardinality);
      validityNotes.push(result.validityNote);
      if (result.sourceKey) sourceKeys.add(result.sourceKey);
    } catch (error) {
      const durationMs = performance.now() - startedAt;
      durations.push(durationMs);
      sampleCardinalities.push(null);
      validityNotes.push(`error:${describeScenarioError(error)}`);
    }
  }

  const sampleCardinality = sampleCardinalities[0] ?? null;
  const sampleCardinalityStable = sampleCardinalities.every((value) => value === sampleCardinality);
  const averageMs = Number(average(durations).toFixed(2));
  const deltaMs = baselineMs === null ? null : Number((averageMs - baselineMs).toFixed(2));
  const deltaPercent =
    baselineMs && baselineMs > 0 && deltaMs !== null
      ? Number(((deltaMs / baselineMs) * 100).toFixed(2))
      : null;
  const validityParts = [...new Set(validityNotes)];
  if (!sampleCardinalityStable) validityParts.push("sample_cardinality_changed");
  if (sourceKeys.size > 1) validityParts.push("source_changed");

  return {
    name,
    iterations,
    averageMs,
    minMs: Number(Math.min(...durations).toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2)),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    sampleCardinality,
    baselineMs,
    deltaMs,
    deltaPercent,
    validityNote: validityParts.join("|"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const businessId = args.get("businessId");
  if (!businessId) {
    throw new Error("Missing --businessId");
  }

  const range30Start = args.get("range30Start");
  const range30End = args.get("range30End");
  const range90Start = args.get("range90Start");
  const range90End = args.get("range90End");
  if (!range30Start || !range30End || !range90Start || !range90End) {
    throw new Error("Missing date args. Required: --range30Start --range30End --range90Start --range90End");
  }

  const iterations30 = Number(args.get("iterations30") ?? "2");
  const iterations90 = Number(args.get("iterations90") ?? "2");
  const trendIterations = Number(args.get("trendIterations") ?? "5");
  const baselinePath = args.get("baselineFile") ?? DEFAULT_OVERVIEW_BENCHMARK_BASELINE_FILE;
  const baseline = loadOverviewBenchmarkBaselineMap(baselinePath);

  const results = [
    await measureScenario("overview_data_no_trends_30d", iterations30, baseline.overview_data_no_trends_30d ?? null, async () => {
      const overview = await getOverviewData({
        businessId,
        startDate: range30Start,
        endDate: range30End,
        includeTrends: false,
      });
      return {
        sampleCardinality: overview.platformEfficiency.length,
        validityNote: overview.dateRange.startDate === range30Start && overview.dateRange.endDate === range30End
          ? "valid"
          : "date_range_mismatch",
        sourceKey: overview.shopifyServing?.source ?? "none",
      };
    }),
    await measureScenario("overview_data_no_trends_90d", iterations90, baseline.overview_data_no_trends_90d ?? null, async () => {
      const overview = await getOverviewData({
        businessId,
        startDate: range90Start,
        endDate: range90End,
        includeTrends: false,
      });
      return {
        sampleCardinality: overview.platformEfficiency.length,
        validityNote: overview.dateRange.startDate === range90Start && overview.dateRange.endDate === range90End
          ? "valid"
          : "date_range_mismatch",
        sourceKey: overview.shopifyServing?.source ?? "none",
      };
    }),
    await measureScenario("overview_trend_bundle_30d", trendIterations, baseline.overview_trend_bundle_30d ?? null, async () => {
      const trendBundle = await getOverviewTrendBundle({
        businessId,
        startDate: range30Start,
        endDate: range30End,
      });
      return {
        sampleCardinality: trendBundle.combined.length,
        validityNote:
          trendBundle.combined.length > 0 &&
          trendBundle.providerTrends.meta?.length === trendBundle.combined.length &&
          trendBundle.providerTrends.google?.length === trendBundle.combined.length
            ? "valid"
            : "trend_shape_mismatch",
      };
    }),
    await measureScenario("shopify_warehouse_overview_90d", iterations90, baseline.shopify_warehouse_overview_90d ?? null, async () => {
      const shopify = await getShopifyOverviewServingData({
        businessId,
        startDate: range90Start,
        endDate: range90End,
      });
      return {
        sampleCardinality: shopify.aggregate?.dailyTrends?.length ?? null,
        validityNote: shopify.serving?.source ? `valid:${shopify.serving.source}` : "valid:none",
        sourceKey: shopify.serving?.source ?? "none",
      };
    }),
    await measureScenario("meta_creatives_30d", iterations30, baseline.meta_creatives_30d ?? null, async () => {
      const creatives = await getMetaCreativesDbPayload({
        businessId,
        start: range30Start,
        end: range30End,
        groupBy: "creative",
        format: "all",
        sort: "roas",
        mediaMode: "metadata",
      });
      return {
        sampleCardinality: Array.isArray(creatives.rows) ? creatives.rows.length : null,
        validityNote:
          "snapshot_source" in creatives &&
          creatives.snapshot_source === "persisted" &&
          "freshness_state" in creatives &&
          typeof creatives.freshness_state === "string"
            ? `valid:${creatives.freshness_state}`
            : "missing_persisted_snapshot",
        sourceKey:
          "snapshot_source" in creatives && typeof creatives.snapshot_source === "string"
            ? creatives.snapshot_source
            : "unknown",
      };
    }),
    await measureScenario("google_ads_overview_30d", iterations30, baseline.google_ads_overview_30d ?? null, async () => {
      const report = await getGoogleAdsOverviewReport({
        businessId,
        accountId: null,
        dateRange: "custom",
        customStart: range30Start,
        customEnd: range30End,
        compareMode: "none",
        compareStart: null,
        compareEnd: null,
        debug: false,
        source: "benchmark_google_ads_overview_30d",
      });
      return {
        sampleCardinality: Array.isArray(report.topCampaigns) ? report.topCampaigns.length : null,
        validityNote:
          report.summary && report.meta
            ? "valid"
            : "missing_summary",
        sourceKey:
          typeof (report.meta as { readSource?: unknown } | undefined)?.readSource === "string"
            ? String((report.meta as { readSource?: unknown }).readSource)
            : typeof (report.meta as { source?: unknown } | undefined)?.source === "string"
              ? String((report.meta as { source?: unknown }).source)
              : "unknown",
      };
    }),
  ];

  console.log(
    JSON.stringify(
      {
        businessId,
        measuredAt: new Date().toISOString(),
        baselineFile: resolveOverviewBenchmarkBaselinePath(baselinePath),
        scenarios: results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
