import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  resolveCreativeCanonicalDecisionForAuditRow,
  type CreativeCanonicalAction,
} from "@/lib/creative-canonical-decision";

const ACTIONS: CreativeCanonicalAction[] = [
  "scale",
  "test_more",
  "protect",
  "refresh",
  "cut",
  "diagnose",
];

interface RawMetricsFile {
  rows: Array<Record<string, unknown>>;
}

function argValue(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function stratumKeys(row: Record<string, unknown>) {
  const decision = resolveCreativeCanonicalDecisionForAuditRow(row);
  const spend = Number(row.spend ?? 0);
  const fatigue = String(row.fatigueStatus ?? "unknown").toLowerCase() || "unknown";
  const active = row.activeDelivery === true ? "active" : "inactive";
  const format = String(row.creativeFormat ?? row.formatPattern ?? "unknown").toLowerCase() || "unknown";
  return [
    `action:${decision.action}`,
    `spend:${spend >= 250 ? "high" : "low"}`,
    `delivery:${active}`,
    `fatigue:${fatigue}`,
    `format:${format}`,
  ];
}

function deterministicRank(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickStratified(rows: Array<Record<string, unknown>>, size: number) {
  const targetSize = Math.max(1, Math.min(size, rows.length));
  const selected = new Map<string, Record<string, unknown>>();
  const idFor = (row: Record<string, unknown>) => String(row.rowId ?? row.creativeId);
  const addRows = (candidates: Array<Record<string, unknown>>, count: number, salt: string) => {
    const sorted = candidates
      .filter((row) => !selected.has(idFor(row)))
      .sort((left, right) =>
        deterministicRank(`${salt}:${idFor(left)}`) - deterministicRank(`${salt}:${idFor(right)}`),
      );
    for (const row of sorted.slice(0, Math.max(0, count))) {
      if (selected.size >= targetSize) break;
      selected.set(idFor(row), row);
    }
  };
  const ordinaryRows = rows.filter((row) => {
    const decision = resolveCreativeCanonicalDecisionForAuditRow(row);
    return decision.confidence.label !== "low" && decision.action !== "diagnose";
  });
  addRows(ordinaryRows, Math.ceil(targetSize * 0.2), "ordinary-random-control");

  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    for (const key of stratumKeys(row)) {
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
  }
  const sortedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [key, groupRows] of sortedGroups) {
    const alreadySelectedInGroup = groupRows.filter((row) => selected.has(idFor(row))).length;
    const missing = Math.max(0, Math.min(5, groupRows.length) - alreadySelectedInGroup);
    addRows(groupRows, missing, key);
  }
  const remainder = rows
    .filter((row) => !selected.has(idFor(row)))
    .sort((left, right) =>
      deterministicRank(`random:${idFor(left)}`) -
      deterministicRank(`random:${idFor(right)}`),
    );
  for (const row of remainder) {
    if (selected.size >= targetSize) break;
    selected.set(idFor(row), row);
  }
  return [...selected.values()];
}

function toElRateRow(row: Record<string, unknown>) {
  const decision = resolveCreativeCanonicalDecisionForAuditRow(row);
  return {
    rowId: row.rowId,
    business: row.business,
    creativeId: row.creativeId,
    creativeName: row.creativeName,
    creativeFormat: row.creativeFormat,
    thumbnailUrl: row.thumbnailUrl ?? row.imageUrl ?? row.previewUrl ?? null,
    metrics: {
      spend: row.spend,
      purchases: row.purchases,
      roas: row.roas,
      cpa: row.cpa,
      ctr: row.ctr,
      benchmarkRoas: row.benchmarkRoas,
      baselineMedianRoas: row.baselineMedianRoas,
      fatigueStatus: row.fatigueStatus,
      trustState: row.trustState,
      activeDelivery: row.activeDelivery,
    },
    modelSuggestion: {
      action: decision.action,
      actionReadiness: decision.actionReadiness,
      confidence: decision.confidence,
      primaryReason: decision.primaryReason,
      reasonChips: decision.reasonChips,
    },
    userRating: {
      action: null as CreativeCanonicalAction | null,
      reasonChips: [] as string[],
      overrideSeverity: null as "agree" | "minor_adjustment" | "strong_disagree" | null,
    },
    actionChoices: ACTIONS,
  };
}

async function main() {
  const inputPath = argValue(
    "input",
    "docs/team-comms/happy-harbor/audit-F-iwastore-theswaf/raw-metrics.json",
  );
  const outputPath = argValue(
    "output",
    "docs/team-comms/happy-harbor/audit-H/elrate-sample-50.json",
  );
  const size = Number(argValue("size", "50"));
  const raw = JSON.parse(await readFile(inputPath, "utf8")) as RawMetricsFile;
  const sample = pickStratified(raw.rows, Math.max(1, Math.min(size, raw.rows.length)));
  const payload = {
    generatedAt: new Date().toISOString(),
    source: inputPath,
    size: sample.length,
    sampling: "stratified_min5_where_available_by_action_spend_delivery_fatigue_format_with_20pct_random_ordinary_controls",
    minimumRowsPerStratumWhereAvailable: 5,
    randomOrdinaryControlShare: 0.2,
    rows: sample.map(toElRateRow),
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${sample.length} el-rate rows to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
