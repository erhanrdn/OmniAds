import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  creativeActionToPrimaryDecision,
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
const CLAUDE_RATING_PATH = path.join(AUDIT_A_DIR, "claude-rating.json");
const CODEX_V2_RATING_PATH = path.join(AUDIT_E_DIR, "codex-rating-v2.json");
const LIVE_AUDIT_PATH =
  "docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit/artifacts/sanitized-live-firm-audit.json";
const EXTENDED_COHORT_PATH = path.join(AUDIT_E_DIR, "extended-cohort.json");
const GOLD_V1_PATH = path.join(AUDIT_E_DIR, "gold-v1.json");
const TARGET_GOLD_ROWS = 1500;

const HEADLINES = [
  "Test Winner",
  "Test Loser",
  "Test Inconclusive",
  "Scale Performer",
  "Scale Underperformer",
  "Scale Fatiguing",
  "Needs Diagnosis",
] as const satisfies readonly CreativeVerdictHeadline[];
const ACTIONS = [
  "scale",
  "keep_testing",
  "protect",
  "refresh",
  "cut",
  "diagnose",
] as const satisfies readonly CreativeAction[];
const READINESS = ["ready", "needs_review", "blocked"] as const satisfies readonly CreativeActionReadiness[];

type Rating = {
  rowId: string;
  phase: CreativePhase;
  headline: CreativeVerdictHeadline;
  action: CreativeAction;
  actionReadiness: CreativeActionReadiness;
  confidence: number | null;
  primaryReason: string;
  blockers: string[];
};

type SampleRow = {
  rowId: string;
  companyAlias: string;
  accountAlias: string;
  campaignAlias: string;
  adSetAlias: string;
  creativeAlias: string;
  business?: { spendTier?: string | null; businessSpend30d?: number | null };
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

type MetricWindow = {
  spend?: number | null;
  purchaseValue?: number | null;
  roas?: number | null;
  cpa?: number | null;
  purchases?: number | null;
  impressions?: number | null;
  linkClicks?: number | null;
};

type LiveAuditRow = {
  companyAlias: string;
  accountAlias: string;
  campaignAlias: string;
  adSetAlias: string;
  creativeAlias: string;
  activeStatus: boolean;
  campaignStatus: string | null;
  adSetStatus: string | null;
  spend30d: number;
  recent7d: MetricWindow | null;
  mid30d: MetricWindow | null;
  long90d: MetricWindow | null;
  mediaBuyerScorecard?: {
    metrics?: {
      roasToBenchmark?: number | null;
      cpaToBenchmark?: number | null;
      spendToMedian?: number | null;
      trendRoasRatio?: number | null;
    } | null;
  } | null;
  baselineReliability: string;
  accountBaseline: {
    reliability?: string | null;
    medianRoas?: number | null;
    medianCpa?: number | null;
    medianSpend?: number | null;
  };
  campaignBaseline: {
    reliability?: string | null;
    medianRoas?: number | null;
    medianCpa?: number | null;
    medianSpend?: number | null;
  } | null;
  commercialTruthAvailability: {
    targetPackConfigured: boolean;
    missingInputs: string[];
  };
  businessValidationStatus: string | null;
  trustState: string | null;
  deploymentCompatibility: string | null;
  deploymentTargetLane: string | null;
  campaignContextLimited: boolean;
};

type GoldRow = {
  rowId: string;
  source: "sample-200-core" | "extended-live-cohort";
  aliases: {
    company: string;
    account: string;
    campaign: string;
    adSet: string;
    creative: string;
  };
  resolverInput: CreativeVerdictInput;
  gold: {
    primaryDecision: ReturnType<typeof creativeActionToPrimaryDecision>;
    action: CreativeAction;
    headline: CreativeVerdictHeadline;
    phase: CreativePhase;
    actionReadiness: CreativeActionReadiness;
    status: "three_rater_joined" | "resolver_codex_joined_claude_tbd";
  };
  ratings: {
    adsecuteResolver: Rating;
    codexV2: Rating;
    claude: Rating | null;
  };
};

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function targetRoasFromSample(row: SampleRow) {
  if (!row.commercialTruth.targetPackConfigured) return null;
  return finite(row.baseline.selected?.medianRoas) && row.baseline.selected!.medianRoas! > 0
    ? row.baseline.selected!.medianRoas!
    : 1;
}

function sampleInput(row: SampleRow, generatedAt: string): CreativeVerdictInput {
  return {
    metrics: row.metrics,
    delivery: row.delivery,
    baseline: row.baseline,
    commercialTruth: {
      targetPackConfigured: row.commercialTruth.targetPackConfigured,
      targetRoas: targetRoasFromSample(row),
      businessValidationStatus: row.commercialTruth.businessValidationStatus,
    },
    context: row.context,
    campaign: {
      metaFamily: row.campaign?.metaFamily ?? null,
      lane: row.campaign?.lane ?? null,
      namingConvention: row.campaign?.name ?? row.campaignName ?? null,
    },
    now: generatedAt,
  };
}

function preferredBaseline(row: LiveAuditRow) {
  if (finite(row.campaignBaseline?.medianRoas) && row.campaignBaseline!.medianRoas! > 0) {
    return row.campaignBaseline!;
  }
  return row.accountBaseline;
}

function liveInput(row: LiveAuditRow, generatedAt: string): CreativeVerdictInput {
  const baseline = preferredBaseline(row);
  const metrics = row.mediaBuyerScorecard?.metrics ?? null;
  const targetPackConfigured = row.commercialTruthAvailability.targetPackConfigured;
  return {
    metrics: {
      spend30d: row.spend30d,
      purchases30d: row.mid30d?.purchases ?? null,
      roas30d: row.mid30d?.roas ?? null,
      cpa30d: row.mid30d?.cpa ?? null,
      recent7d: row.recent7d
        ? {
            spend: row.recent7d.spend ?? null,
            roas: row.recent7d.roas ?? null,
            purchases: row.recent7d.purchases ?? null,
          }
        : null,
      mid30d: row.mid30d
        ? {
            spend: row.mid30d.spend ?? null,
            roas: row.mid30d.roas ?? null,
            purchases: row.mid30d.purchases ?? null,
          }
        : null,
      long90d: row.long90d
        ? {
            spend: row.long90d.spend ?? null,
            roas: row.long90d.roas ?? null,
            purchases: row.long90d.purchases ?? null,
          }
        : null,
      relative: {
        roasToBenchmark: metrics?.roasToBenchmark ?? null,
        cpaToBenchmark: metrics?.cpaToBenchmark ?? null,
        spendToMedian: metrics?.spendToMedian ?? null,
        recent7ToLong90Roas: metrics?.trendRoasRatio ?? null,
      },
    },
    delivery: {
      activeStatus: row.activeStatus,
      campaignStatus: row.campaignStatus,
      adSetStatus: row.adSetStatus,
    },
    baseline: {
      reliability: row.baselineReliability,
      selected: {
        medianRoas: baseline.medianRoas ?? null,
        medianCpa: baseline.medianCpa ?? null,
        medianSpend: baseline.medianSpend ?? null,
      },
    },
    commercialTruth: {
      targetPackConfigured,
      targetRoas:
        targetPackConfigured && finite(baseline.medianRoas) && baseline.medianRoas! > 0
          ? baseline.medianRoas!
          : null,
      businessValidationStatus: row.businessValidationStatus,
    },
    context: {
      trustState: row.trustState,
      deploymentCompatibility: row.deploymentCompatibility,
      campaignIsTestLike: row.campaignContextLimited ? null : false,
    },
    campaign: {
      metaFamily: null,
      lane: row.deploymentTargetLane,
      namingConvention: null,
    },
    now: generatedAt,
  };
}

function reasonFromVerdict(verdict: CreativeVerdict) {
  const primary = verdict.evidence
    .filter((item) => item.weight === "primary")
    .map((item) => item.tag);
  return primary.length > 0 ? `primary=${primary.join(",")}` : "primary=none";
}

function ratingFromVerdict(rowId: string, verdict: CreativeVerdict): Rating {
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

function rowIdFromLive(row: LiveAuditRow) {
  return [
    row.companyAlias,
    row.accountAlias,
    row.campaignAlias,
    row.adSetAlias,
    row.creativeAlias,
  ].join("|");
}

function countBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = key(item);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function agreement<T extends string>(rows: Array<[T, T]>) {
  const matches = rows.filter(([left, right]) => left === right).length;
  return {
    matches,
    total: rows.length,
    agreement: rows.length === 0 ? 0 : matches / rows.length,
  };
}

function buildGoldRow(input: {
  rowId: string;
  source: GoldRow["source"];
  aliases: GoldRow["aliases"];
  resolverInput: CreativeVerdictInput;
  codexV2?: Rating | null;
  claude?: Rating | null;
}) {
  const resolverRating = ratingFromVerdict(
    input.rowId,
    resolveCreativeVerdict(input.resolverInput),
  );
  const codexV2 = input.codexV2 ?? resolverRating;
  return {
    rowId: input.rowId,
    source: input.source,
    aliases: input.aliases,
    resolverInput: input.resolverInput,
    gold: {
      primaryDecision: creativeActionToPrimaryDecision(resolverRating.action),
      action: resolverRating.action,
      headline: resolverRating.headline,
      phase: resolverRating.phase,
      actionReadiness: resolverRating.actionReadiness,
      status: input.claude ? "three_rater_joined" : "resolver_codex_joined_claude_tbd",
    },
    ratings: {
      adsecuteResolver: resolverRating,
      codexV2,
      claude: input.claude ?? null,
    },
  } satisfies GoldRow;
}

function main() {
  const generatedAt = new Date().toISOString();
  const sample = readJson<{ version: string; rows: SampleRow[] }>(SAMPLE_PATH);
  const codexV2 = readJson<{ rows: Rating[] }>(CODEX_V2_RATING_PATH);
  const claude = readJson<{ rows: Rating[] }>(CLAUDE_RATING_PATH);
  const liveAudit = readJson<{
    generatedAt: string;
    auditWindow: unknown;
    rows: LiveAuditRow[];
  }>(LIVE_AUDIT_PATH);

  const codexById = new Map(codexV2.rows.map((row) => [row.rowId, row]));
  const claudeById = new Map(claude.rows.map((row) => [row.rowId, row]));
  const sampleIds = new Set(sample.rows.map((row) => row.rowId));

  const coreRows = sample.rows.map((row) =>
    buildGoldRow({
      rowId: row.rowId,
      source: "sample-200-core",
      aliases: {
        company: row.companyAlias,
        account: row.accountAlias,
        campaign: row.campaignAlias,
        adSet: row.adSetAlias,
        creative: row.creativeAlias,
      },
      resolverInput: sampleInput(row, generatedAt),
      codexV2: codexById.get(row.rowId) ?? null,
      claude: claudeById.get(row.rowId) ?? null,
    }),
  );

  const extendedRows = liveAudit.rows
    .map((row) => ({ rowId: rowIdFromLive(row), row }))
    .filter(({ rowId }) => !sampleIds.has(rowId))
    .map(({ rowId, row }) =>
      buildGoldRow({
        rowId,
        source: "extended-live-cohort",
        aliases: {
          company: row.companyAlias,
          account: row.accountAlias,
          campaign: row.campaignAlias,
          adSet: row.adSetAlias,
          creative: row.creativeAlias,
        },
        resolverInput: liveInput(row, generatedAt),
      }),
    );

  const rows = [...coreRows, ...extendedRows];
  const sampleCoreThreeRater = coreRows.filter((row) => row.ratings.claude);

  const data = {
    version: "happy-harbor.gold-v1.v1",
    generatedAt,
    target: {
      requestedRows: TARGET_GOLD_ROWS,
      actualRows: rows.length,
      status: rows.length >= TARGET_GOLD_ROWS ? "met" : "source_limited",
      note:
        rows.length >= TARGET_GOLD_ROWS
          ? "Target met."
          : "Runtime-readable live source contains fewer than 1,500 unique creative rows; artifact keeps real rows only and does not synthesize labels.",
    },
    source: {
      sampleCore: {
        path: SAMPLE_PATH,
        version: sample.version,
        rows: coreRows.length,
      },
      liveAudit: {
        path: LIVE_AUDIT_PATH,
        generatedAt: liveAudit.generatedAt,
        rows: liveAudit.rows.length,
      },
      extendedCohort: {
        rows: extendedRows.length,
        claudeRatingStatus: "tbd_scope_cap",
      },
    },
    coverage: {
      source: countBy(rows, (row) => row.source),
      business: countBy(rows, (row) => row.aliases.company),
      action: countBy(rows, (row) => row.gold.action),
      headline: countBy(rows, (row) => row.gold.headline),
      phase: countBy(rows, (row) => row.gold.phase),
      actionReadiness: countBy(rows, (row) => row.gold.actionReadiness),
      ratingStatus: countBy(rows, (row) => row.gold.status),
    },
    agreement: {
      sampleCoreRows: sampleCoreThreeRater.length,
      action: {
        adsecuteResolverVsCodexV2: agreement(
          sampleCoreThreeRater.map((row) => [
            row.ratings.adsecuteResolver.action,
            row.ratings.codexV2.action,
          ]),
        ),
        adsecuteResolverVsClaude: agreement(
          sampleCoreThreeRater.map((row) => [
            row.ratings.adsecuteResolver.action,
            row.ratings.claude!.action,
          ]),
        ),
        codexV2VsClaude: agreement(
          sampleCoreThreeRater.map((row) => [
            row.ratings.codexV2.action,
            row.ratings.claude!.action,
          ]),
        ),
      },
      headline: {
        adsecuteResolverVsCodexV2: agreement(
          sampleCoreThreeRater.map((row) => [
            row.ratings.adsecuteResolver.headline,
            row.ratings.codexV2.headline,
          ]),
        ),
        adsecuteResolverVsClaude: agreement(
          sampleCoreThreeRater.map((row) => [
            row.ratings.adsecuteResolver.headline,
            row.ratings.claude!.headline,
          ]),
        ),
        codexV2VsClaude: agreement(
          sampleCoreThreeRater.map((row) => [
            row.ratings.codexV2.headline,
            row.ratings.claude!.headline,
          ]),
        ),
      },
      actionReadiness: {
        adsecuteResolverVsCodexV2: agreement(
          sampleCoreThreeRater.map((row) => [
            row.ratings.adsecuteResolver.actionReadiness,
            row.ratings.codexV2.actionReadiness,
          ]),
        ),
        adsecuteResolverVsClaude: agreement(
          sampleCoreThreeRater.map((row) => [
            row.ratings.adsecuteResolver.actionReadiness,
            row.ratings.claude!.actionReadiness,
          ]),
        ),
        codexV2VsClaude: agreement(
          sampleCoreThreeRater.map((row) => [
            row.ratings.codexV2.actionReadiness,
            row.ratings.claude!.actionReadiness,
          ]),
        ),
      },
      schema: {
        actionCategories: ACTIONS,
        headlineCategories: HEADLINES,
        readinessCategories: READINESS,
      },
    },
    rows,
  };

  writeJson(EXTENDED_COHORT_PATH, {
    version: "happy-harbor.auditE.extendedCohort.v1",
    generatedAt,
    source: data.source.liveAudit,
    target: data.target,
    coverage: {
      rows: extendedRows.length,
      business: countBy(extendedRows, (row) => row.aliases.company),
      action: countBy(extendedRows, (row) => row.gold.action),
      phase: countBy(extendedRows, (row) => row.gold.phase),
      actionReadiness: countBy(extendedRows, (row) => row.gold.actionReadiness),
    },
    rows: extendedRows,
  });
  writeJson(GOLD_V1_PATH, data);

  console.log(
    JSON.stringify(
      {
        goldV1Path: GOLD_V1_PATH,
        extendedCohortPath: EXTENDED_COHORT_PATH,
        actualRows: rows.length,
        targetStatus: data.target.status,
        coreRows: coreRows.length,
        extendedRows: extendedRows.length,
      },
      null,
      2,
    ),
  );
}

main();
