import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  resolveCreativeVerdict,
  type CreativePhase,
  type CreativePhaseSource,
} from "@/lib/creative-verdict";

const AUDIT_A_DIR = "docs/team-comms/happy-harbor/audit-A";
const AUDIT_C_DIR = "docs/team-comms/happy-harbor/audit-C";
const SAMPLE_PATH = path.join(AUDIT_A_DIR, "sample-200.json");
const CLAUDE_RATING_PATH = path.join(AUDIT_A_DIR, "claude-rating.json");
const DATA_PATH = path.join(AUDIT_C_DIR, "phase-calibration.json");
const REPORT_PATH = path.join(AUDIT_C_DIR, "phase-calibration.md");
const TARGET_AGREEMENT = 0.92;

type PhaseRating = {
  rowId: string;
  phase: CreativePhase;
};

type SampleRow = {
  rowId: string;
  delivery: {
    activeStatus: boolean;
    campaignStatus: string | null;
    adSetStatus: string | null;
  };
  metrics: {
    spend30d: number | null;
    purchases30d: number | null;
    roas30d: number | null;
    cpa30d: number | null;
    recent7d: { spend?: number | null; roas?: number | null; purchases?: number | null } | null;
    mid30d: { spend?: number | null; roas?: number | null; purchases?: number | null } | null;
    long90d: { spend?: number | null; roas?: number | null; purchases?: number | null } | null;
    relative: {
      roasToBenchmark: number | null;
      cpaToBenchmark: number | null;
      spendToMedian: number | null;
      recent7ToLong90Roas: number | null;
    };
  };
  baseline: {
    reliability: string;
    selected: {
      medianRoas: number | null;
      medianCpa: number | null;
      medianSpend: number | null;
    };
  };
  commercialTruth: {
    targetPackConfigured: boolean;
    businessValidationStatus: string | null;
  };
  context: {
    trustState: string | null;
    deploymentCompatibility: string | null;
    campaignIsTestLike: boolean | null;
  };
  campaignName?: string | null;
  campaign?: {
    name?: string | null;
    metaFamily?: string | null;
    lane?: string | null;
  } | null;
};

type CalibrationRow = {
  rowId: string;
  claudePhase: CreativePhase;
  resolverPhase: CreativePhase;
  phaseSource: CreativePhaseSource;
  matched: boolean;
  campaignSignal: {
    namingConventionAvailable: boolean;
    metaFamilyAvailable: boolean;
    laneAvailable: boolean;
    legacyCampaignIsTestLike: boolean | null;
  };
  metrics: {
    spend30d: number | null;
    purchases30d: number | null;
    spendToMedian: number | null;
    recent7ToLong90Roas: number | null;
  };
};

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function countBy<T>(items: T[], key: (item: T) => string | number | null | undefined) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = String(key(item) ?? "null");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function targetRoasForSample(row: SampleRow) {
  if (!row.commercialTruth.targetPackConfigured) return null;
  return row.baseline.selected.medianRoas && row.baseline.selected.medianRoas > 0
    ? row.baseline.selected.medianRoas
    : 1;
}

function campaignInput(row: SampleRow) {
  return {
    metaFamily: row.campaign?.metaFamily ?? null,
    lane: row.campaign?.lane ?? null,
    namingConvention: row.campaign?.name ?? row.campaignName ?? null,
  };
}

function resolveSamplePhase(row: SampleRow) {
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
  });
}

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function main() {
  const sample = readJson<{ rows: SampleRow[] }>(SAMPLE_PATH).rows;
  const claudeRows = readJson<{ rows: PhaseRating[] }>(CLAUDE_RATING_PATH).rows;
  const claudeByRowId = new Map(claudeRows.map((row) => [row.rowId, row]));

  const rows: CalibrationRow[] = sample.map((row) => {
    const expected = claudeByRowId.get(row.rowId);
    if (!expected) {
      throw new Error(`Missing Claude rating for ${row.rowId}`);
    }
    const verdict = resolveSamplePhase(row);
    return {
      rowId: row.rowId,
      claudePhase: expected.phase,
      resolverPhase: verdict.phase,
      phaseSource: verdict.phaseSource,
      matched: expected.phase === verdict.phase,
      campaignSignal: {
        namingConventionAvailable: Boolean(row.campaign?.name ?? row.campaignName),
        metaFamilyAvailable: Boolean(row.campaign?.metaFamily),
        laneAvailable: Boolean(row.campaign?.lane),
        legacyCampaignIsTestLike: row.context.campaignIsTestLike,
      },
      metrics: {
        spend30d: row.metrics.spend30d,
        purchases30d: row.metrics.purchases30d,
        spendToMedian: row.metrics.relative.spendToMedian,
        recent7ToLong90Roas: row.metrics.relative.recent7ToLong90Roas,
      },
    };
  });

  const matches = rows.filter((row) => row.matched).length;
  const agreement = matches / rows.length;
  const data = {
    version: "happy-harbor.faz-c.phase-calibration.v1",
    generatedAt: new Date().toISOString(),
    resolver: "lib/creative-verdict.ts:resolveCreativeVerdict",
    target: {
      phaseAgreement: TARGET_AGREEMENT,
    },
    result: {
      matches,
      total: rows.length,
      agreement,
      passed: agreement >= TARGET_AGREEMENT,
    },
    distribution: {
      claudePhase: countBy(rows, (row) => row.claudePhase),
      resolverPhase: countBy(rows, (row) => row.resolverPhase),
      phaseSource: countBy(rows, (row) => row.phaseSource),
    },
    signalCoverage: {
      namingConventionRows: rows.filter((row) => row.campaignSignal.namingConventionAvailable).length,
      metaFamilyRows: rows.filter((row) => row.campaignSignal.metaFamilyAvailable).length,
      laneRows: rows.filter((row) => row.campaignSignal.laneAvailable).length,
      legacyCampaignIsTestLikeRows: rows.filter(
        (row) => row.campaignSignal.legacyCampaignIsTestLike === true,
      ).length,
    },
    disagreements: rows.filter((row) => !row.matched),
    rows,
  };

  mkdirSync(AUDIT_C_DIR, { recursive: true });
  writeFileSync(DATA_PATH, `${JSON.stringify(data, null, 2)}\n`);

  const lines = [
    "# Faz C Phase Calibration",
    "",
    `- Target: ${percent(TARGET_AGREEMENT)} Claude phase agreement`,
    `- Result: ${matches}/${rows.length} (${percent(agreement)})`,
    `- Status: ${agreement >= TARGET_AGREEMENT ? "pass" : "fail"}`,
    "",
    "## Distribution",
    "",
    `- Claude phase: ${JSON.stringify(data.distribution.claudePhase)}`,
    `- Resolver phase: ${JSON.stringify(data.distribution.resolverPhase)}`,
    `- Phase source: ${JSON.stringify(data.distribution.phaseSource)}`,
    "",
    "## Signal Coverage",
    "",
    `- Raw naming convention rows in sample: ${data.signalCoverage.namingConventionRows}`,
    `- Meta family rows in sample: ${data.signalCoverage.metaFamilyRows}`,
    `- Campaign lane rows in sample: ${data.signalCoverage.laneRows}`,
    `- Legacy campaignIsTestLike rows: ${data.signalCoverage.legacyCampaignIsTestLikeRows}`,
    "",
    "## Disagreements",
    "",
    data.disagreements.length === 0
      ? "- None"
      : data.disagreements
          .slice(0, 20)
          .map(
            (row) =>
              `- ${row.rowId}: Claude=${row.claudePhase}, resolver=${row.resolverPhase}, source=${row.phaseSource}`,
          )
          .join("\n"),
    "",
  ];
  writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`);

  if (agreement < TARGET_AGREEMENT) {
    console.error(
      `Phase calibration failed: ${matches}/${rows.length} (${percent(agreement)}) < ${percent(TARGET_AGREEMENT)}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Phase calibration passed: ${matches}/${rows.length} (${percent(agreement)})`);
}

main();
