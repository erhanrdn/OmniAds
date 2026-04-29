import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  resolveCreativeVerdict,
  type CreativeAction,
  type CreativeActionReadiness,
  type CreativePhase,
  type CreativeVerdict,
  type CreativeVerdictHeadline,
  type CreativeVerdictInput,
} from "@/lib/creative-verdict";

const AUDIT_A_DIR = "docs/team-comms/happy-harbor/audit-A";
const AUDIT_E_DIR = "docs/team-comms/happy-harbor/audit-E";
const SAMPLE_PATH = path.join(AUDIT_A_DIR, "sample-200.json");
const OUTPUT_PATH = path.join(AUDIT_E_DIR, "codex-rating-v2.json");

type SampleRow = {
  rowId: string;
  companyAlias: string;
  accountAlias: string;
  campaignAlias: string;
  adSetAlias: string;
  creativeAlias: string;
  delivery: CreativeVerdictInput["delivery"];
  metrics: CreativeVerdictInput["metrics"];
  baseline: CreativeVerdictInput["baseline"];
  commercialTruth: {
    targetPackConfigured: boolean;
    businessValidationStatus: string | null;
  };
  context: CreativeVerdictInput["context"];
  campaignName?: string | null;
  campaign?: {
    name?: string | null;
    metaFamily?: string | null;
    lane?: string | null;
  } | null;
};

type Rating = {
  rowId: string;
  phase: CreativePhase;
  headline: CreativeVerdictHeadline;
  action: CreativeAction;
  actionReadiness: CreativeActionReadiness;
  confidence: number;
  primaryReason: string;
  blockers: string[];
};

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function targetRoasForSample(row: SampleRow) {
  if (!row.commercialTruth.targetPackConfigured) return null;
  const medianRoas = row.baseline.selected?.medianRoas;
  return typeof medianRoas === "number" && Number.isFinite(medianRoas) && medianRoas > 0
    ? medianRoas
    : 1;
}

function campaignInput(row: SampleRow): CreativeVerdictInput["campaign"] {
  return {
    metaFamily: row.campaign?.metaFamily ?? null,
    lane: row.campaign?.lane ?? null,
    namingConvention: row.campaign?.name ?? row.campaignName ?? null,
  };
}

export function resolveSampleVerdict(row: SampleRow, generatedAt: string) {
  return resolveCreativeVerdict({
    metrics: row.metrics,
    delivery: row.delivery,
    baseline: row.baseline,
    commercialTruth: {
      targetPackConfigured: row.commercialTruth.targetPackConfigured,
      targetRoas: targetRoasForSample(row),
      businessValidationStatus: row.commercialTruth.businessValidationStatus,
    },
    context: row.context,
    campaign: campaignInput(row),
    now: generatedAt,
  });
}

function reasonFromVerdict(verdict: CreativeVerdict) {
  const primary = verdict.evidence
    .filter((item) => item.weight === "primary")
    .map((item) => item.tag);
  const supporting = verdict.evidence
    .filter((item) => item.weight !== "primary")
    .map((item) => item.tag);
  return [
    primary.length > 0 ? `primary=${primary.join(",")}` : "primary=none",
    supporting.length > 0 ? `supporting=${supporting.slice(0, 4).join(",")}` : "supporting=none",
  ].join("; ");
}

export function ratingFromVerdict(rowId: string, verdict: CreativeVerdict): Rating {
  return {
    rowId,
    phase: verdict.phase ?? "test",
    headline: verdict.headline,
    action: verdict.action,
    actionReadiness: verdict.actionReadiness,
    confidence: verdict.confidence,
    primaryReason: reasonFromVerdict(verdict),
    blockers: verdict.blockers,
  };
}

function countBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = key(item);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function main() {
  const generatedAt = new Date().toISOString();
  const sample = readJson<{ version: string; rows: SampleRow[] }>(SAMPLE_PATH);
  const rows = sample.rows.map((row) =>
    ratingFromVerdict(row.rowId, resolveSampleVerdict(row, generatedAt)),
  );

  writeJson(OUTPUT_PATH, {
    version: "happy-harbor.auditE.codexRatingV2.v1",
    generatedAt,
    sourceSample: {
      path: SAMPLE_PATH,
      version: sample.version,
      rowCount: sample.rows.length,
    },
    rater: {
      team: "Codex",
      stance: "canonical resolver rerate after Faz B/C policy normalization",
      policy: "lib/creative-verdict.ts:resolveCreativeVerdict",
      note: "This is intentionally distinct from audit-A/codex-rating.json, which remains the frozen Faz A independent rating.",
    },
    distribution: {
      phase: countBy(rows, (row) => row.phase),
      headline: countBy(rows, (row) => row.headline),
      action: countBy(rows, (row) => row.action),
      actionReadiness: countBy(rows, (row) => row.actionReadiness),
    },
    rows,
  });

  console.log(
    JSON.stringify(
      {
        output: OUTPUT_PATH,
        rows: rows.length,
        actionDistribution: countBy(rows, (row) => row.action),
      },
      null,
      2,
    ),
  );
}

main();
