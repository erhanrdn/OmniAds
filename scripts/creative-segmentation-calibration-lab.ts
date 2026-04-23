import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { mapApiRowToUiRow } from "@/app/(dashboard)/creatives/page-support";
import {
  buildCreativeOperatorItem,
  creativeOperatorSegmentLabel,
  resolveCreativeQuickFilterKey,
} from "@/lib/creative-operator-surface";
import type {
  CreativeDecisionOsCreative,
} from "@/lib/creative-decision-os";
import type { CreativeDecisionInputRow } from "@/lib/ai/generate-creative-decisions";
import { getCreativeDecisionOsForRange } from "@/lib/creative-decision-os-source";
import { buildCreativeOldRuleChallenger } from "@/lib/creative-old-rule-challenger";
import { getDb, resetDbClientCache } from "@/lib/db";
import { getMetaCreativesApiPayload } from "@/lib/meta/creatives-api";
import type { MetaCreativeApiRow } from "@/lib/meta/creatives-types";
import { addDaysToIsoDate } from "@/lib/meta/history";
import type { MetaCreativeRow } from "@/components/creatives/metricConfig";

type SourceBusinessRow = {
  business_id: string;
  max_end_date: string;
  max_row_count: number;
  latest_synced_at: string;
};

type NumericMetricKey =
  | "spend"
  | "purchaseValue"
  | "roas"
  | "cpa"
  | "purchases"
  | "impressions"
  | "linkClicks";

type BaselineSummary = {
  scope: "account" | "campaign";
  reliability: "strong" | "medium" | "weak" | "unavailable";
  creativeCount: number;
  eligibleCreativeCount: number;
  spendBasis: number;
  purchaseBasis: number;
  weightedRoas: number | null;
  weightedCpa: number | null;
  medianRoas: number | null;
  medianCpa: number | null;
  medianSpend: number | null;
  missingContext: string[];
};

type SanitizedCalibrationRow = {
  companyAlias: string;
  accountAlias: string;
  campaignAlias: string;
  adSetAlias: string;
  creativeAlias: string;
  currentDecisionOsInternalSegment: string | null;
  currentUserFacingSegment: string;
  oldRuleChallengerSegment: string | null;
  oldRuleChallengerReason: string | null;
  accountBaseline: BaselineSummary;
  campaignBaseline: BaselineSummary | null;
  spend: number;
  purchases: number;
  cpa: number;
  roas: number;
  value: number;
  recent7d: Partial<Record<NumericMetricKey, number>> | null;
  mid30d: Partial<Record<NumericMetricKey, number>> | null;
  long90d: Partial<Record<NumericMetricKey, number>> | null;
  trendIndicators: {
    fatigueStatus: string | null;
    fatigueConfidence: number | null;
    lifecycleState: string;
    primaryAction: string;
  };
  creativeAgeDays: number;
  frequency: number | null;
  commercialTruthAvailability: {
    targetPackConfigured: boolean;
    missingInputs: string[];
  };
  campaignAdSetContextFlags: {
    campaignPresent: boolean;
    adSetPresent: boolean;
    deploymentCompatibility: string;
    targetLane: string | null;
  };
  evidenceQuality: {
    evidenceSource: string;
    trustState: string;
    surfaceLane: string;
    previewWindow: string | null;
    baselineReliability: string;
  };
  currentPushReadiness: string | null;
  currentInstructionHeadline: string;
  reasonSummary: string;
  missingEvidence: string[];
};

type DatasetArtifact = {
  generatedAt: string;
  source: "creative_segmentation_calibration_lab";
  sanitization: {
    rawIdsIncluded: false;
    rawNamesIncluded: false;
    notes: string[];
  };
  dataAccuracyGate: {
    passed: boolean;
    blockers: string[];
    warnings: string[];
    checkedCompanies: number;
    checkedRows: number;
    tableDecisionMismatches: number;
    maxMetricDelta: Record<NumericMetricKey, number>;
  };
  coverage: {
    companies: number;
    creatives: number;
    internalSegments: Record<string, number>;
    userFacingSegments: Record<string, number>;
    oldRuleSegments: Record<string, number>;
    baselineReliability: Record<string, number>;
    pushReadiness: Record<string, number>;
  };
  rows: SanitizedCalibrationRow[];
};

const OUTPUT_DIR =
  "docs/operator-policy/creative-segmentation-recovery/reports/calibration-lab/artifacts";
const DATASET_PATH = path.join(OUTPUT_DIR, "sanitized-calibration-dataset.json");
const MAX_COMPANIES = Number(process.env.CREATIVE_CALIBRATION_MAX_COMPANIES ?? 3);
const MAX_ROWS_PER_COMPANY = Number(process.env.CREATIVE_CALIBRATION_ROWS_PER_COMPANY ?? 12);
const METRIC_KEYS: NumericMetricKey[] = [
  "spend",
  "purchaseValue",
  "roas",
  "cpa",
  "purchases",
  "impressions",
  "linkClicks",
];

function installSanitizedRuntimeGuards() {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const originalWarn = console.warn.bind(console);
  const originalLog = console.log.bind(console);
  const shouldSuppressLog = (args: unknown[]) =>
    typeof args[0] === "string" &&
    (args[0].startsWith("[meta-creatives]") || args[0].startsWith("[preview-resolve]"));

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    if (url.startsWith("http://localhost/") || url.startsWith("http://127.0.0.1/")) {
      return new Response(JSON.stringify({ status: "suppressed_by_calibration_lab" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  console.warn = (...args: unknown[]) => {
    if (shouldSuppressLog(args)) return;
    originalWarn(...args);
  };
  console.log = (...args: unknown[]) => {
    if (shouldSuppressLog(args)) return;
    originalLog(...args);
  };

  return () => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    console.log = originalLog;
  };
}

function round(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function nullableRound(value: number | null | undefined, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  return round(value, digits);
}

function increment(map: Record<string, number>, key: string | null | undefined) {
  const normalized = key?.trim() || "missing";
  map[normalized] = (map[normalized] ?? 0) + 1;
}

function median(values: number[]) {
  const filtered = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (filtered.length === 0) return null;
  const middle = Math.floor(filtered.length / 2);
  if (filtered.length % 2 === 1) return filtered[middle] ?? null;
  const left = filtered[middle - 1] ?? 0;
  const right = filtered[middle] ?? 0;
  return (left + right) / 2;
}

function summarizePeerBaseline(
  peers: CreativeDecisionOsCreative[],
  scope: "account" | "campaign",
): BaselineSummary {
  const eligible = peers.filter(
    (creative) =>
      creative.spend > 0 &&
      (creative.purchaseValue > 0 || creative.roas > 0 || creative.purchases > 0),
  );
  const spendBasis = eligible.reduce((sum, creative) => sum + creative.spend, 0);
  const purchaseBasis = eligible.reduce((sum, creative) => sum + creative.purchases, 0);
  const valueBasis = eligible.reduce((sum, creative) => sum + creative.purchaseValue, 0);
  const cpaValues = eligible
    .filter((creative) => creative.purchases > 0 && creative.cpa > 0)
    .map((creative) => creative.cpa);
  const missingContext: string[] = [];

  if (eligible.length < 3) missingContext.push("fewer than 3 eligible peer creatives");
  if (spendBasis < 120) missingContext.push("peer spend basis below calibration floor");
  if (purchaseBasis < 2) missingContext.push("peer purchase basis below calibration floor");

  let reliability: BaselineSummary["reliability"] = "medium";
  if (eligible.length === 0) reliability = "unavailable";
  else if (eligible.length < 3 || spendBasis < 120 || purchaseBasis < 2) reliability = "weak";
  else if (eligible.length >= 6 && spendBasis >= 500 && purchaseBasis >= 8) reliability = "strong";

  return {
    scope,
    reliability,
    creativeCount: peers.length,
    eligibleCreativeCount: eligible.length,
    spendBasis: round(spendBasis),
    purchaseBasis: round(purchaseBasis),
    weightedRoas: spendBasis > 0 ? nullableRound(valueBasis / spendBasis) : null,
    weightedCpa: purchaseBasis > 0 ? nullableRound(spendBasis / purchaseBasis) : null,
    medianRoas: nullableRound(median(eligible.map((creative) => creative.roas))),
    medianCpa: nullableRound(median(cpaValues)),
    medianSpend: nullableRound(median(eligible.map((creative) => creative.spend))),
    missingContext,
  };
}

function summarizeAccountBaseline(creative: CreativeDecisionOsCreative): BaselineSummary {
  return {
    scope: creative.relativeBaseline.scope,
    reliability: creative.relativeBaseline.reliability,
    creativeCount: creative.relativeBaseline.creativeCount,
    eligibleCreativeCount: creative.relativeBaseline.eligibleCreativeCount,
    spendBasis: round(creative.relativeBaseline.spendBasis),
    purchaseBasis: round(creative.relativeBaseline.purchaseBasis),
    weightedRoas: nullableRound(creative.relativeBaseline.weightedRoas),
    weightedCpa: nullableRound(creative.relativeBaseline.weightedCpa),
    medianRoas: nullableRound(creative.relativeBaseline.medianRoas),
    medianCpa: nullableRound(creative.relativeBaseline.medianCpa),
    medianSpend: nullableRound(creative.relativeBaseline.medianSpend),
    missingContext: creative.relativeBaseline.missingContext,
  };
}

function toOldRuleInput(
  creative: CreativeDecisionOsCreative,
  contextRow: MetaCreativeRow | null,
): CreativeDecisionInputRow {
  return {
    creativeId: creative.creativeId,
    name: creative.name,
    creativeFormat: creative.creativeFormat,
    creativeAgeDays: creative.creativeAgeDays,
    spendVelocity: creative.spend / Math.max(1, creative.creativeAgeDays || 1),
    frequency: 0,
    spend: creative.spend,
    purchaseValue: creative.purchaseValue,
    roas: creative.roas,
    cpa: creative.cpa,
    ctr: creative.ctr,
    cpm: contextRow?.cpm ?? 0,
    cpc: contextRow?.cpcLink ?? 0,
    purchases: creative.purchases,
    impressions: creative.impressions,
    linkClicks: creative.linkClicks,
    hookRate: contextRow?.thumbstop ?? 0,
    holdRate: contextRow?.video100 ?? 0,
    video25Rate: contextRow?.video25 ?? 0,
    watchRate: contextRow?.video50 ?? 0,
    video75Rate: contextRow?.video75 ?? 0,
    clickToPurchaseRate: creative.linkClicks > 0 ? (creative.purchases / creative.linkClicks) * 100 : 0,
    atcToPurchaseRate: contextRow?.atcToPurchaseRatio ?? 0,
    accountId: contextRow?.accountId ?? null,
    accountName: null,
    campaignId: contextRow?.campaignId ?? null,
    campaignName: null,
    adSetId: contextRow?.adSetId ?? null,
    adSetName: null,
  };
}

function selectRepresentativeRows(creatives: CreativeDecisionOsCreative[]) {
  const selected = new Map<string, CreativeDecisionOsCreative>();
  const sorted = [...creatives].sort((a, b) => b.spend - a.spend);

  for (const creative of sorted) {
    const segment = creative.operatorPolicy?.segment ?? "missing";
    if (!Array.from(selected.values()).some((row) => (row.operatorPolicy?.segment ?? "missing") === segment)) {
      selected.set(creative.creativeId, creative);
    }
    if (selected.size >= Math.min(MAX_ROWS_PER_COMPANY, 6)) break;
  }

  for (const creative of sorted) {
    if (selected.size >= MAX_ROWS_PER_COMPANY) break;
    selected.set(creative.creativeId, creative);
  }

  return Array.from(selected.values());
}

function buildAliasFactory(prefix: string) {
  const map = new Map<string, string>();
  return (raw: string | null | undefined) => {
    const key = raw?.trim() || "missing";
    const existing = map.get(key);
    if (existing) return existing;
    const alias = `${prefix}-${String(map.size + 1).padStart(2, "0")}`;
    map.set(key, alias);
    return alias;
  };
}

function sanitizeText(value: string, replacements: Array<[string | null | undefined, string]>) {
  let output = value;
  for (const [raw, alias] of replacements) {
    const token = raw?.trim();
    if (!token) continue;
    output = output.split(token).join(alias);
  }
  return output;
}

function historyMetric(
  rowsById: Map<string, ReturnType<typeof mapApiRowToUiRow>>,
  creativeId: string,
): Partial<Record<NumericMetricKey, number>> | null {
  const row = rowsById.get(creativeId);
  if (!row) return null;
  return {
    spend: round(row.spend),
    purchaseValue: round(row.purchaseValue),
    roas: round(row.roas),
    cpa: round(row.cpa),
    purchases: round(row.purchases),
    impressions: round(row.impressions),
    linkClicks: round(row.linkClicks),
  };
}

function compareTableAndDecisionRows(input: {
  tableRows: ReturnType<typeof mapApiRowToUiRow>[];
  creatives: CreativeDecisionOsCreative[];
}) {
  const tableById = new Map(input.tableRows.map((row) => [row.id, row]));
  const decisionById = new Map(input.creatives.map((row) => [row.creativeId, row]));
  const maxMetricDelta = Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])) as Record<
    NumericMetricKey,
    number
  >;
  let mismatches = 0;

  for (const tableId of tableById.keys()) {
    if (!decisionById.has(tableId)) mismatches += 1;
  }
  for (const decisionId of decisionById.keys()) {
    if (!tableById.has(decisionId)) mismatches += 1;
  }
  for (const [id, tableRow] of tableById.entries()) {
    const decisionRow = decisionById.get(id);
    if (!decisionRow) continue;
    for (const key of METRIC_KEYS) {
      const delta = Math.abs(Number(tableRow[key] ?? 0) - Number(decisionRow[key] ?? 0));
      maxMetricDelta[key] = Math.max(maxMetricDelta[key], round(delta, 4));
    }
  }

  return { mismatches, maxMetricDelta };
}

async function fetchCreativeRows(input: {
  request: NextRequest;
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const payload = await getMetaCreativesApiPayload({
    request: input.request,
    requestStartedAt: Date.now(),
    businessId: input.businessId,
    mediaMode: "metadata",
    groupBy: "creative",
    format: "all",
    sort: "spend",
    start: input.startDate,
    end: input.endDate,
    debugPreview: false,
    debugThumbnail: false,
    debugPerf: false,
    snapshotBypass: false,
    snapshotWarm: false,
    enableCopyRecovery: false,
    enableCreativeBasicsFallback: false,
    enableCreativeDetails: false,
    enableThumbnailBackfill: false,
    enableCardThumbnailBackfill: false,
    enableImageHashLookup: false,
    enableMediaRecovery: false,
    enableMediaCache: true,
    enableDeepAudit: false,
    perAccountSampleLimit: 10,
  });

  return ((payload.rows ?? []) as MetaCreativeApiRow[]).map(mapApiRowToUiRow);
}

async function getCandidateBusinesses(): Promise<SourceBusinessRow[]> {
  const sql = getDb();
  return sql.query<SourceBusinessRow>(
    `
      WITH latest AS (
        SELECT DISTINCT ON (business_id)
          business_id,
          end_date::text AS max_end_date,
          row_count AS max_row_count,
          last_synced_at::text AS latest_synced_at
        FROM meta_creatives_snapshots
        WHERE group_by = 'creative'
          AND format = 'all'
          AND sort = 'spend'
          AND row_count > 0
        ORDER BY business_id, end_date DESC, row_count DESC, last_synced_at DESC
      )
      SELECT *
      FROM latest
      ORDER BY max_row_count DESC, latest_synced_at DESC
      LIMIT $1
    `,
    [MAX_COMPANIES],
  );
}

async function main() {
  installSanitizedRuntimeGuards();
  const generatedAt = new Date().toISOString();
  const businessRows = await getCandidateBusinesses();
    const rows: SanitizedCalibrationRow[] = [];
    const warnings: string[] = [
      "meta_creative_daily was empty in the checked database; current Creative table and Decision OS use the creative API/snapshot source instead.",
      "Campaign baselines in this artifact are lab-computed only; production campaign segmentation still requires explicit benchmark scope input.",
    ];
    const blockers: string[] = [];
    const coverage = {
      companies: 0,
      creatives: 0,
      internalSegments: {} as Record<string, number>,
      userFacingSegments: {} as Record<string, number>,
      oldRuleSegments: {} as Record<string, number>,
      baselineReliability: {} as Record<string, number>,
      pushReadiness: {} as Record<string, number>,
    };
    let tableDecisionMismatches = 0;
    const maxMetricDelta = Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])) as Record<
      NumericMetricKey,
      number
    >;

    for (const [businessIndex, business] of businessRows.entries()) {
      const companyAlias = `company-${String(businessIndex + 1).padStart(2, "0")}`;
      const decisionAsOf = business.max_end_date;
      const startDate = addDaysToIsoDate(decisionAsOf, -29);
      const endDate = decisionAsOf;
      const request = new NextRequest(
        `http://localhost/api/creatives/decision-os?businessId=${encodeURIComponent(
          business.business_id,
        )}&startDate=${startDate}&endDate=${endDate}&decisionAsOf=${endDate}`,
      );

      let decisionOs: Awaited<ReturnType<typeof getCreativeDecisionOsForRange>>;
      let tableRows: MetaCreativeRow[];
      let last7Rows: MetaCreativeRow[];
      let last90Rows: MetaCreativeRow[];
      try {
        decisionOs = await getCreativeDecisionOsForRange({
          request,
          businessId: business.business_id,
          startDate,
          endDate,
          analyticsStartDate: startDate,
          analyticsEndDate: endDate,
          decisionAsOf: endDate,
        });
        tableRows = await fetchCreativeRows({ request, businessId: business.business_id, startDate, endDate });
        last7Rows = await fetchCreativeRows({
          request,
          businessId: business.business_id,
          startDate: addDaysToIsoDate(endDate, -6),
          endDate,
        });
        last90Rows = await fetchCreativeRows({
          request,
          businessId: business.business_id,
          startDate: addDaysToIsoDate(endDate, -89),
          endDate,
        });
      } catch (error) {
        blockers.push(
          `${companyAlias}: current Creative source failed before rows could be verified (${error instanceof Error ? error.message : "unknown error"}).`,
        );
        coverage.companies += 1;
        continue;
      }

      const tableCheck = compareTableAndDecisionRows({ tableRows, creatives: decisionOs.creatives });
      tableDecisionMismatches += tableCheck.mismatches;
      for (const key of METRIC_KEYS) {
        maxMetricDelta[key] = Math.max(maxMetricDelta[key], tableCheck.maxMetricDelta[key]);
      }

      if (tableCheck.mismatches > 0) {
        blockers.push(
          `${companyAlias}: Decision OS and Creative table row identifiers diverged (${tableCheck.mismatches} missing rows).`,
        );
      }
      for (const [metric, delta] of Object.entries(tableCheck.maxMetricDelta)) {
        if (delta > 0.02) {
          blockers.push(`${companyAlias}: ${metric} metric delta exceeded tolerance (${delta}).`);
        }
      }

      const accountAlias = buildAliasFactory(`${companyAlias}-account`);
      const campaignAlias = buildAliasFactory(`${companyAlias}-campaign`);
      const adSetAlias = buildAliasFactory(`${companyAlias}-adset`);
      const creativeAlias = buildAliasFactory(`${companyAlias}-creative`);
      const tableById = new Map(tableRows.map((row) => [row.id, row]));
      const oldRuleRows = buildCreativeOldRuleChallenger(
        decisionOs.creatives.map((creative) => toOldRuleInput(creative, tableById.get(creative.creativeId) ?? null)),
      );
      const oldRuleById = new Map(oldRuleRows.map((row) => [row.creativeId, row]));
      const last7ById = new Map(last7Rows.map((row) => [row.id, row]));
      const last30ById = new Map(tableRows.map((row) => [row.id, row]));
      const last90ById = new Map(last90Rows.map((row) => [row.id, row]));
      const sampledRows = selectRepresentativeRows(decisionOs.creatives);

      coverage.companies += 1;
      coverage.creatives += sampledRows.length;

      for (const creative of sampledRows) {
        const contextRow = tableById.get(creative.creativeId) ?? null;
        const rawCampaignId = contextRow?.campaignId ?? null;
        const rawAdSetId = contextRow?.adSetId ?? null;
        const account = accountAlias(contextRow?.accountId ?? null);
        const campaign = campaignAlias(rawCampaignId);
        const adSet = adSetAlias(rawAdSetId);
        const alias = creativeAlias(creative.creativeId);
        const surface = buildCreativeOperatorItem(creative);
        const challenger = oldRuleById.get(creative.creativeId) ?? null;
        const instruction = surface.instruction;
        const sameCampaignPeers = decisionOs.creatives.filter(
          (peer) =>
            peer.creativeId !== creative.creativeId &&
            rawCampaignId != null &&
            (tableById.get(peer.creativeId)?.campaignId ?? null) === rawCampaignId,
        );
        const campaignBaseline =
          rawCampaignId && sameCampaignPeers.length > 0
            ? summarizePeerBaseline(sameCampaignPeers, "campaign")
            : null;
        const replacements: Array<[string | null | undefined, string]> = [
          [creative.name, alias],
          [contextRow?.campaignName, campaign],
          [rawCampaignId, campaign],
          [contextRow?.adSetName, adSet],
          [rawAdSetId, adSet],
        ];
        const userFacing = creativeOperatorSegmentLabel(creative);
        const pushReadiness = creative.operatorPolicy?.pushReadiness ?? null;

        increment(coverage.internalSegments, creative.operatorPolicy?.segment ?? null);
        increment(coverage.userFacingSegments, userFacing);
        increment(coverage.oldRuleSegments, challenger?.challengerAction ?? null);
        increment(coverage.baselineReliability, creative.relativeBaseline.reliability);
        increment(coverage.pushReadiness, pushReadiness);

        rows.push({
          companyAlias,
          accountAlias: account,
          campaignAlias: campaign,
          adSetAlias: adSet,
          creativeAlias: alias,
          currentDecisionOsInternalSegment: creative.operatorPolicy?.segment ?? null,
          currentUserFacingSegment: userFacing,
          oldRuleChallengerSegment: challenger?.challengerAction ?? null,
          oldRuleChallengerReason: challenger?.reason ?? null,
          accountBaseline: summarizeAccountBaseline(creative),
          campaignBaseline,
          spend: round(creative.spend),
          purchases: round(creative.purchases),
          cpa: round(creative.cpa),
          roas: round(creative.roas),
          value: round(creative.purchaseValue),
          recent7d: historyMetric(last7ById, creative.creativeId),
          mid30d: historyMetric(last30ById, creative.creativeId),
          long90d: historyMetric(last90ById, creative.creativeId),
          trendIndicators: {
            fatigueStatus: creative.fatigue.status,
            fatigueConfidence: creative.fatigue.confidence,
            lifecycleState: creative.lifecycleState,
            primaryAction: creative.primaryAction,
          },
          creativeAgeDays: creative.creativeAgeDays,
          frequency: null,
          commercialTruthAvailability: {
            targetPackConfigured: decisionOs.commercialTruthCoverage.configuredSections.targetPack,
            missingInputs: decisionOs.commercialTruthCoverage.missingInputs,
          },
          campaignAdSetContextFlags: {
            campaignPresent: Boolean(rawCampaignId),
            adSetPresent: Boolean(rawAdSetId),
            deploymentCompatibility: creative.deployment.compatibility.status,
            targetLane: creative.deployment.targetLane,
          },
          evidenceQuality: {
            evidenceSource: creative.evidenceSource,
            trustState: creative.trust.truthState,
            surfaceLane: creative.trust.surfaceLane,
            previewWindow: creative.previewStatus?.liveDecisionWindow ?? null,
            baselineReliability: creative.relativeBaseline.reliability,
          },
          currentPushReadiness: pushReadiness,
          currentInstructionHeadline: sanitizeText(instruction?.headline ?? "", replacements),
          reasonSummary: sanitizeText(instruction?.reasonSummary ?? "", replacements),
          missingEvidence: (instruction?.missingEvidence ?? []).map((item) =>
            sanitizeText(item, replacements),
          ),
        });
        increment(coverage.internalSegments, `quick_filter:${resolveCreativeQuickFilterKey(creative)}`);
      }

      if (decisionOs.creatives.length === 0) {
        blockers.push(`${companyAlias}: current Decision OS returned zero verifiable rows.`);
      }
    }

    if (rows.length === 0) {
      blockers.push("No verifiable current Decision OS creative rows were available; agent calibration must not run.");
    }

    const artifact: DatasetArtifact = {
      generatedAt,
      source: "creative_segmentation_calibration_lab",
      sanitization: {
        rawIdsIncluded: false,
        rawNamesIncluded: false,
        notes: [
          "Business, account, campaign, ad set, and creative identifiers are replaced with deterministic aliases per generated artifact.",
          "Creative names, campaign names, ad set names, preview URLs, copy text, tokens, and customer names are not exported.",
        ],
      },
      dataAccuracyGate: {
        passed: blockers.length === 0 && rows.length > 0,
        blockers,
        warnings,
        checkedCompanies: coverage.companies,
        checkedRows: coverage.creatives,
        tableDecisionMismatches,
        maxMetricDelta,
      },
      coverage,
      rows,
    };

    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(DATASET_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    console.log(
      JSON.stringify(
        {
          output: DATASET_PATH,
          gatePassed: artifact.dataAccuracyGate.passed,
          checkedCompanies: artifact.dataAccuracyGate.checkedCompanies,
          checkedRows: artifact.dataAccuracyGate.checkedRows,
          blockers: artifact.dataAccuracyGate.blockers,
          warnings: artifact.dataAccuracyGate.warnings,
          coverage: artifact.coverage,
        },
        null,
        2,
      ),
    );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    resetDbClientCache();
  });
