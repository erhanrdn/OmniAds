import { getOverviewData, getOverviewTrendBundle, getShopifyOverviewServingData } from "@/lib/overview-service";

type ScenarioResult = {
  name: string;
  iterations: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  sampleCardinality: number | null;
  validityNote: string;
};

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

async function measureScenario(
  name: string,
  iterations: number,
  operation: () => Promise<{ sampleCardinality: number | null; validityNote: string }>,
): Promise<ScenarioResult> {
  const durations: number[] = [];
  let sampleCardinality: number | null = null;
  let validityNote = "valid";

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = performance.now();
    const result = await operation();
    const durationMs = performance.now() - startedAt;
    durations.push(durationMs);
    sampleCardinality = result.sampleCardinality;
    validityNote = result.validityNote;
  }

  return {
    name,
    iterations,
    averageMs: Number(average(durations).toFixed(2)),
    minMs: Number(Math.min(...durations).toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2)),
    sampleCardinality,
    validityNote,
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
  const trendIterations = Number(args.get("trendIterations") ?? "1");

  const results = [
    await measureScenario("overview_data_no_trends_30d", iterations30, async () => {
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
      };
    }),
    await measureScenario("overview_data_no_trends_90d", iterations90, async () => {
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
      };
    }),
    await measureScenario("overview_trend_bundle_30d", trendIterations, async () => {
      const trendBundle = await getOverviewTrendBundle({
        businessId,
        startDate: range30Start,
        endDate: range30End,
      });
      return {
        sampleCardinality: trendBundle.combined.length,
        validityNote: trendBundle.combined.length > 0 ? "valid" : "empty_trend_bundle",
      };
    }),
    await measureScenario("shopify_warehouse_overview_90d", iterations90, async () => {
      const shopify = await getShopifyOverviewServingData({
        businessId,
        startDate: range90Start,
        endDate: range90End,
      });
      return {
        sampleCardinality: shopify.aggregate?.dailyTrends?.length ?? null,
        validityNote: shopify.serving?.source ? `valid:${shopify.serving.source}` : "valid:none",
      };
    }),
  ];

  console.log(
    JSON.stringify(
      {
        businessId,
        measuredAt: new Date().toISOString(),
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
