import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  getGoogleAdsOverviewReport,
  getGoogleAdsProductsReport,
  getGoogleAdsSearchIntelligenceReport,
} from "@/lib/google-ads/serving";
import {
  resolveOverviewBenchmarkBaselinePath,
} from "@/scripts/overview-benchmark-lib";

export const GOOGLE_CLOSEOUT_BENCHMARK_BASELINE_FILE =
  "docs/benchmarks/google-short-gate-baseline-2026-04-18.json";

type ScenarioName =
  | "google_ads_overview_30d"
  | "google_ads_search_intelligence_90d"
  | "google_ads_products_30d";

interface ParsedArgs {
  businessId: string;
  range30Start: string;
  range30End: string;
  range90Start: string;
  range90End: string;
  iterations30: number;
  iterations90: number;
  timeoutMs: number;
  baselineFile: string;
  jsonOut: string | null;
  markdownOut: string | null;
}

interface ScenarioBaseline {
  averageMs: number | null;
  p95Ms: number | null;
}

interface ScenarioResult {
  name: ScenarioName;
  iterations: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  sampleCardinality: number | null;
  validityNote: string;
  businessId: string;
  baselineAverageMs: number | null;
  baselineP95Ms: number | null;
}

interface BenchmarkBlocker {
  scenario: ScenarioName;
  reason: "invalid_validity_note" | "missing_baseline" | "latency_regression";
  detail: string;
  currentValue?: number | string | null;
  baselineValue?: number | string | null;
}

function parseArgs(argv: string[]) {
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value =
      argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
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
  if (lowerIndex === upperIndex) return Number(lowerValue.toFixed(2));
  const weight = rank - lowerIndex;
  return Number((lowerValue + (upperValue - lowerValue) * weight).toFixed(2));
}

function describeScenarioError(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").trim();
  }
  return String(error).replace(/\s+/g, " ").trim();
}

export function isAcceptedGoogleAdsValidityNote(value: string) {
  const parts = value
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((entry) => entry === "valid" || entry.startsWith("valid:"));
}

function loadScenarioBaseline(pathValue: string, scenarioName: ScenarioName): ScenarioBaseline {
  try {
    const file = JSON.parse(readFileSync(resolve(pathValue), "utf8")) as {
      scenarios?: Array<{ name?: string; averageMs?: number; p95Ms?: number }>;
    };
    const scenario = file.scenarios?.find((entry) => entry.name === scenarioName);
    return {
      averageMs: typeof scenario?.averageMs === "number" ? scenario.averageMs : null,
      p95Ms: typeof scenario?.p95Ms === "number" ? scenario.p95Ms : null,
    };
  } catch {
    return {
      averageMs: null,
      p95Ms: null,
    };
  }
}

export function parseGoogleAdsCloseoutBenchmarkArgs(argv: string[]): ParsedArgs {
  const args = parseArgs(argv);
  const businessId = args.get("business-id") ?? args.get("businessId");
  const range30Start = args.get("range30-start") ?? args.get("range30Start");
  const range30End = args.get("range30-end") ?? args.get("range30End");
  const range90Start = args.get("range90-start") ?? args.get("range90Start");
  const range90End = args.get("range90-end") ?? args.get("range90End");
  if (!businessId || !range30Start || !range30End || !range90Start || !range90End) {
    throw new Error(
      "Missing required args. Required: --business-id --range30-start --range30-end --range90-start --range90-end",
    );
  }
  return {
    businessId,
    range30Start,
    range30End,
    range90Start,
    range90End,
    iterations30: Number(args.get("iterations30") ?? "2"),
    iterations90: Number(args.get("iterations90") ?? "2"),
    timeoutMs: Number(args.get("timeout-ms") ?? "30000"),
    baselineFile: args.get("baseline-file") ?? GOOGLE_CLOSEOUT_BENCHMARK_BASELINE_FILE,
    jsonOut: args.get("json-out") ?? null,
    markdownOut: args.get("markdown-out") ?? null,
  };
}

export async function measureGoogleAdsBenchmarkOperation<T>(input: {
  timeoutMs: number;
  operation: () => Promise<T>;
}) {
  return Promise.race([
    input.operation(),
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`Timed out after ${input.timeoutMs}ms`));
      }, input.timeoutMs);
    }),
  ]);
}

export function classifyGoogleAdsBenchmarkScenario(input: { result: ScenarioResult }) {
  const blockers: BenchmarkBlocker[] = [];
  if (!isAcceptedGoogleAdsValidityNote(input.result.validityNote)) {
    blockers.push({
      scenario: input.result.name,
      reason: "invalid_validity_note",
      detail: `Validity note ${input.result.validityNote} is not accepted for Google short gate.`,
      currentValue: input.result.validityNote,
    });
  }

  const baselineAverageMs = input.result.baselineAverageMs;
  const baselineP95Ms = input.result.baselineP95Ms;
  if (baselineAverageMs == null && baselineP95Ms == null) {
    blockers.push({
      scenario: input.result.name,
      reason: "missing_baseline",
      detail: "Google closeout benchmark baseline is missing for this scenario.",
    });
    return blockers;
  }

  const baselineValue = baselineP95Ms ?? baselineAverageMs;
  const currentValue = baselineP95Ms != null ? input.result.p95Ms : input.result.averageMs;
  if (baselineValue != null) {
    const absoluteDelta = currentValue - baselineValue;
    const percentDelta = baselineValue > 0 ? (absoluteDelta / baselineValue) * 100 : 0;
    if (absoluteDelta > 500 && percentDelta > 20) {
      blockers.push({
        scenario: input.result.name,
        reason: "latency_regression",
        detail: `${baselineP95Ms != null ? "p95" : "average"} regressed by ${absoluteDelta.toFixed(2)}ms (${percentDelta.toFixed(2)}%).`,
        currentValue,
        baselineValue,
      });
    }
  }

  return blockers;
}

async function measureScenario(input: {
  name: ScenarioName;
  iterations: number;
  timeoutMs: number;
  businessId: string;
  baseline: ScenarioBaseline;
  operation: () => Promise<{ sampleCardinality: number | null; validityNote: string }>;
}): Promise<ScenarioResult> {
  const durations: number[] = [];
  const sampleCardinalities: Array<number | null> = [];
  const validityNotes: string[] = [];

  for (let iteration = 0; iteration < input.iterations; iteration += 1) {
    const startedAt = performance.now();
    try {
      const result = await measureGoogleAdsBenchmarkOperation({
        timeoutMs: input.timeoutMs,
        operation: input.operation,
      });
      durations.push(performance.now() - startedAt);
      sampleCardinalities.push(result.sampleCardinality);
      validityNotes.push(result.validityNote);
    } catch (error) {
      durations.push(performance.now() - startedAt);
      sampleCardinalities.push(null);
      validityNotes.push(`error:${describeScenarioError(error)}`);
    }
  }

  return {
    name: input.name,
    iterations: input.iterations,
    averageMs: Number(average(durations).toFixed(2)),
    minMs: Number(Math.min(...durations).toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2)),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    sampleCardinality: sampleCardinalities[0] ?? null,
    validityNote: Array.from(new Set(validityNotes)).join("|"),
    businessId: input.businessId,
    baselineAverageMs: input.baseline.averageMs,
    baselineP95Ms: input.baseline.p95Ms,
  };
}

function renderMarkdown(input: {
  businessId: string;
  baselineFile: string;
  results: ScenarioResult[];
  blockers: BenchmarkBlocker[];
}) {
  const lines = [
    "# Google Ads Closeout Benchmark",
    "",
    `- businessId: \`${input.businessId}\``,
    `- baselineFile: \`${input.baselineFile}\``,
    `- blockers: ${input.blockers.length}`,
    "",
    "## Scenarios",
  ];
  for (const result of input.results) {
    lines.push(
      `- \`${result.name}\`: avg ${result.averageMs}ms, p95 ${result.p95Ms}ms, validity ${result.validityNote}, rows ${result.sampleCardinality ?? "null"}`,
    );
  }
  if (input.blockers.length > 0) {
    lines.push("", "## Blockers");
    for (const blocker of input.blockers) {
      lines.push(`- \`${blocker.scenario}\` ${blocker.reason}: ${blocker.detail}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const parsed = parseGoogleAdsCloseoutBenchmarkArgs(process.argv.slice(2));
  const overviewBaseline = loadScenarioBaseline(
    parsed.baselineFile,
    "google_ads_overview_30d",
  );
  const searchBaseline = loadScenarioBaseline(
    parsed.baselineFile,
    "google_ads_search_intelligence_90d",
  );
  const productBaseline = loadScenarioBaseline(
    parsed.baselineFile,
    "google_ads_products_30d",
  );

  const results = [
    await measureScenario({
      name: "google_ads_overview_30d",
      iterations: parsed.iterations30,
      timeoutMs: parsed.timeoutMs,
      businessId: parsed.businessId,
      baseline: overviewBaseline,
      operation: async () => {
        const report = await getGoogleAdsOverviewReport({
          businessId: parsed.businessId,
          accountId: null,
          dateRange: "custom",
          customStart: parsed.range30Start,
          customEnd: parsed.range30End,
          compareMode: "none",
          compareStart: null,
          compareEnd: null,
          debug: false,
          source: "benchmark_google_ads_closeout_overview_30d",
        });
        return {
          sampleCardinality: Array.isArray(report.topCampaigns) ? report.topCampaigns.length : null,
          validityNote: report.summary && report.meta ? "valid" : "missing_summary",
        };
      },
    }),
    await measureScenario({
      name: "google_ads_search_intelligence_90d",
      iterations: parsed.iterations90,
      timeoutMs: parsed.timeoutMs,
      businessId: parsed.businessId,
      baseline: searchBaseline,
      operation: async () => {
        const report = await getGoogleAdsSearchIntelligenceReport({
          businessId: parsed.businessId,
          accountId: null,
          dateRange: "custom",
          customStart: parsed.range90Start,
          customEnd: parsed.range90End,
        });
        return {
          sampleCardinality: Array.isArray(report.rows) ? report.rows.length : null,
          validityNote:
            Array.isArray(report.rows) && report.meta
              ? "valid"
              : `status:${String(report.meta?.readSource ?? "unknown")}`,
        };
      },
    }),
    await measureScenario({
      name: "google_ads_products_30d",
      iterations: parsed.iterations30,
      timeoutMs: parsed.timeoutMs,
      businessId: parsed.businessId,
      baseline: productBaseline,
      operation: async () => {
        const report = await getGoogleAdsProductsReport({
          businessId: parsed.businessId,
          accountId: null,
          dateRange: "custom",
          customStart: parsed.range30Start,
          customEnd: parsed.range30End,
        });
        return {
          sampleCardinality: Array.isArray(report.rows) ? report.rows.length : null,
          validityNote:
            Array.isArray(report.rows) && report.meta
              ? "valid"
              : `status:${String(report.meta?.readSource ?? "unknown")}`,
        };
      },
    }),
  ];

  const blockers = results.flatMap((result) => classifyGoogleAdsBenchmarkScenario({ result }));
  const artifact = {
    businessId: parsed.businessId,
    measuredAt: new Date().toISOString(),
    baselineFile: resolveOverviewBenchmarkBaselinePath(parsed.baselineFile),
    clean: blockers.length === 0,
    blockers,
    scenarios: results,
  };

  if (parsed.jsonOut) {
    writeFileSync(resolve(parsed.jsonOut), JSON.stringify(artifact, null, 2));
  }
  if (parsed.markdownOut) {
    writeFileSync(
      resolve(parsed.markdownOut),
      renderMarkdown({
        businessId: parsed.businessId,
        baselineFile: resolveOverviewBenchmarkBaselinePath(parsed.baselineFile),
        results,
        blockers,
      }),
      "utf8",
    );
  }

  console.log(JSON.stringify(artifact, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
