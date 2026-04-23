import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
import { getIntegration } from "@/lib/integrations";
import { getMetaCreativesApiPayload } from "@/lib/meta/creatives-api";
import { fetchAssignedAccountIds } from "@/lib/meta/creatives-fetchers";
import type { MetaCreativeApiRow } from "@/lib/meta/creatives-types";
import { addDaysToIsoDate } from "@/lib/meta/history";
import type { MetaCreativeRow } from "@/components/creatives/metricConfig";

export type SourceBusinessRow = {
  business_id: string;
  max_end_date: string;
  max_row_count: number;
  latest_synced_at: string;
  connection_status: string | null;
  has_access_token: boolean;
  assigned_account_count: number;
};

export type CandidateSkipReason =
  | "no_current_meta_connection"
  | "meta_connection_not_connected"
  | "no_access_token"
  | "no_accounts_assigned";

type NumericMetricKey =
  | "spend"
  | "purchaseValue"
  | "roas"
  | "cpa"
  | "purchases"
  | "impressions"
  | "linkClicks";

type SourceWindowKey = "selected30d" | "last7" | "last90";

type ZeroRowClassification =
  | "not_zero_row"
  | "no_current_creative_activity"
  | "provider_read_failure"
  | "connection_or_account_mismatch"
  | "source_mapping_bug"
  | "decision_os_mapping_filter_bug"
  | "source_no_data_unknown"
  | "source_exception";

type SourceDiagnostics = {
  window: SourceWindowKey;
  status: string;
  source: string | null;
  rowCount: number;
  freshnessState: string | null;
  snapshotAgeMs: number | null;
  isRefreshing: boolean | null;
  queryShape: {
    mediaMode: "metadata";
    groupBy: "creative";
    format: "all";
    sort: "spend";
  };
  previewCoverage: {
    totalCreatives: number;
    previewReadyCount: number;
    previewWaitingCount: number;
    previewMissingCount: number;
    previewCoverage: number;
  } | null;
};

type LiveInsightsProbe = {
  assignedAccountCount: number;
  accountsAttempted: number;
  accountsSucceeded: number;
  accountsWithInsights: number;
  accountFetchFailures: number;
  totalInsightRows: number;
  spendBearingInsightRows: number;
  failureStatusCounts: Record<string, number>;
  metaErrorCounts: Record<string, number>;
};

type CandidateSourceHealth = {
  companyAlias: string;
  eligible: boolean;
  sampled: boolean;
  decisionAsOf: string;
  decisionSummaryMessage: string;
  selectedWindow: {
    startDate: string;
    endDate: string;
  };
  eligibility: {
    connected: boolean;
    hasAccessToken: boolean;
    assignedAccountCount: number;
  };
  snapshotCandidate: {
    rowCount: number;
    latestSyncedAt: string;
  };
  decisionOsRows: number;
  tableRows: number;
  sourceDiagnostics: SourceDiagnostics[];
  liveInsightsProbe: LiveInsightsProbe | null;
  zeroRowClassification: ZeroRowClassification;
  zeroRowReason: string;
  blocksCalibration: boolean;
};

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

export type DatasetArtifact = {
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
    candidateEligibility: {
      historicalSnapshotCandidates: number;
      uniqueCandidateBusinesses: number;
      dedupedDuplicateRows: number;
      eligibleCandidates: number;
      skippedCandidates: number;
      skippedCandidatesByReason: Record<CandidateSkipReason, number>;
      sampledCandidates: number;
      zeroRowEligibleCandidates: number;
    };
    warehouseCreativeDaily: {
      available: boolean;
      rowCount: number;
      checkedAgainstCurrentPipeline: boolean;
      confidence: "api_payload_parity_only" | "api_payload_parity_plus_warehouse_available";
      status: "empty_table" | "available_not_cross_checked";
    };
  };
  coverage: {
    companies: number;
    creatives: number;
    internalSegments: Record<string, number>;
    quickFilters: Record<string, number>;
    userFacingSegments: Record<string, number>;
    oldRuleSegments: Record<string, number>;
    baselineReliability: Record<string, number>;
    pushReadiness: Record<string, number>;
  };
  sourceHealth: CandidateSourceHealth[];
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

const EMPTY_SKIPPED_CANDIDATES_BY_REASON: Record<CandidateSkipReason, number> = {
  no_current_meta_connection: 0,
  meta_connection_not_connected: 0,
  no_access_token: 0,
  no_accounts_assigned: 0,
};

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

export function createEmptyCoverageSummary(): DatasetArtifact["coverage"] {
  return {
    companies: 0,
    creatives: 0,
    internalSegments: {},
    quickFilters: {},
    userFacingSegments: {},
    oldRuleSegments: {},
    baselineReliability: {},
    pushReadiness: {},
  };
}

export function recordCoverage(input: {
  coverage: DatasetArtifact["coverage"];
  internalSegment: string | null | undefined;
  quickFilter: string | null | undefined;
  userFacingSegment: string | null | undefined;
  oldRuleSegment: string | null | undefined;
  baselineReliability: string | null | undefined;
  pushReadiness: string | null | undefined;
}) {
  increment(input.coverage.internalSegments, input.internalSegment);
  increment(input.coverage.quickFilters, input.quickFilter);
  increment(input.coverage.userFacingSegments, input.userFacingSegment);
  increment(input.coverage.oldRuleSegments, input.oldRuleSegment);
  increment(input.coverage.baselineReliability, input.baselineReliability);
  increment(input.coverage.pushReadiness, input.pushReadiness);
}

export function resolveCandidateSkipReason(candidate: Pick<
  SourceBusinessRow,
  "connection_status" | "has_access_token" | "assigned_account_count"
>): CandidateSkipReason | null {
  const connectionStatus = candidate.connection_status?.trim() || null;
  if (!connectionStatus) return "no_current_meta_connection";
  if (connectionStatus !== "connected") return "meta_connection_not_connected";
  if (!candidate.has_access_token) return "no_access_token";
  if (candidate.assigned_account_count <= 0) return "no_accounts_assigned";
  return null;
}

function candidateEligibilityScore(candidate: SourceBusinessRow) {
  let score = 0;
  if (candidate.connection_status === "connected") score += 4;
  else if (candidate.connection_status) score += 1;
  if (candidate.has_access_token) score += 2;
  if (candidate.assigned_account_count > 0) score += 2;
  return score;
}

function compareCandidateRows(left: SourceBusinessRow, right: SourceBusinessRow) {
  const scoreDelta = candidateEligibilityScore(right) - candidateEligibilityScore(left);
  if (scoreDelta !== 0) return scoreDelta;
  const rowCountDelta = right.max_row_count - left.max_row_count;
  if (rowCountDelta !== 0) return rowCountDelta;
  return Date.parse(right.latest_synced_at) - Date.parse(left.latest_synced_at);
}

export function collapseCandidateRowsByBusiness(candidates: SourceBusinessRow[]) {
  const byBusiness = new Map<string, SourceBusinessRow>();
  for (const candidate of candidates) {
    const existing = byBusiness.get(candidate.business_id);
    if (!existing || compareCandidateRows(existing, candidate) > 0) {
      byBusiness.set(candidate.business_id, candidate);
    }
  }
  const collapsed = Array.from(byBusiness.values()).sort((left, right) => {
    const rowCountDelta = right.max_row_count - left.max_row_count;
    if (rowCountDelta !== 0) return rowCountDelta;
    return Date.parse(right.latest_synced_at) - Date.parse(left.latest_synced_at);
  });
  return {
    candidates: collapsed,
    duplicateRows: candidates.length - collapsed.length,
  };
}

export function summarizeCandidateEligibility(candidates: SourceBusinessRow[]) {
  const collapsed = collapseCandidateRowsByBusiness(candidates);
  const skippedCandidatesByReason = { ...EMPTY_SKIPPED_CANDIDATES_BY_REASON };
  const eligible: SourceBusinessRow[] = [];

  for (const candidate of collapsed.candidates) {
    const reason = resolveCandidateSkipReason(candidate);
    if (reason) {
      skippedCandidatesByReason[reason] += 1;
      continue;
    }
    eligible.push(candidate);
  }

  return {
    eligible,
    skippedCandidatesByReason,
    skippedCandidates: collapsed.candidates.length - eligible.length,
    uniqueCandidateBusinesses: collapsed.candidates.length,
    dedupedDuplicateRows: collapsed.duplicateRows,
  };
}

function readNumberFromObject(value: unknown, key: string) {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function buildSourceDiagnostics(input: {
  window: SourceWindowKey;
  payload: Awaited<ReturnType<typeof getMetaCreativesApiPayload>>;
}): SourceDiagnostics {
  const payload = input.payload as Record<string, unknown>;
  const previewCoverage = payload.preview_coverage;
  const rowCount = Array.isArray(input.payload.rows) ? input.payload.rows.length : 0;
  return {
    window: input.window,
    status: typeof payload.status === "string" ? payload.status : "unknown",
    source: typeof payload.snapshot_source === "string" ? payload.snapshot_source : null,
    rowCount,
    freshnessState: typeof payload.freshness_state === "string" ? payload.freshness_state : null,
    snapshotAgeMs: readNumberFromObject(payload, "snapshot_age_ms"),
    isRefreshing: typeof payload.is_refreshing === "boolean" ? payload.is_refreshing : null,
    queryShape: {
      mediaMode: "metadata",
      groupBy: "creative",
      format: "all",
      sort: "spend",
    },
    previewCoverage:
      previewCoverage && typeof previewCoverage === "object"
        ? {
            totalCreatives: readNumberFromObject(previewCoverage, "totalCreatives") ?? 0,
            previewReadyCount: readNumberFromObject(previewCoverage, "previewReadyCount") ?? 0,
            previewWaitingCount: readNumberFromObject(previewCoverage, "previewWaitingCount") ?? 0,
            previewMissingCount: readNumberFromObject(previewCoverage, "previewMissingCount") ?? 0,
            previewCoverage: readNumberFromObject(previewCoverage, "previewCoverage") ?? 0,
          }
        : null,
  };
}

function incrementFailure(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

async function probeLiveInsights(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<LiveInsightsProbe> {
  const [integration, assignedAccountIds] = await Promise.all([
    getIntegration(input.businessId, "meta").catch(() => null),
    fetchAssignedAccountIds(input.businessId).catch(() => []),
  ]);
  const accessToken = integration?.access_token ?? null;
  const probe: LiveInsightsProbe = {
    assignedAccountCount: assignedAccountIds.length,
    accountsAttempted: accessToken ? assignedAccountIds.length : 0,
    accountsSucceeded: 0,
    accountsWithInsights: 0,
    accountFetchFailures: 0,
    totalInsightRows: 0,
    spendBearingInsightRows: 0,
    failureStatusCounts: {},
    metaErrorCounts: {},
  };

  if (!accessToken) return probe;

  for (const accountId of assignedAccountIds) {
    try {
      const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/insights`);
      url.searchParams.set("fields", "ad_id,spend,impressions,date_start");
      url.searchParams.set("level", "ad");
      url.searchParams.set(
        "time_range",
        JSON.stringify({ since: input.startDate, until: input.endDate }),
      );
      url.searchParams.set("limit", "500");
      url.searchParams.set("access_token", accessToken);
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => null)) as {
        data?: unknown[];
        error?: { code?: number; error_subcode?: number; type?: string };
      } | null;
      if (!res.ok) {
        probe.accountFetchFailures += 1;
        incrementFailure(probe.failureStatusCounts, `http_${res.status}`);
        const code = payload?.error?.code;
        const subcode = payload?.error?.error_subcode;
        if (typeof code === "number") {
          incrementFailure(
            probe.metaErrorCounts,
            typeof subcode === "number" ? `meta_${code}_${subcode}` : `meta_${code}`,
          );
        }
        continue;
      }
      const insightRows = Array.isArray(payload?.data) ? payload.data : [];
      const rowCount = insightRows.length;
      const spendBearingRowCount = insightRows.filter((row) => {
        if (!row || typeof row !== "object") return false;
        const adId = (row as { ad_id?: unknown }).ad_id;
        const spend = Number((row as { spend?: unknown }).spend ?? 0);
        return (
          typeof adId === "string" &&
          adId.trim().length > 0 &&
          Number.isFinite(spend) &&
          spend > 0
        );
      }).length;
      probe.accountsSucceeded += 1;
      probe.totalInsightRows += rowCount;
      probe.spendBearingInsightRows += spendBearingRowCount;
      if (rowCount > 0) probe.accountsWithInsights += 1;
    } catch {
      probe.accountFetchFailures += 1;
      incrementFailure(probe.failureStatusCounts, "network_or_parse_error");
    }
  }

  return probe;
}

export function classifyZeroRowSourceHealth(input: {
  decisionOsRows: number;
  tableRows: number;
  sourceStatus: string;
  liveInsightsProbe: LiveInsightsProbe | null;
}): Pick<CandidateSourceHealth, "zeroRowClassification" | "zeroRowReason" | "blocksCalibration"> {
  if (input.decisionOsRows > 0) {
    return {
      zeroRowClassification: "not_zero_row",
      zeroRowReason: "Decision OS returned creative rows for this sampled candidate.",
      blocksCalibration: false,
    };
  }

  if (input.tableRows > 0) {
    return {
      zeroRowClassification: "decision_os_mapping_filter_bug",
      zeroRowReason:
        "Creative source returned rows, but Decision OS returned zero rows; this indicates a route or identity divergence before policy filtering.",
      blocksCalibration: true,
    };
  }

  if (
    input.sourceStatus === "no_connection" ||
    input.sourceStatus === "no_access_token" ||
    input.sourceStatus === "no_accounts_assigned"
  ) {
    const reasonByStatus: Record<string, string> = {
      no_connection:
        "Candidate business passed snapshot eligibility, but the current creative source reported no connected Meta integration.",
      no_access_token:
        "Candidate business passed snapshot eligibility, but the current creative source reported a missing Meta access token.",
      no_accounts_assigned:
        "Candidate business passed snapshot eligibility, but the current creative source reported no assigned Meta accounts.",
    };
    return {
      zeroRowClassification: "connection_or_account_mismatch",
      zeroRowReason: reasonByStatus[input.sourceStatus] ?? "Current creative source eligibility did not match candidate eligibility.",
      blocksCalibration: true,
    };
  }

  const probe = input.liveInsightsProbe;
  if (input.sourceStatus === "no_data" && probe) {
    if (probe.accountFetchFailures > 0 && probe.accountsSucceeded === 0) {
      return {
        zeroRowClassification: "provider_read_failure",
        zeroRowReason:
          "All assigned Meta account insight reads failed for the decision window.",
        blocksCalibration: true,
      };
    }
    if (probe.spendBearingInsightRows > 0) {
      return {
        zeroRowClassification: "source_mapping_bug",
        zeroRowReason:
          "Live provider reads found spend-bearing ad rows, but the Creative source still returned no creative rows.",
        blocksCalibration: true,
      };
    }
    if (probe.accountFetchFailures > 0) {
      return {
        zeroRowClassification: "provider_read_failure",
        zeroRowReason:
          "At least one assigned Meta account insight read failed, so the no-data result cannot be trusted as true inactivity.",
        blocksCalibration: true,
      };
    }
    return {
      zeroRowClassification: "no_current_creative_activity",
      zeroRowReason:
        probe.totalInsightRows > 0
          ? "Assigned Meta accounts had no spend-bearing creative activity in the decision window."
          : "Assigned Meta accounts returned no ad-level insights for the decision window.",
      blocksCalibration: false,
    };
  }

  return {
    zeroRowClassification: input.sourceStatus === "no_data" ? "source_no_data_unknown" : "source_exception",
    zeroRowReason:
      input.sourceStatus === "no_data"
        ? "Creative source returned no_data but no live insight probe was available."
        : `Creative source returned ${input.sourceStatus || "unknown"} with zero rows.`,
    blocksCalibration: true,
  };
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

function mapPayloadRows(payload: Awaited<ReturnType<typeof getMetaCreativesApiPayload>>) {
  return ((payload.rows ?? []) as MetaCreativeApiRow[]).map(mapApiRowToUiRow);
}

async function fetchCreativePayload(input: {
  request: NextRequest;
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  return getMetaCreativesApiPayload({
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
}

async function getCandidateBusinesses(): Promise<SourceBusinessRow[]> {
  const sql = getDb();
  const snapshotRows = await sql.query<
    Pick<SourceBusinessRow, "business_id" | "max_end_date" | "max_row_count" | "latest_synced_at">
  >(
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
      SELECT
        latest.business_id,
        latest.max_end_date,
        latest.max_row_count,
        latest.latest_synced_at
      FROM latest
      ORDER BY latest.max_row_count DESC, latest.latest_synced_at DESC
    `,
    [],
  );

  const candidates = await Promise.all(
    snapshotRows.map(async (snapshotRow) => {
      const [integration, assignedAccountIds] = await Promise.all([
        getIntegration(snapshotRow.business_id, "meta").catch(() => null),
        fetchAssignedAccountIds(snapshotRow.business_id).catch(() => []),
      ]);

      return {
        ...snapshotRow,
        connection_status: integration?.status ?? null,
        has_access_token: Boolean(integration?.access_token?.trim()),
        assigned_account_count: assignedAccountIds.length,
      } satisfies SourceBusinessRow;
    }),
  );

  return candidates;
}

async function getWarehouseCreativeDailyStatus(): Promise<DatasetArtifact["dataAccuracyGate"]["warehouseCreativeDaily"]> {
  const sql = getDb();
  const [row] = await sql.query<{ row_count: string | number }>(
    "SELECT COUNT(*) AS row_count FROM meta_creative_daily",
    [],
  );
  const rowCount = Number(row?.row_count ?? 0);
  return {
    available: rowCount > 0,
    rowCount,
    checkedAgainstCurrentPipeline: false,
    confidence: rowCount > 0 ? "api_payload_parity_plus_warehouse_available" : "api_payload_parity_only",
    status: rowCount > 0 ? "available_not_cross_checked" : "empty_table",
  };
}

export async function runCalibrationLab() {
  installSanitizedRuntimeGuards();
  const generatedAt = new Date().toISOString();
  const candidateRows = await getCandidateBusinesses();
  const candidateEligibility = summarizeCandidateEligibility(candidateRows);
  const businessRows = candidateEligibility.eligible.slice(0, MAX_COMPANIES);
  const warehouseCreativeDaily = await getWarehouseCreativeDailyStatus();
  const rows: SanitizedCalibrationRow[] = [];
  const warnings: string[] = [
    "Campaign baselines in this artifact are lab-computed only; production campaign segmentation still requires explicit benchmark scope input.",
  ];
  if (candidateEligibility.skippedCandidates > 0) {
    warnings.push(
      "Some historical snapshot businesses were skipped because they are not currently eligible for Creative Decision OS validation.",
    );
  }
  if (!warehouseCreativeDaily.available) {
    warnings.push(
      "meta_creative_daily is empty in the checked database; current verification is API/payload parity only because the product Creative pipeline uses the creative API/snapshot source.",
    );
  } else {
    warnings.push(
      "meta_creative_daily has rows, but this gate does not yet cross-check it against the current Creative API/snapshot source.",
    );
  }
  const blockers: string[] = [];
  const coverage = createEmptyCoverageSummary();
  let tableDecisionMismatches = 0;
  let zeroRowEligibleCandidates = 0;
  const maxMetricDelta = Object.fromEntries(METRIC_KEYS.map((key) => [key, 0])) as Record<
    NumericMetricKey,
    number
  >;
  const sourceHealth: CandidateSourceHealth[] = [];

  if (businessRows.length === 0) {
    blockers.push("No currently eligible Meta-connected businesses were available for calibration.");
  }

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
    let tablePayload: Awaited<ReturnType<typeof getMetaCreativesApiPayload>>;
    let last7Payload: Awaited<ReturnType<typeof getMetaCreativesApiPayload>>;
    let last90Payload: Awaited<ReturnType<typeof getMetaCreativesApiPayload>>;
    try {
      [decisionOs, tablePayload, last7Payload, last90Payload] = await Promise.all([
        getCreativeDecisionOsForRange({
          request,
          businessId: business.business_id,
          startDate,
          endDate,
          analyticsStartDate: startDate,
          analyticsEndDate: endDate,
          decisionAsOf: endDate,
        }),
        fetchCreativePayload({
          request,
          businessId: business.business_id,
          startDate,
          endDate,
        }),
        fetchCreativePayload({
          request,
          businessId: business.business_id,
          startDate: addDaysToIsoDate(endDate, -6),
          endDate,
        }),
        fetchCreativePayload({
          request,
          businessId: business.business_id,
          startDate: addDaysToIsoDate(endDate, -89),
          endDate,
        }),
      ]);
    } catch (error) {
      blockers.push(
        `${companyAlias}: current Creative source failed before rows could be verified (${error instanceof Error ? error.message : "unknown error"}).`,
      );
      coverage.companies += 1;
      continue;
    }

    const tableRows = mapPayloadRows(tablePayload);
    const last7Rows = mapPayloadRows(last7Payload);
    const last90Rows = mapPayloadRows(last90Payload);
    const sourceDiagnostics = [
      buildSourceDiagnostics({ window: "selected30d", payload: tablePayload }),
      buildSourceDiagnostics({ window: "last7", payload: last7Payload }),
      buildSourceDiagnostics({ window: "last90", payload: last90Payload }),
    ];
    let liveInsightsProbe: LiveInsightsProbe | null = null;
    if (decisionOs.creatives.length === 0 && sourceDiagnostics[0]?.status === "no_data") {
      liveInsightsProbe = await probeLiveInsights({
        businessId: business.business_id,
        startDate,
        endDate,
      }).catch(() => null);
    }
    const zeroRowDiagnosis = classifyZeroRowSourceHealth({
      decisionOsRows: decisionOs.creatives.length,
      tableRows: tableRows.length,
      sourceStatus: sourceDiagnostics[0]?.status ?? "unknown",
      liveInsightsProbe,
    });
    sourceHealth.push({
      companyAlias,
      eligible: true,
      sampled: true,
      decisionAsOf,
      decisionSummaryMessage: decisionOs.summary.message,
      selectedWindow: { startDate, endDate },
      eligibility: {
        connected: business.connection_status === "connected",
        hasAccessToken: business.has_access_token,
        assignedAccountCount: business.assigned_account_count,
      },
      snapshotCandidate: {
        rowCount: business.max_row_count,
        latestSyncedAt: business.latest_synced_at,
      },
      decisionOsRows: decisionOs.creatives.length,
      tableRows: tableRows.length,
      sourceDiagnostics,
      liveInsightsProbe,
      zeroRowClassification: zeroRowDiagnosis.zeroRowClassification,
      zeroRowReason: zeroRowDiagnosis.zeroRowReason,
      blocksCalibration: zeroRowDiagnosis.blocksCalibration,
    });

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

      recordCoverage({
        coverage,
        internalSegment: creative.operatorPolicy?.segment ?? null,
        quickFilter: resolveCreativeQuickFilterKey(creative),
        userFacingSegment: userFacing,
        oldRuleSegment: challenger?.challengerAction ?? null,
        baselineReliability: creative.relativeBaseline.reliability,
        pushReadiness,
      });

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
    }

    if (decisionOs.creatives.length === 0) {
      if (zeroRowDiagnosis.blocksCalibration) {
        zeroRowEligibleCandidates += 1;
        blockers.push(`${companyAlias}: ${zeroRowDiagnosis.zeroRowReason}`);
      } else {
        warnings.push(`${companyAlias}: ${zeroRowDiagnosis.zeroRowReason}`);
      }
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
      candidateEligibility: {
        historicalSnapshotCandidates: candidateEligibility.uniqueCandidateBusinesses,
        uniqueCandidateBusinesses: candidateEligibility.uniqueCandidateBusinesses,
        dedupedDuplicateRows: candidateEligibility.dedupedDuplicateRows,
        eligibleCandidates: candidateEligibility.eligible.length,
        skippedCandidates: candidateEligibility.skippedCandidates,
        skippedCandidatesByReason: candidateEligibility.skippedCandidatesByReason,
        sampledCandidates: businessRows.length,
        zeroRowEligibleCandidates,
      },
      warehouseCreativeDaily,
    },
    coverage,
    sourceHealth,
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

function isDirectRun() {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  runCalibrationLab()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    resetDbClientCache();
  });
}
