import path from "node:path";
import {
  buildNormalizationRunDir,
  getRequiredCliValue,
  getOptionalCliValue,
  parseCliArgs,
  readJsonFile,
  writeJsonFile,
  writeTextFile,
} from "./db-normalization-support";

type CapturePayload = {
  capturedAt: string;
  stage: string;
  databaseState?: {
    databaseSize?: { database_size_bytes?: number; database_name?: string } | null;
    familySizeTotals?: Record<string, { tableSizeBytes: number; indexSizeBytes: number; totalSizeBytes: number }>;
    relationSizes?: Array<{ table_name?: string; total_size_bytes?: number; table_size_bytes?: number; index_size_bytes?: number }>;
    connectionSummary?: Array<Record<string, unknown>>;
    blockedLocks?: Array<Record<string, unknown>>;
    longTransactions?: Array<Record<string, unknown>>;
    cacheHitStats?: Array<Record<string, unknown>>;
    columnShapeSummary?: Record<string, { jsonbColumns: number; textArrayColumns: number }>;
  };
  baselineSqlResults?: Array<{ index: number; rowCount?: number; error?: string | null }>;
  readExplainPlans?: Array<{ name: string; executionTimeMs?: number | null; planningTimeMs?: number | null }>;
  readBenchmark?: {
    scenarios?: Array<{
      name: string;
      averageMs?: number;
      minMs?: number;
      maxMs?: number;
      p50Ms?: number;
      p95Ms?: number;
      validityNote?: string;
    }>;
  } | null;
  writeBenchmark?: {
    scenarios?: Array<{
      name: string;
      averageMs?: number;
      minMs?: number;
      maxMs?: number;
      p50Ms?: number;
      p95Ms?: number;
      validityNote?: string;
    }>;
    explainPlans?: Array<{ name: string; executionTimeMs?: number | null; planningTimeMs?: number | null }>;
  } | null;
};

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSignedNumber(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function compareScenarioSets(
  beforeScenarios: Array<{ name: string; averageMs?: number; p50Ms?: number; p95Ms?: number; validityNote?: string }> | undefined,
  afterScenarios: Array<{ name: string; averageMs?: number; p50Ms?: number; p95Ms?: number; validityNote?: string }> | undefined,
) {
  const beforeMap = new Map((beforeScenarios ?? []).map((scenario) => [scenario.name, scenario]));
  const afterMap = new Map((afterScenarios ?? []).map((scenario) => [scenario.name, scenario]));
  const names = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();

  return names.map((name) => {
    const before = beforeMap.get(name);
    const after = afterMap.get(name);
    const beforeAvg = toNumber(before?.averageMs);
    const afterAvg = toNumber(after?.averageMs);
    const averageDeltaMs = afterAvg - beforeAvg;
    const averageDeltaPercent =
      beforeAvg > 0 ? Number((((afterAvg - beforeAvg) / beforeAvg) * 100).toFixed(2)) : null;
    return {
      name,
      before: before ?? null,
      after: after ?? null,
      averageDeltaMs: Number(averageDeltaMs.toFixed(2)),
      averageDeltaPercent,
      p50DeltaMs: Number((toNumber(after?.p50Ms) - toNumber(before?.p50Ms)).toFixed(2)),
      p95DeltaMs: Number((toNumber(after?.p95Ms) - toNumber(before?.p95Ms)).toFixed(2)),
      validityChanged: before?.validityNote !== after?.validityNote,
    };
  });
}

function compareExplainSets(
  beforePlans: Array<{ name: string; executionTimeMs?: number | null; planningTimeMs?: number | null }> | undefined,
  afterPlans: Array<{ name: string; executionTimeMs?: number | null; planningTimeMs?: number | null }> | undefined,
) {
  const beforeMap = new Map((beforePlans ?? []).map((plan) => [plan.name, plan]));
  const afterMap = new Map((afterPlans ?? []).map((plan) => [plan.name, plan]));
  const names = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();
  return names.map((name) => {
    const before = beforeMap.get(name);
    const after = afterMap.get(name);
    return {
      name,
      beforeExecutionTimeMs: before?.executionTimeMs ?? null,
      afterExecutionTimeMs: after?.executionTimeMs ?? null,
      executionTimeDeltaMs:
        before?.executionTimeMs != null && after?.executionTimeMs != null
          ? Number((after.executionTimeMs - before.executionTimeMs).toFixed(2))
          : null,
      beforePlanningTimeMs: before?.planningTimeMs ?? null,
      afterPlanningTimeMs: after?.planningTimeMs ?? null,
      planningTimeDeltaMs:
        before?.planningTimeMs != null && after?.planningTimeMs != null
          ? Number((after.planningTimeMs - before.planningTimeMs).toFixed(2))
          : null,
    };
  });
}

function compareBaselineResults(
  beforeResults: Array<{ index: number; rowCount?: number; error?: string | null }> | undefined,
  afterResults: Array<{ index: number; rowCount?: number; error?: string | null }> | undefined,
) {
  const beforeMap = new Map((beforeResults ?? []).map((result) => [result.index, result]));
  const afterMap = new Map((afterResults ?? []).map((result) => [result.index, result]));
  const indexes = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort((left, right) => left - right);
  return indexes.map((index) => {
    const before = beforeMap.get(index);
    const after = afterMap.get(index);
    return {
      index,
      beforeRowCount: before?.rowCount ?? null,
      afterRowCount: after?.rowCount ?? null,
      rowCountDelta:
        before?.rowCount != null && after?.rowCount != null ? after.rowCount - before.rowCount : null,
      beforeError: before?.error ?? null,
      afterError: after?.error ?? null,
      errorChanged: (before?.error ?? null) !== (after?.error ?? null),
    };
  });
}

function buildMarkdownSummary(input: {
  before: CapturePayload;
  after: CapturePayload;
  databaseSizeDeltaBytes: number;
  familySizeChanges: Array<Record<string, unknown>>;
  readBenchmarkDiffs: Array<Record<string, unknown>>;
  writeBenchmarkDiffs: Array<Record<string, unknown>>;
  baselineDiffs: Array<Record<string, unknown>>;
  readExplainDiffs: Array<Record<string, unknown>>;
  writeExplainDiffs: Array<Record<string, unknown>>;
  columnShapeDelta: Array<Record<string, unknown>>;
}) {
  const lines: string[] = [];
  lines.push("# DB Normalization Before/After Summary");
  lines.push("");
  lines.push(`- Before: ${input.before.capturedAt}`);
  lines.push(`- After: ${input.after.capturedAt}`);
  lines.push(
    `- Database size delta: ${formatSignedNumber(input.databaseSizeDeltaBytes)} bytes`,
  );
  lines.push("");

  if (input.familySizeChanges.length > 0) {
    lines.push("## Family Size Delta");
    for (const change of input.familySizeChanges) {
      lines.push(
        `- ${change.family}: ${formatSignedNumber(Number(change.totalSizeDeltaBytes ?? 0))} bytes total`,
      );
    }
    lines.push("");
  }

  if (input.columnShapeDelta.length > 0) {
    lines.push("## Column Shape Delta");
    for (const delta of input.columnShapeDelta) {
      lines.push(
        `- ${delta.family}: JSONB ${formatSignedNumber(Number(delta.jsonbDelta ?? 0))}, TEXT[] ${formatSignedNumber(Number(delta.textArrayDelta ?? 0))}`,
      );
    }
    lines.push("");
  }

  if (input.readBenchmarkDiffs.length > 0) {
    lines.push("## Read Benchmark Delta");
    for (const diff of input.readBenchmarkDiffs) {
      lines.push(
        `- ${diff.name}: avg ${formatSignedNumber(Number(diff.averageDeltaMs ?? 0))} ms, p95 ${formatSignedNumber(Number(diff.p95DeltaMs ?? 0))} ms`,
      );
    }
    lines.push("");
  }

  if (input.writeBenchmarkDiffs.length > 0) {
    lines.push("## Write Benchmark Delta");
    for (const diff of input.writeBenchmarkDiffs) {
      lines.push(
        `- ${diff.name}: avg ${formatSignedNumber(Number(diff.averageDeltaMs ?? 0))} ms, p95 ${formatSignedNumber(Number(diff.p95DeltaMs ?? 0))} ms`,
      );
    }
    lines.push("");
  }

  if (input.readExplainDiffs.length > 0 || input.writeExplainDiffs.length > 0) {
    lines.push("## Explain Delta");
    for (const diff of [...input.readExplainDiffs, ...input.writeExplainDiffs]) {
      lines.push(
        `- ${diff.name}: execution ${formatSignedNumber(Number(diff.executionTimeDeltaMs ?? 0))} ms`,
      );
    }
    lines.push("");
  }

  const changedParity = input.baselineDiffs.filter(
    (diff) => diff.rowCountDelta !== null || diff.errorChanged === true,
  );
  if (changedParity.length > 0) {
    lines.push("## Baseline SQL Delta");
    for (const diff of changedParity) {
      lines.push(
        `- Statement ${diff.index}: row delta ${formatSignedNumber(Number(diff.rowCountDelta ?? 0))}, error changed=${String(diff.errorChanged)}`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));
  const hasExplicitDirs =
    parsed.flags.has("before-dir") ||
    parsed.flags.has("after-dir") ||
    parsed.flags.has("out-dir");
  const runDir =
    !hasExplicitDirs || parsed.flags.has("run-dir")
      ? buildNormalizationRunDir({
          runDir: getOptionalCliValue(parsed, "run-dir", null) ?? undefined,
        })
      : null;
  const beforeDir = getOptionalCliValue(parsed, "before-dir", runDir ? path.join(runDir, "before") : null) ?? getRequiredCliValue(parsed, "before-dir");
  const afterDir = getOptionalCliValue(parsed, "after-dir", runDir ? path.join(runDir, "after") : null) ?? getRequiredCliValue(parsed, "after-dir");
  const outDir = getOptionalCliValue(parsed, "out-dir", runDir) ?? getRequiredCliValue(parsed, "out-dir");

  const beforeCapture = readJsonFile<CapturePayload>(path.join(beforeDir, "capture.json"));
  const afterCapture = readJsonFile<CapturePayload>(path.join(afterDir, "capture.json"));

  const beforeDatabaseSize = toNumber(beforeCapture.databaseState?.databaseSize?.database_size_bytes);
  const afterDatabaseSize = toNumber(afterCapture.databaseState?.databaseSize?.database_size_bytes);
  const databaseSizeDeltaBytes = afterDatabaseSize - beforeDatabaseSize;

  const allFamilies = [
    ...new Set([
      ...Object.keys(beforeCapture.databaseState?.familySizeTotals ?? {}),
      ...Object.keys(afterCapture.databaseState?.familySizeTotals ?? {}),
      ...Object.keys(beforeCapture.databaseState?.columnShapeSummary ?? {}),
      ...Object.keys(afterCapture.databaseState?.columnShapeSummary ?? {}),
    ]),
  ].sort();

  const familySizeChanges = allFamilies.map((family) => {
    const before = beforeCapture.databaseState?.familySizeTotals?.[family];
    const after = afterCapture.databaseState?.familySizeTotals?.[family];
    return {
      family,
      beforeTotalSizeBytes: toNumber(before?.totalSizeBytes),
      afterTotalSizeBytes: toNumber(after?.totalSizeBytes),
      totalSizeDeltaBytes:
        toNumber(after?.totalSizeBytes) - toNumber(before?.totalSizeBytes),
      beforeTableSizeBytes: toNumber(before?.tableSizeBytes),
      afterTableSizeBytes: toNumber(after?.tableSizeBytes),
      beforeIndexSizeBytes: toNumber(before?.indexSizeBytes),
      afterIndexSizeBytes: toNumber(after?.indexSizeBytes),
    };
  });

  const columnShapeDelta = allFamilies.map((family) => {
    const before = beforeCapture.databaseState?.columnShapeSummary?.[family];
    const after = afterCapture.databaseState?.columnShapeSummary?.[family];
    return {
      family,
      beforeJsonbColumns: toNumber(before?.jsonbColumns),
      afterJsonbColumns: toNumber(after?.jsonbColumns),
      jsonbDelta: toNumber(after?.jsonbColumns) - toNumber(before?.jsonbColumns),
      beforeTextArrayColumns: toNumber(before?.textArrayColumns),
      afterTextArrayColumns: toNumber(after?.textArrayColumns),
      textArrayDelta:
        toNumber(after?.textArrayColumns) - toNumber(before?.textArrayColumns),
    };
  });

  const readBenchmarkDiffs = compareScenarioSets(
    beforeCapture.readBenchmark?.scenarios,
    afterCapture.readBenchmark?.scenarios,
  );
  const writeBenchmarkDiffs = compareScenarioSets(
    beforeCapture.writeBenchmark?.scenarios,
    afterCapture.writeBenchmark?.scenarios,
  );
  const readExplainDiffs = compareExplainSets(
    beforeCapture.readExplainPlans,
    afterCapture.readExplainPlans,
  );
  const writeExplainDiffs = compareExplainSets(
    beforeCapture.writeBenchmark?.explainPlans,
    afterCapture.writeBenchmark?.explainPlans,
  );
  const baselineDiffs = compareBaselineResults(
    beforeCapture.baselineSqlResults,
    afterCapture.baselineSqlResults,
  );

  const summary = {
    generatedAt: new Date().toISOString(),
    beforeCapturedAt: beforeCapture.capturedAt,
    afterCapturedAt: afterCapture.capturedAt,
    databaseSizeDeltaBytes,
    familySizeChanges,
    columnShapeDelta,
    readBenchmarkDiffs,
    writeBenchmarkDiffs,
    readExplainDiffs,
    writeExplainDiffs,
    baselineDiffs,
    runtimeDelta: {
      blockedLocksDelta:
        (afterCapture.databaseState?.blockedLocks?.length ?? 0) -
        (beforeCapture.databaseState?.blockedLocks?.length ?? 0),
      longTransactionsDelta:
        (afterCapture.databaseState?.longTransactions?.length ?? 0) -
        (beforeCapture.databaseState?.longTransactions?.length ?? 0),
      connectionGroupsDelta:
        (afterCapture.databaseState?.connectionSummary?.length ?? 0) -
        (beforeCapture.databaseState?.connectionSummary?.length ?? 0),
    },
  };

  const markdown = buildMarkdownSummary({
    before: beforeCapture,
    after: afterCapture,
    databaseSizeDeltaBytes,
    familySizeChanges,
    readBenchmarkDiffs,
    writeBenchmarkDiffs,
    baselineDiffs,
    readExplainDiffs,
    writeExplainDiffs,
    columnShapeDelta,
  });

  await writeJsonFile(path.join(outDir, "summary.json"), summary);
  await writeTextFile(path.join(outDir, "summary.md"), markdown);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
