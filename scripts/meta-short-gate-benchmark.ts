import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getMetaCreativesDbPayload } from "@/lib/meta/creatives-api";
import { getMetaAdSetsForRange } from "@/lib/meta/adsets-source";
import { getMetaBreakdownsForRange } from "@/lib/meta/breakdowns-source";
import { getMetaCampaignsForRange } from "@/lib/meta/campaigns-source";
import {
  META_SHORT_GATE_PRIMARY_CANARY,
  selectMetaCreativeGateBusiness,
} from "@/scripts/meta-parity-check";

export const META_SHORT_GATE_BASELINE_FILE =
  "docs/benchmarks/meta-short-gate-baseline-2026-04-18.json";
export const META_HISTORICAL_CREATIVES_BASELINE_FILE =
  "docs/benchmarks/overview-final-2026-04-07.json";

type ScenarioName =
  | "meta_creatives_30d"
  | "meta_campaigns_30d"
  | "meta_adsets_30d"
  | "meta_breakdowns_30d";

interface ParsedBenchmarkArgs {
  businessId: string;
  startDate: string;
  endDate: string;
  creativeBusinessId: string | null;
  iterations: number;
  jsonOut: string | null;
  markdownOut: string | null;
  baselineFile: string;
  historicalBaselineFile: string;
  writeBaseline: boolean;
  parityFile: string | null;
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
  businessLabel: string;
  baselineAverageMs: number | null;
  baselineP95Ms: number | null;
}

interface ScenarioBaseline {
  averageMs: number | null;
  p95Ms: number | null;
}

interface BenchmarkBlocker {
  scenario: ScenarioName;
  reason:
    | "invalid_validity_note"
    | "missing_baseline"
    | "p95_regression"
    | "parity_not_clean";
  detail: string;
  currentValue?: number | string | null;
  baselineValue?: number | string | null;
}

function parseArgs(argv: string[]): Map<string, string> {
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

export function parseMetaShortGateBenchmarkArgs(argv: string[]): ParsedBenchmarkArgs {
  const args = parseArgs(argv);
  const businessId =
    args.get("business-id") ?? args.get("businessId") ?? META_SHORT_GATE_PRIMARY_CANARY.businessId;
  const startDate = args.get("start-date") ?? args.get("startDate");
  const endDate = args.get("end-date") ?? args.get("endDate");
  if (!startDate || !endDate) {
    throw new Error("Missing required args. Required: --start-date --end-date");
  }
  return {
    businessId,
    startDate,
    endDate,
    creativeBusinessId:
      args.get("creative-business-id") ?? args.get("creativeBusinessId") ?? null,
    iterations: Number(args.get("iterations") ?? "2"),
    jsonOut: args.get("json-out") ?? args.get("jsonOut") ?? null,
    markdownOut: args.get("markdown-out") ?? args.get("markdownOut") ?? null,
    baselineFile: args.get("baseline-file") ?? META_SHORT_GATE_BASELINE_FILE,
    historicalBaselineFile:
      args.get("historical-baseline-file") ?? META_HISTORICAL_CREATIVES_BASELINE_FILE,
    writeBaseline: (args.get("write-baseline") ?? "false") === "true",
    parityFile: args.get("parity-file") ?? args.get("parityFile") ?? null,
  };
}

function describeScenarioError(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").trim();
  }
  return String(error).replace(/\s+/g, " ").trim();
}

export function isAcceptedMetaValidityNote(value: string) {
  const parts = value
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((entry) => entry === "valid" || entry.startsWith("valid:"));
}

function loadScenarioBaseline(pathValue: string, scenarioName: ScenarioName): ScenarioBaseline {
  try {
    const payload = JSON.parse(readFileSync(resolve(pathValue), "utf8")) as {
      scenarios?: Array<{ name?: string; averageMs?: number; p95Ms?: number }>;
    };
    const scenario = payload.scenarios?.find((entry) => entry.name === scenarioName);
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

export function classifyMetaBenchmarkScenario(input: {
  result: ScenarioResult;
  parityBlockingDiffCount: number;
  writeBaseline: boolean;
}) {
  const blockers: BenchmarkBlocker[] = [];
  if (!isAcceptedMetaValidityNote(input.result.validityNote)) {
    blockers.push({
      scenario: input.result.name,
      reason: "invalid_validity_note",
      detail: `Validity note ${input.result.validityNote} is not accepted for Meta short gate.`,
      currentValue: input.result.validityNote,
    });
  }
  if (
    input.result.name !== "meta_creatives_30d" &&
    input.result.baselineP95Ms == null &&
    !input.writeBaseline
  ) {
    blockers.push({
      scenario: input.result.name,
      reason: "missing_baseline",
      detail: "Meta short-gate baseline is missing for this scenario.",
    });
  }
  if (
    input.result.name !== "meta_creatives_30d" &&
    input.parityBlockingDiffCount > 0 &&
    (input.result.baselineAverageMs !== null || input.result.baselineP95Ms !== null)
  ) {
    blockers.push({
      scenario: input.result.name,
      reason: "parity_not_clean",
      detail: "Parity must be clean before row-count drift can be treated as non-blocking.",
    });
  }
  if (input.result.baselineP95Ms != null) {
    const absoluteDelta = input.result.p95Ms - input.result.baselineP95Ms;
    const percentDelta =
      input.result.baselineP95Ms > 0
        ? (absoluteDelta / input.result.baselineP95Ms) * 100
        : 0;
    if (absoluteDelta > 500 && percentDelta > 20) {
      blockers.push({
        scenario: input.result.name,
        reason: "p95_regression",
        detail: `p95 regressed by ${absoluteDelta.toFixed(2)}ms (${percentDelta.toFixed(2)}%).`,
        currentValue: input.result.p95Ms,
        baselineValue: input.result.baselineP95Ms,
      });
    }
  }
  return blockers;
}

async function measureScenario(
  input: {
    name: ScenarioName;
    iterations: number;
    businessId: string;
    businessLabel: string;
    baseline: ScenarioBaseline;
    operation: () => Promise<{ sampleCardinality: number | null; validityNote: string }>;
  },
): Promise<ScenarioResult> {
  const durations: number[] = [];
  const sampleCardinalities: Array<number | null> = [];
  const validityNotes: string[] = [];
  for (let iteration = 0; iteration < input.iterations; iteration += 1) {
    const startedAt = performance.now();
    try {
      const result = await input.operation();
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
    businessLabel: input.businessLabel,
    baselineAverageMs: input.baseline.averageMs,
    baselineP95Ms: input.baseline.p95Ms,
  };
}

function loadParityBlockingDiffCount(pathValue: string | null) {
  if (!pathValue) return 0;
  try {
    const payload = JSON.parse(readFileSync(resolve(pathValue), "utf8")) as {
      summary?: { blockingDiffCount?: number };
    };
    return Number(payload.summary?.blockingDiffCount ?? 0);
  } catch {
    return 0;
  }
}

function writeMetaShortGateBaseline(input: {
  filePath: string;
  businessId: string;
  startDate: string;
  endDate: string;
  creativeBusinessId: string;
  scenarios: ScenarioResult[];
}) {
  const payload = {
    createdAt: new Date().toISOString(),
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    creativeBusinessId: input.creativeBusinessId,
    historicalCreativesBaselineFile: META_HISTORICAL_CREATIVES_BASELINE_FILE,
    scenarios: input.scenarios
      .filter((scenario) => scenario.name !== "meta_creatives_30d")
      .map((scenario) => ({
        name: scenario.name,
        averageMs: scenario.averageMs,
        p95Ms: scenario.p95Ms,
        sampleCardinality: scenario.sampleCardinality,
        validityNote: scenario.validityNote,
      })),
  };
  writeFileSync(resolve(input.filePath), JSON.stringify(payload, null, 2));
}

function buildMarkdownSummary(input: {
  results: ScenarioResult[];
  blockers: BenchmarkBlocker[];
  businessId: string;
  creativeBusinessId: string;
  startDate: string;
  endDate: string;
  baselineFile: string;
}) {
  const lines = [
    "# Meta Short Gate Benchmark",
    "",
    `- businessId: \`${input.businessId}\``,
    `- creativeBusinessId: \`${input.creativeBusinessId}\``,
    `- range: \`${input.startDate}\` -> \`${input.endDate}\``,
    `- baselineFile: \`${input.baselineFile}\``,
    "",
    "## Scenarios",
  ];
  for (const result of input.results) {
    lines.push(
      `- \`${result.name}\`: avg ${result.averageMs}ms, p95 ${result.p95Ms}ms, validity ${result.validityNote}, rows ${result.sampleCardinality ?? "null"}`,
    );
  }
  lines.push("", "## Blockers");
  if (input.blockers.length === 0) {
    lines.push("- none");
  } else {
    for (const blocker of input.blockers) {
      lines.push(`- \`${blocker.scenario}\`: ${blocker.reason} — ${blocker.detail}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const parsed = parseMetaShortGateBenchmarkArgs(process.argv.slice(2));
  const creativeSelection = await selectMetaCreativeGateBusiness({
    requestedBusinessId: parsed.businessId,
    overrideBusinessId: parsed.creativeBusinessId,
    fetchPayload: async (businessId) =>
      getMetaCreativesDbPayload({
        businessId,
        start: parsed.startDate,
        end: parsed.endDate,
        groupBy: "creative",
        format: "all",
        sort: "roas",
        mediaMode: "metadata",
      }),
  });
  const historicalCreativesBaseline = loadScenarioBaseline(
    parsed.historicalBaselineFile,
    "meta_creatives_30d",
  );
  const shortGateCampaignBaseline = loadScenarioBaseline(
    parsed.baselineFile,
    "meta_campaigns_30d",
  );
  const shortGateAdSetBaseline = loadScenarioBaseline(
    parsed.baselineFile,
    "meta_adsets_30d",
  );
  const shortGateBreakdownBaseline = loadScenarioBaseline(
    parsed.baselineFile,
    "meta_breakdowns_30d",
  );
  const parityBlockingDiffCount = loadParityBlockingDiffCount(parsed.parityFile);
  const results = [
    await measureScenario({
      name: "meta_creatives_30d",
      iterations: parsed.iterations,
      businessId: creativeSelection.selectedBusinessId,
      businessLabel: creativeSelection.selectedBusinessLabel,
      baseline: historicalCreativesBaseline,
      operation: async () => {
        const creatives = await getMetaCreativesDbPayload({
          businessId: creativeSelection.selectedBusinessId,
          start: parsed.startDate,
          end: parsed.endDate,
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
        };
      },
    }),
    await measureScenario({
      name: "meta_campaigns_30d",
      iterations: parsed.iterations,
      businessId: parsed.businessId,
      businessLabel: META_SHORT_GATE_PRIMARY_CANARY.label,
      baseline: shortGateCampaignBaseline,
      operation: async () => {
        const campaigns = await getMetaCampaignsForRange({
          businessId: parsed.businessId,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          includePrev: true,
        });
        return {
          sampleCardinality: Array.isArray(campaigns.rows) ? campaigns.rows.length : null,
          validityNote: campaigns.status === "ok" ? "valid" : `status:${campaigns.status ?? "unknown"}`,
        };
      },
    }),
    await measureScenario({
      name: "meta_adsets_30d",
      iterations: parsed.iterations,
      businessId: parsed.businessId,
      businessLabel: META_SHORT_GATE_PRIMARY_CANARY.label,
      baseline: shortGateAdSetBaseline,
      operation: async () => {
        const adsets = await getMetaAdSetsForRange({
          businessId: parsed.businessId,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          includePrev: true,
        });
        return {
          sampleCardinality: Array.isArray(adsets.rows) ? adsets.rows.length : null,
          validityNote: adsets.status === "ok" ? "valid" : `status:${adsets.status ?? "unknown"}`,
        };
      },
    }),
    await measureScenario({
      name: "meta_breakdowns_30d",
      iterations: parsed.iterations,
      businessId: parsed.businessId,
      businessLabel: META_SHORT_GATE_PRIMARY_CANARY.label,
      baseline: shortGateBreakdownBaseline,
      operation: async () => {
        const breakdowns = await getMetaBreakdownsForRange({
          businessId: parsed.businessId,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
        });
        return {
          sampleCardinality:
            breakdowns.age.length +
            breakdowns.location.length +
            breakdowns.placement.length +
            breakdowns.budget.campaign.length +
            breakdowns.budget.adset.length,
          validityNote: breakdowns.status === "ok" ? "valid" : `status:${breakdowns.status ?? "unknown"}`,
        };
      },
    }),
  ] satisfies ScenarioResult[];

  if (parsed.writeBaseline) {
    writeMetaShortGateBaseline({
      filePath: parsed.baselineFile,
      businessId: parsed.businessId,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      creativeBusinessId: creativeSelection.selectedBusinessId,
      scenarios: results,
    });
  }

  const blockers = results.flatMap((result) =>
    classifyMetaBenchmarkScenario({
      result,
      parityBlockingDiffCount,
      writeBaseline: parsed.writeBaseline,
    }),
  );
  const markdown = buildMarkdownSummary({
    results,
    blockers,
    businessId: parsed.businessId,
    creativeBusinessId: creativeSelection.selectedBusinessId,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    baselineFile: parsed.baselineFile,
  });
  if (parsed.markdownOut) {
    writeFileSync(resolve(parsed.markdownOut), markdown);
  }

  const artifact = {
    capturedAt: new Date().toISOString(),
    businessId: parsed.businessId,
    creativeBusinessId: creativeSelection.selectedBusinessId,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    writeBaseline: parsed.writeBaseline,
    parityBlockingDiffCount,
    blockers,
    results,
    markdown,
  };
  if (parsed.jsonOut) {
    writeFileSync(resolve(parsed.jsonOut), JSON.stringify(artifact, null, 2));
  }
  console.log(JSON.stringify(artifact, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
