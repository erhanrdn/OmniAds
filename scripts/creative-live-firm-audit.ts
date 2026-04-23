import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvConfig } from "@next/env";
import { NextRequest } from "next/server";
import type { MetaCampaignRow } from "@/app/api/meta/campaigns/route";
import type { MetaAdSetData } from "@/lib/api/meta";
import type { CreativeDecisionInputRow } from "@/lib/ai/generate-creative-decisions";
import type {
  CreativeDecisionBenchmarkScopeInput,
  CreativeDecisionOsCreative,
  CreativeDecisionOsHistoricalWindows,
  CreativeDecisionOsInputRow,
  CreativeDecisionOsV1Response,
  CreativeDecisionRelativeBaseline,
} from "@/lib/creative-decision-os";
import type { MetaCreativeApiRow } from "@/lib/meta/creatives-types";
import {
  buildCreativeDecisionOs,
  buildEmptyCreativeHistoricalAnalysis,
} from "@/lib/creative-decision-os";
import { buildCreativeHistoricalAnalysis } from "@/lib/creative-historical-intelligence";
import { buildCreativeOldRuleChallenger } from "@/lib/creative-old-rule-challenger";
import {
  buildCreativeOperatorItem,
  creativeOperatorSegmentLabel,
} from "@/lib/creative-operator-surface";
import type { CreativeEvidenceSource } from "@/lib/creative-operator-policy";
import { getBusinessCommercialTruthSnapshot } from "@/lib/business-commercial";
import { buildAccountOperatingMode } from "@/lib/business-operating-mode";
import { getDb, resetDbClientCache } from "@/lib/db";
import { getIntegration } from "@/lib/integrations";
import type { MetaCreativeRow } from "@/components/creatives/metricConfig";
import { mapApiRowToUiRow } from "@/app/(dashboard)/creatives/page-support";
import { fetchAssignedAccountIds } from "@/lib/meta/creatives-fetchers";
import { getMetaCreativesDbPayload } from "@/lib/meta/creatives-api";
import { addDaysToIsoDate, META_WAREHOUSE_HISTORY_DAYS } from "@/lib/meta/history";
import {
  getMetaDecisionSourceSnapshot,
  getMetaDecisionWindowContext,
} from "@/lib/meta/operator-decision-source";
import {
  assessRuntimeTokenReadability,
  buildAliasFactory,
  buildRuntimeTokenReadabilityBlocker,
  classifyRuntimeCandidateSkip,
  countRuntimeSkippedCandidates,
  fetchCreativePayload,
  getCandidateBusinesses,
  installSanitizedRuntimeGuards,
  probeLiveMetaAccountAccess,
  sanitizeText,
  shouldReportNoLiveReadableBusinesses,
  summarizeCandidateEligibility,
  type FetchCreativePayloadResult,
  type RuntimeCandidateSkipReason,
  type RuntimeTokenReadabilityStatus,
  type SourceBusinessRow,
} from "./creative-segmentation-calibration-lab";
import { assignStableCompanyAliases } from "./creative-segmentation-holdout-validation";

loadEnvConfig(process.cwd());

export type AuditWindow = {
  todayReference: string;
  startDate: string;
  endDate: string;
  days: number;
  excludesToday: true;
};

type ActiveContext = {
  isActive: boolean;
  campaignStatus: string | null;
  adSetStatus: string | null;
  source: "campaign_and_adset" | "campaign_only" | "missing_context";
};

type AuditBaselineSummary = {
  scope: "account" | "campaign";
  reliability: "strong" | "medium" | "weak" | "unavailable";
  sampleSize: number;
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

export type AuditSampleCandidate = {
  creativeId: string;
  spend: number;
  isActive: boolean;
};

type SanitizedAuditRow = {
  companyAlias: string;
  accountAlias: string;
  campaignAlias: string;
  adSetAlias: string;
  creativeAlias: string;
  activeStatus: boolean;
  activeStatusSource: ActiveContext["source"];
  campaignStatus: string | null;
  adSetStatus: string | null;
  spend30d: number;
  recent7d: Record<string, number> | null;
  mid30d: Record<string, number> | null;
  long90d: Record<string, number> | null;
  currentDecisionOsInternalSegment: string | null;
  currentUserFacingSegment: string;
  currentInstructionHeadline: string;
  reasonSummary: string;
  nextObservation: string[];
  benchmarkScope: string;
  benchmarkScopeLabel: string;
  baselineReliability: string;
  accountBaseline: AuditBaselineSummary;
  campaignBaseline: AuditBaselineSummary | null;
  commercialTruthAvailability: {
    targetPackConfigured: boolean;
    missingInputs: string[];
  };
  businessValidationStatus: "favorable" | "missing" | "unfavorable";
  pushReadiness: string | null;
  queueEligible: boolean;
  canApply: boolean;
  lifecycleState: string;
  primaryAction: string;
  evidenceSource: string;
  trustState: string;
  previewWindow: string | null;
  deploymentCompatibility: string;
  deploymentTargetLane: string | null;
  oldRuleChallengerAction: string | null;
  oldRuleChallengerSegment: string | null;
  oldRuleChallengerReason: string | null;
  relativeStrengthClass:
    | "true_scale_candidate"
    | "review_only_scale_candidate"
    | "strong_relative"
    | "none";
  campaignContextLimited: boolean;
};

type PrivateAuditRow = SanitizedAuditRow & {
  businessId: string;
  businessName: string | null;
  accountName: string | null;
  campaignName: string | null;
  adSetName: string | null;
  creativeName: string;
  creativeId: string;
};

type BusinessAuditSummary = {
  companyAlias: string;
  screeningLiveRows: number;
  currentDecisionOsRows: number;
  sampledCreatives: number;
  activeCreativesSampled: number;
  userFacingSegments: Record<string, number>;
  oldChallengerSegments: Record<string, number>;
  zeroScale: boolean;
  zeroScaleReview: boolean;
};

type SanitizedAuditArtifact = {
  generatedAt: string;
  source: "creative_live_firm_audit";
  auditWindow: AuditWindow;
  sanitization: {
    rawIdsIncluded: false;
    rawNamesIncluded: false;
    notes: string[];
  };
  cohort: {
    historicalSnapshotCandidates: number;
    eligibleCandidates: number;
    runtimeEligibleBusinesses: number;
    runtimeSkippedCandidates: number;
    runtimeSkippedCandidatesByReason: Record<RuntimeCandidateSkipReason, number>;
    runtimeTokenReadabilityStatus: RuntimeTokenReadabilityStatus;
  };
  globalSummary: {
    sampledCreatives: number;
    businessesWithZeroScale: number;
    businessesWithZeroScaleReview: number;
    userFacingSegments: Record<string, number>;
  };
  businesses: BusinessAuditSummary[];
  rows: SanitizedAuditRow[];
};

type PrivateAuditArtifact = Omit<SanitizedAuditArtifact, "sanitization" | "rows" | "businesses"> & {
  rows: PrivateAuditRow[];
  businesses: Array<BusinessAuditSummary & { businessId: string; businessName: string | null }>;
};

type RuntimeEligibleBusiness = {
  business: SourceBusinessRow;
  companyAlias: string;
  businessName: string | null;
  live30d: FetchCreativePayloadResult;
};

const OUTPUT_DIR =
  "docs/operator-policy/creative-segmentation-recovery/reports/live-firm-audit";
const ARTIFACT_DIR = path.join(OUTPUT_DIR, "artifacts");
const SANITIZED_ARTIFACT_PATH = path.join(ARTIFACT_DIR, "sanitized-live-firm-audit.json");
const LOCAL_PRIVATE_ARTIFACT_PATH = "/tmp/adsecute-creative-live-firm-audit-local.json";
const MAX_ROWS_PER_BUSINESS = Number(process.env.CREATIVE_LIVE_FIRM_AUDIT_MAX_ROWS ?? 10);
const SCREEN_TIMEOUT_MS = Number(process.env.CREATIVE_LIVE_FIRM_AUDIT_SCREEN_TIMEOUT_MS ?? 90_000);
const DEBUG = process.env.CREATIVE_LIVE_FIRM_AUDIT_DEBUG?.trim() === "1";

const EMPTY_RUNTIME_SKIPS: Record<RuntimeCandidateSkipReason, number> = {
  no_current_meta_connection: 0,
  meta_connection_not_connected: 0,
  no_access_token: 0,
  no_accounts_assigned: 0,
  meta_token_checkpointed: 0,
  provider_read_failure: 0,
  no_current_creative_activity: 0,
};

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

function debug(message: string, extra?: Record<string, unknown>) {
  if (!DEBUG) return;
  console.error(`[creative-live-firm-audit] ${message}${extra ? ` ${JSON.stringify(extra)}` : ""}`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string) {
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function currentLocalIsoDate(
  timezone = process.env.CREATIVE_LIVE_FIRM_AUDIT_TIMEZONE ?? "Europe/Istanbul",
) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

export function resolveAuditWindow(todayReference = currentLocalIsoDate()): AuditWindow {
  const endDate = addDaysToIsoDate(todayReference, -1);
  return {
    todayReference,
    startDate: addDaysToIsoDate(endDate, -29),
    endDate,
    days: 30,
    excludesToday: true,
  };
}

function combineCreativeEvidenceSource(
  sources: CreativeEvidenceSource[],
): CreativeEvidenceSource {
  if (sources.includes("unknown")) return "unknown";
  if (sources.includes("fallback")) return "fallback";
  if (sources.includes("snapshot")) return "snapshot";
  if (sources.includes("demo")) return "demo";
  if (sources.every((source) => source === "live")) return "live";
  return "unknown";
}

function mapMetaCreativesSnapshotSource(value: unknown): CreativeEvidenceSource {
  if (value === "live" || value === "refresh") return "live";
  if (value === "persisted") return "snapshot";
  return "unknown";
}

function resolveCreativeDecisionTimeline(input: {
  startDate: string;
  endDate: string;
  analyticsStartDate?: string | null;
  analyticsEndDate?: string | null;
  decisionAsOf?: string | null;
}) {
  const reportingStartDate = input.startDate;
  const reportingEndDate = input.endDate;
  const analyticsStartDate = input.analyticsStartDate?.trim() || reportingStartDate;
  const analyticsEndDate = input.analyticsEndDate?.trim() || reportingEndDate;
  const decisionAsOf = input.decisionAsOf?.trim() || null;

  return {
    reportingStartDate,
    reportingEndDate,
    analyticsStartDate,
    analyticsEndDate,
    decisionAsOf,
  };
}

function toHistoricalWindow(row: MetaCreativeRow) {
  return {
    spend: row.spend,
    purchaseValue: row.purchaseValue,
    roas: row.roas,
    cpa: row.cpa,
    ctr: row.ctrAll,
    purchases: row.purchases,
    impressions: row.impressions,
    linkClicks: row.linkClicks,
    hookRate: row.thumbstop,
    holdRate: row.video100,
    video25Rate: row.video25,
    watchRate: row.video50,
    video75Rate: row.video75,
    clickToPurchaseRate: row.clickToPurchase,
    atcToPurchaseRate: row.atcToPurchaseRatio,
  };
}

function buildHistoryById(
  input: Partial<Record<keyof CreativeDecisionOsHistoricalWindows, MetaCreativeRow[]>>,
) {
  const map = new Map<string, CreativeDecisionOsHistoricalWindows>();
  for (const [windowKey, rows] of Object.entries(input) as Array<
    [keyof CreativeDecisionOsHistoricalWindows, MetaCreativeRow[] | undefined]
  >) {
    for (const row of rows ?? []) {
      const current = map.get(row.id) ?? {};
      current[windowKey] = toHistoricalWindow(row);
      map.set(row.id, current);
    }
  }
  return map;
}

function calculateCreativeAgeDays(launchDate: string) {
  const launchMs = Date.parse(`${launchDate}T00:00:00.000Z`);
  if (!Number.isFinite(launchMs)) return 0;
  return Math.max(0, Math.round((Date.now() - launchMs) / 86_400_000));
}

function toDecisionInputRow(
  row: MetaCreativeRow,
  history: CreativeDecisionOsHistoricalWindows | null,
): CreativeDecisionOsInputRow {
  const frequency = Number((row as MetaCreativeRow & { frequency?: number }).frequency ?? 0);
  const creativeAgeDays = calculateCreativeAgeDays(row.launchDate);

  return {
    creativeId: row.id,
    name: row.name,
    creativeFormat: row.format,
    previewUrl: row.previewUrl ?? null,
    imageUrl: row.imageUrl ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    tableThumbnailUrl: row.tableThumbnailUrl ?? null,
    cardPreviewUrl: row.cardPreviewUrl ?? null,
    cachedThumbnailUrl: row.cachedThumbnailUrl ?? null,
    previewManifest: row.previewManifest ?? null,
    creativeAgeDays,
    spendVelocity: row.spend / Math.max(1, creativeAgeDays || 1),
    frequency,
    spend: row.spend,
    purchaseValue: row.purchaseValue,
    roas: row.roas,
    cpa: row.cpa,
    ctr: row.ctrAll,
    cpm: row.cpm,
    cpc: row.cpcLink,
    purchases: row.purchases,
    impressions: row.impressions,
    linkClicks: row.linkClicks,
    hookRate: row.thumbstop,
    holdRate: row.video100,
    video25Rate: row.video25,
    watchRate: row.video50,
    video75Rate: row.video75,
    clickToPurchaseRate: row.clickToPurchase,
    atcToPurchaseRate: row.atcToPurchaseRatio,
    copyText: row.copyText ?? null,
    copyVariants: row.copyVariants ?? [],
    headlineVariants: row.headlineVariants ?? [],
    descriptionVariants: row.descriptionVariants ?? [],
    objectStoryId: row.objectStoryId ?? null,
    effectiveObjectStoryId: row.effectiveObjectStoryId ?? null,
    postId: row.postId ?? null,
    accountId: row.accountId ?? null,
    accountName: row.accountName ?? null,
    campaignId: row.campaignId ?? null,
    campaignName: row.campaignName ?? null,
    adSetId: row.adSetId ?? null,
    adSetName: row.adSetName ?? null,
    taxonomyPrimaryLabel: row.creativePrimaryLabel ?? null,
    taxonomySecondaryLabel: row.creativeSecondaryLabel ?? null,
    taxonomyVisualFormat: row.creativeVisualFormat ?? null,
    aiTags: row.aiTags ?? {},
    historicalWindows: history,
  };
}

function normalizeStatus(value: string | null | undefined) {
  return value?.trim().toUpperCase() || null;
}

function isActiveMetaStatus(value: string | null | undefined) {
  return normalizeStatus(value) === "ACTIVE";
}

function buildCampaignStatusMap(rows: MetaCampaignRow[]) {
  return new Map(rows.map((row) => [row.id, normalizeStatus(row.status)]));
}

function buildAdSetStatusMap(rows: MetaAdSetData[]) {
  return new Map(rows.map((row) => [row.id, normalizeStatus(row.status)]));
}

export function deriveCurrentActiveContext(input: {
  contextRow: Pick<MetaCreativeRow, "campaignId" | "adSetId"> | null;
  campaignStatusById: Map<string, string | null>;
  adSetStatusById: Map<string, string | null>;
}): ActiveContext {
  const campaignStatus = input.contextRow?.campaignId
    ? (input.campaignStatusById.get(input.contextRow.campaignId) ?? null)
    : null;
  const adSetStatus = input.contextRow?.adSetId
    ? (input.adSetStatusById.get(input.contextRow.adSetId) ?? null)
    : null;

  if (adSetStatus) {
    return {
      isActive: isActiveMetaStatus(adSetStatus) && (campaignStatus == null || isActiveMetaStatus(campaignStatus)),
      campaignStatus,
      adSetStatus,
      source: "campaign_and_adset",
    };
  }

  if (campaignStatus) {
    return {
      isActive: isActiveMetaStatus(campaignStatus),
      campaignStatus,
      adSetStatus,
      source: "campaign_only",
    };
  }

  return {
    isActive: false,
    campaignStatus,
    adSetStatus,
    source: "missing_context",
  };
}

export function selectDeterministicAuditSample<T extends AuditSampleCandidate>(
  rows: T[],
  limit = MAX_ROWS_PER_BUSINESS,
) {
  const sortRows = (input: T[]) =>
    [...input].sort(
      (left, right) =>
        right.spend - left.spend || left.creativeId.localeCompare(right.creativeId),
    );

  const active = sortRows(rows.filter((row) => row.isActive));
  const inactive = sortRows(rows.filter((row) => !row.isActive));
  return [...active, ...inactive].slice(0, limit);
}

function metricWindow(
  rowsById: Map<string, MetaCreativeRow>,
  creativeId: string,
) {
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

function summarizeBaseline(baseline: CreativeDecisionRelativeBaseline): AuditBaselineSummary {
  return {
    scope: baseline.scope,
    reliability: baseline.reliability,
    sampleSize: baseline.sampleSize,
    creativeCount: baseline.creativeCount,
    eligibleCreativeCount: baseline.eligibleCreativeCount,
    spendBasis: round(baseline.spendBasis),
    purchaseBasis: round(baseline.purchaseBasis),
    weightedRoas: nullableRound(baseline.weightedRoas),
    weightedCpa: nullableRound(baseline.weightedCpa),
    medianRoas: nullableRound(baseline.medianRoas),
    medianCpa: nullableRound(baseline.medianCpa),
    medianSpend: nullableRound(baseline.medianSpend),
    missingContext: baseline.missingContext,
  };
}

function summarizeCampaignBaseline(creative: CreativeDecisionOsCreative): AuditBaselineSummary | null {
  if (creative.benchmarkScope !== "campaign") return null;
  return summarizeBaseline(creative.relativeBaseline);
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
    frequency: contextRow?.impressions && contextRow.impressions > 0
      ? round(contextRow.clicks / Math.max(1, contextRow.impressions), 4)
      : 0,
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
    clickToPurchaseRate:
      creative.linkClicks > 0 ? (creative.purchases / creative.linkClicks) * 100 : 0,
    atcToPurchaseRate: contextRow?.atcToPurchaseRatio ?? 0,
    accountId: contextRow?.accountId ?? null,
    accountName: contextRow?.accountName ?? null,
    campaignId: contextRow?.campaignId ?? null,
    campaignName: contextRow?.campaignName ?? null,
    adSetId: contextRow?.adSetId ?? null,
    adSetName: contextRow?.adSetName ?? null,
  };
}

function hasNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasRelativeBaselineContext(creative: CreativeDecisionOsCreative) {
  const baseline = creative.relativeBaseline;
  const reliable = baseline.reliability === "strong" || baseline.reliability === "medium";
  return (
    reliable &&
    baseline.sampleSize >= 3 &&
    baseline.eligibleCreativeCount >= 3 &&
    hasNumber(baseline.spendBasis) &&
    baseline.spendBasis >= 150 &&
    hasNumber(baseline.purchaseBasis) &&
    baseline.purchaseBasis >= 3 &&
    hasNumber(baseline.medianRoas) &&
    baseline.medianRoas > 0 &&
    hasNumber(baseline.medianSpend) &&
    baseline.medianSpend > 0
  );
}

function hasStrongRelativeBaselineContext(creative: CreativeDecisionOsCreative) {
  const baseline = creative.relativeBaseline;
  return (
    hasRelativeBaselineContext(creative) &&
    baseline.reliability === "strong" &&
    baseline.sampleSize >= 6 &&
    baseline.eligibleCreativeCount >= 6 &&
    (baseline.spendBasis ?? 0) >= 500 &&
    (baseline.purchaseBasis ?? 0) >= 8
  );
}

function hasRelativeScaleReviewEvidence(creative: CreativeDecisionOsCreative) {
  const baseline = creative.relativeBaseline;
  const medianSpend = baseline.medianSpend ?? 0;
  const medianRoas = baseline.medianRoas ?? 0;
  const medianCpa = baseline.medianCpa ?? null;
  if (!hasRelativeBaselineContext(creative)) return false;
  if (!hasNumber(creative.spend) || !hasNumber(creative.purchases) || !hasNumber(creative.roas)) {
    return false;
  }
  if (creative.spend < Math.max(80, medianSpend * 0.2)) return false;
  if (creative.purchases < 2) return false;
  if (creative.roas < medianRoas * 1.4) return false;
  if (
    hasNumber(creative.cpa) &&
    creative.cpa > 0 &&
    hasNumber(medianCpa) &&
    medianCpa > 0 &&
    creative.cpa > medianCpa * 1.2
  ) {
    return false;
  }
  return true;
}

function hasTrueScaleEvidence(creative: CreativeDecisionOsCreative) {
  const baseline = creative.relativeBaseline;
  const medianRoas = baseline.medianRoas ?? 0;
  const medianCpa = baseline.medianCpa ?? null;
  const medianSpend = baseline.medianSpend ?? 0;
  if (!hasStrongRelativeBaselineContext(creative)) return false;
  if (creative.economics.status !== "eligible") return false;
  if (!hasRelativeScaleReviewEvidence(creative)) return false;
  if (!hasNumber(creative.spend) || creative.spend < Math.max(300, medianSpend * 1.3)) {
    return false;
  }
  if (!hasNumber(creative.purchases) || creative.purchases < 6) return false;
  if (!hasNumber(creative.roas) || creative.roas < medianRoas * 1.6) return false;
  if (
    hasNumber(creative.cpa) &&
    creative.cpa > 0 &&
    hasNumber(medianCpa) &&
    medianCpa > 0 &&
    creative.cpa > medianCpa
  ) {
    return false;
  }
  return true;
}

function resolveBusinessValidationStatus(input: {
  creative: CreativeDecisionOsCreative;
  commercialTruthConfigured: boolean;
}) {
  if (
    !input.commercialTruthConfigured ||
    input.creative.trust.truthState === "degraded_missing_truth" ||
    input.creative.trust.operatorDisposition === "profitable_truth_capped"
  ) {
    return "missing" as const;
  }

  if (
    input.creative.economics.status !== "eligible" ||
    input.creative.trust.truthState !== "live_confident" ||
    input.creative.trust.evidence?.aggressiveActionBlocked === true ||
    input.creative.trust.evidence?.suppressed === true
  ) {
    return "unfavorable" as const;
  }

  return "favorable" as const;
}

function hasWeakCampaignContext(creative: CreativeDecisionOsCreative) {
  return (
    creative.deployment.compatibility.status === "limited" ||
    creative.deployment.compatibility.status === "blocked"
  );
}

function isReviewOnlyScaleCandidate(input: {
  creative: CreativeDecisionOsCreative;
  commercialTruthConfigured: boolean;
}) {
  const businessValidationStatus = resolveBusinessValidationStatus(input);
  return (
    businessValidationStatus === "missing" &&
    hasTrueScaleEvidence(input.creative) &&
    input.creative.primaryAction !== "hold_no_touch" &&
    input.creative.primaryAction !== "refresh_replace" &&
    input.creative.primaryAction !== "block_deploy" &&
    input.creative.lifecycleState !== "fatigued_winner" &&
    input.creative.fatigue.status !== "fatigued" &&
    !hasWeakCampaignContext(input.creative)
  );
}

function mapOldRuleSegmentLabel(action: string | null | undefined) {
  switch (action) {
    case "scale":
    case "scale_hard":
      return "Scale";
    case "test_more":
      return "Test More";
    case "watch":
      return "Watch";
    case "pause":
    case "kill":
      return "Cut";
    default:
      return null;
  }
}

async function resolveBusinessNames(businessIds: string[]) {
  const sql = getDb();
  if (businessIds.length === 0) return new Map<string, string | null>();
  const rows = await sql.query<{ id: string; name: string | null }>(
    `SELECT id, name FROM businesses WHERE id = ANY($1::uuid[])`,
    [businessIds],
  );
  return new Map(rows.map((row) => [row.id, row.name ?? null]));
}

function buildRequestUrl(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  decisionAsOf?: string;
}) {
  const url = new URL("http://localhost/api/creatives/decision-os");
  url.searchParams.set("businessId", input.businessId);
  url.searchParams.set("startDate", input.startDate);
  url.searchParams.set("endDate", input.endDate);
  if (input.decisionAsOf) url.searchParams.set("decisionAsOf", input.decisionAsOf);
  return url.toString();
}

async function fetchWindowRows(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  source?: "live" | "warehouse";
}) {
  if (input.source === "warehouse") {
    const payload = await getMetaCreativesDbPayload({
      businessId: input.businessId,
      start: input.startDate,
      end: input.endDate,
      groupBy: "creative",
      format: "all",
      sort: "spend",
      mediaMode: "metadata",
    });
    return {
      status: typeof payload.status === "string" ? payload.status : null,
      snapshotSource:
        "snapshot_source" in payload && typeof payload.snapshot_source === "string"
          ? payload.snapshot_source
          : null,
      rows: ((payload.rows ?? []) as MetaCreativeApiRow[]).map(mapApiRowToUiRow),
    };
  }
  const request = new NextRequest(buildRequestUrl({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    decisionAsOf: input.endDate,
  }));
  return fetchCreativePayload({
    request,
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
}

async function getCreativeDecisionOsForRangeWarehouseBacked(input: {
  request: NextRequest;
  businessId: string;
  startDate: string;
  endDate: string;
  analyticsStartDate?: string | null;
  analyticsEndDate?: string | null;
  decisionAsOf?: string | null;
  benchmarkScope?: CreativeDecisionBenchmarkScopeInput | null;
}): Promise<CreativeDecisionOsV1Response> {
  const timeline = resolveCreativeDecisionTimeline({
    startDate: input.startDate,
    endDate: input.endDate,
    analyticsStartDate: input.analyticsStartDate,
    analyticsEndDate: input.analyticsEndDate,
    decisionAsOf: input.decisionAsOf,
  });
  const decisionContext = await getMetaDecisionWindowContext({
    businessId: input.businessId,
    startDate: timeline.analyticsStartDate,
    endDate: timeline.analyticsEndDate,
    decisionAsOf: timeline.decisionAsOf,
  });
  const primaryWindow = decisionContext.decisionWindows.primary30d;
  const windowDefs = {
    last3: { startDate: addDaysToIsoDate(decisionContext.decisionAsOf, -2), endDate: decisionContext.decisionAsOf },
    last7: { startDate: addDaysToIsoDate(decisionContext.decisionAsOf, -6), endDate: decisionContext.decisionAsOf },
    last14: { startDate: addDaysToIsoDate(decisionContext.decisionAsOf, -13), endDate: decisionContext.decisionAsOf },
    last30: { startDate: primaryWindow.startDate, endDate: primaryWindow.endDate },
    last90: { startDate: addDaysToIsoDate(decisionContext.decisionAsOf, -89), endDate: decisionContext.decisionAsOf },
    allHistory: {
      startDate: addDaysToIsoDate(decisionContext.decisionAsOf, -(META_WAREHOUSE_HISTORY_DAYS - 1)),
      endDate: decisionContext.decisionAsOf,
    },
  } satisfies Record<keyof CreativeDecisionOsHistoricalWindows, { startDate: string; endDate: string }>;

  const [primary, last3, last7, last14, last90, allHistory, decisionSnapshot, selectedPeriod] =
    await Promise.all([
      fetchWindowRows({ businessId: input.businessId, ...windowDefs.last30, source: "warehouse" }),
      fetchWindowRows({ businessId: input.businessId, ...windowDefs.last3, source: "warehouse" }),
      fetchWindowRows({ businessId: input.businessId, ...windowDefs.last7, source: "warehouse" }),
      fetchWindowRows({ businessId: input.businessId, ...windowDefs.last14, source: "warehouse" }),
      fetchWindowRows({ businessId: input.businessId, ...windowDefs.last90, source: "warehouse" }),
      fetchWindowRows({ businessId: input.businessId, ...windowDefs.allHistory, source: "warehouse" }),
      getMetaDecisionSourceSnapshot({
        businessId: input.businessId,
        decisionWindows: decisionContext.decisionWindows,
      }),
      fetchWindowRows({
        businessId: input.businessId,
        startDate: timeline.reportingStartDate,
        endDate: timeline.reportingEndDate,
        source: "warehouse",
      }).catch(() => null),
    ]);

  const evidenceSource = combineCreativeEvidenceSource([
    mapMetaCreativesSnapshotSource(primary.snapshotSource),
    mapMetaCreativesSnapshotSource(last3.snapshotSource),
    mapMetaCreativesSnapshotSource(last7.snapshotSource),
    mapMetaCreativesSnapshotSource(last14.snapshotSource),
    mapMetaCreativesSnapshotSource(last90.snapshotSource),
    mapMetaCreativesSnapshotSource(allHistory.snapshotSource),
    decisionSnapshot.campaigns.evidenceSource,
    decisionSnapshot.adSets.evidenceSource,
  ]);
  const historyById = buildHistoryById({
    last3: last3.rows,
    last7: last7.rows,
    last14: last14.rows,
    last30: primary.rows,
    last90: last90.rows,
    allHistory: allHistory.rows,
  });
  const snapshot = await getBusinessCommercialTruthSnapshot(input.businessId);
  const operatingMode = buildAccountOperatingMode({
    businessId: input.businessId,
    startDate: timeline.analyticsStartDate,
    endDate: timeline.analyticsEndDate,
    analyticsWindow: decisionContext.analyticsWindow,
    decisionWindows: decisionContext.decisionWindows,
    historicalMemory: decisionContext.historicalMemory,
    decisionAsOf: decisionContext.decisionAsOf,
    snapshot,
    campaigns: { rows: decisionSnapshot.campaigns.rows ?? [] },
    breakdowns: decisionSnapshot.breakdowns,
  });
  const historicalAnalysis =
    selectedPeriod?.rows && selectedPeriod.rows.length > 0
      ? buildCreativeHistoricalAnalysis({
          startDate: timeline.reportingStartDate,
          endDate: timeline.reportingEndDate,
          rows: selectedPeriod.rows.map((row) => toDecisionInputRow(row, null)),
        })
      : buildEmptyCreativeHistoricalAnalysis({
          startDate: timeline.reportingStartDate,
          endDate: timeline.reportingEndDate,
        });

  return {
    ...buildCreativeDecisionOs({
      businessId: input.businessId,
      startDate: timeline.reportingStartDate,
      endDate: timeline.reportingEndDate,
      analyticsWindow: decisionContext.analyticsWindow,
      decisionWindows: decisionContext.decisionWindows,
      historicalMemory: decisionContext.historicalMemory,
      decisionAsOf: decisionContext.decisionAsOf,
      evidenceSource,
      rows: primary.rows.map((row) => toDecisionInputRow(row, historyById.get(row.id) ?? null)),
      campaigns: decisionSnapshot.campaigns.rows ?? [],
      adSets: decisionSnapshot.adSets.rows ?? [],
      breakdowns: {
        location: decisionSnapshot.breakdowns.location ?? [],
      },
      commercialTruth: snapshot,
      operatingMode,
      benchmarkScope: input.benchmarkScope ?? null,
    }),
    historicalAnalysis,
  };
}

async function discoverRuntimeEligibleBusinesses(auditWindow: AuditWindow) {
  const candidateRows = await getCandidateBusinesses();
  const candidateEligibility = summarizeCandidateEligibility(candidateRows);
  const runtimeTokenReadability = await assessRuntimeTokenReadability({
    candidates: candidateEligibility.eligible,
  });
  const runtimeSkippedCandidatesByReason = { ...EMPTY_RUNTIME_SKIPS };
  const runtimeTokenReadabilityBlocker = buildRuntimeTokenReadabilityBlocker(
    runtimeTokenReadability.status,
  );
  if (runtimeTokenReadabilityBlocker) {
    throw new Error(runtimeTokenReadabilityBlocker);
  }

  const runtimeEligibleBusinesses: Array<{
    business: SourceBusinessRow;
    live30d: FetchCreativePayloadResult;
  }> = [];

  for (const [candidateIndex, business] of candidateEligibility.eligible.entries()) {
    debug("screening-candidate", {
      candidate: candidateIndex + 1,
      total: candidateEligibility.eligible.length,
    });
    const request = new NextRequest(
      buildRequestUrl({
        businessId: business.business_id,
        startDate: auditWindow.startDate,
        endDate: auditWindow.endDate,
        decisionAsOf: auditWindow.endDate,
      }),
    );

    const live30d = await withTimeout(
      fetchCreativePayload({
        request,
        businessId: business.business_id,
        startDate: auditWindow.startDate,
        endDate: auditWindow.endDate,
        snapshotBypass: true,
      }),
      SCREEN_TIMEOUT_MS,
      "Timed out reading live creative payload for runtime eligibility.",
    ).catch(() => null);
    if (!live30d) {
      runtimeSkippedCandidatesByReason.provider_read_failure += 1;
      debug("screening-skip", {
        candidate: candidateIndex + 1,
        reason: "provider_read_failure",
      });
      continue;
    }

    const integration = await getIntegration(business.business_id, "meta").catch(() => null);
    const assignedAccountIds = await fetchAssignedAccountIds(business.business_id).catch(
      () => [],
    );
    const accountProbes =
      live30d.rows.length === 0 && integration?.access_token
        ? await probeLiveMetaAccountAccess({
            accessToken: integration.access_token,
            accountIds: assignedAccountIds,
            startDate: auditWindow.startDate,
            endDate: auditWindow.endDate,
          })
        : [];
    const runtimeSkipReason = classifyRuntimeCandidateSkip({
      payloadStatus: live30d.status,
      tableRowCount: live30d.rows.length,
      accountProbes,
    });
    if (runtimeSkipReason) {
      runtimeSkippedCandidatesByReason[runtimeSkipReason] += 1;
      debug("screening-skip", {
        candidate: candidateIndex + 1,
        reason: runtimeSkipReason,
      });
      continue;
    }

    runtimeEligibleBusinesses.push({ business, live30d });
    debug("screening-eligible", {
      candidate: candidateIndex + 1,
      rows: live30d.rows.length,
    });
  }

  if (
    shouldReportNoLiveReadableBusinesses({
      runtimeTokenReadabilityStatus: runtimeTokenReadability.status,
      runtimeEligibleCandidateCount: runtimeEligibleBusinesses.length,
    })
  ) {
    throw new Error("No live Meta-readable businesses were available for the live-firm audit.");
  }

  const businessNames = await resolveBusinessNames(
    runtimeEligibleBusinesses.map(({ business }) => business.business_id),
  );
  const assigned = assignStableCompanyAliases(
    runtimeEligibleBusinesses.map(({ business, live30d }) => ({
      businessId: business.business_id,
      business,
      live30d,
    })),
  ).map((row) => ({
    business: row.business,
    companyAlias: row.companyAlias,
    businessName: businessNames.get(row.business.business_id) ?? null,
    live30d: row.live30d,
  }));

  return {
    candidateRows,
    candidateEligibility,
    runtimeTokenReadability,
    runtimeSkippedCandidatesByReason,
    runtimeEligibleBusinesses: assigned,
  };
}

function isDirectRun() {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

async function persistArtifacts(input: {
  sanitized: SanitizedAuditArtifact;
  localPrivate: PrivateAuditArtifact;
}) {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await writeFile(
    SANITIZED_ARTIFACT_PATH,
    `${JSON.stringify(input.sanitized, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    LOCAL_PRIVATE_ARTIFACT_PATH,
    `${JSON.stringify(input.localPrivate, null, 2)}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        sanitizedArtifact: SANITIZED_ARTIFACT_PATH,
        localPrivateArtifact: LOCAL_PRIVATE_ARTIFACT_PATH,
        businesses: input.sanitized.cohort.runtimeEligibleBusinesses,
        sampledCreatives: input.sanitized.globalSummary.sampledCreatives,
        userFacingSegments: input.sanitized.globalSummary.userFacingSegments,
      },
      null,
      2,
    ),
  );
}

export async function runCreativeLiveFirmAudit() {
  const restoreRuntime = installSanitizedRuntimeGuards();
  try {
    const generatedAt = new Date().toISOString();
    const auditWindow = resolveAuditWindow();
    const discovery = await discoverRuntimeEligibleBusinesses(auditWindow);
    const sanitizedRows: SanitizedAuditRow[] = [];
    const localPrivateRows: PrivateAuditRow[] = [];
    const businessSummaries: BusinessAuditSummary[] = [];
    const globalSegments: Record<string, number> = {};

    for (const runtimeEligible of discovery.runtimeEligibleBusinesses) {
      const businessId = runtimeEligible.business.business_id;
      debug("evaluating-business", {
        companyAlias: runtimeEligible.companyAlias,
      });
      const request = new NextRequest(
        buildRequestUrl({
          businessId,
          startDate: auditWindow.startDate,
          endDate: auditWindow.endDate,
          decisionAsOf: auditWindow.endDate,
        }),
      );
      const decisionOs = await getCreativeDecisionOsForRangeWarehouseBacked({
        request,
        businessId,
        startDate: auditWindow.startDate,
        endDate: auditWindow.endDate,
        decisionAsOf: auditWindow.endDate,
      });

      const decisionContext = await getMetaDecisionWindowContext({
        businessId,
        startDate: auditWindow.startDate,
        endDate: auditWindow.endDate,
        decisionAsOf: auditWindow.endDate,
      });
      const sourceSnapshot = await getMetaDecisionSourceSnapshot({
        businessId,
        decisionWindows: decisionContext.decisionWindows,
      });
      const last7 = await fetchWindowRows({
        businessId,
        startDate: addDaysToIsoDate(auditWindow.endDate, -6),
        endDate: auditWindow.endDate,
        source: "warehouse",
      });
      const last90 = await fetchWindowRows({
        businessId,
        startDate: addDaysToIsoDate(auditWindow.endDate, -89),
        endDate: auditWindow.endDate,
        source: "warehouse",
      });
      const live30d = runtimeEligible.live30d;

      const currentRowsById = new Map(live30d.rows.map((row) => [row.id, row]));
      const last7ById = new Map(last7.rows.map((row) => [row.id, row]));
      const last90ById = new Map(last90.rows.map((row) => [row.id, row]));
      const campaignStatusById = buildCampaignStatusMap(sourceSnapshot.campaigns.rows ?? []);
      const adSetStatusById = buildAdSetStatusMap(sourceSnapshot.adSets.rows ?? []);

      const sampled = selectDeterministicAuditSample(
        decisionOs.creatives.map((creative) => {
          const contextRow = currentRowsById.get(creative.creativeId) ?? null;
          const active = deriveCurrentActiveContext({
            contextRow,
            campaignStatusById,
            adSetStatusById,
          });
          return {
            creativeId: creative.creativeId,
            spend: creative.spend,
            isActive: active.isActive,
            creative,
            contextRow,
            active,
          };
        }),
      );

      const accountAliasFactory = buildAliasFactory(`${runtimeEligible.companyAlias}-account`);
      const campaignAliasFactory = buildAliasFactory(`${runtimeEligible.companyAlias}-campaign`);
      const adSetAliasFactory = buildAliasFactory(`${runtimeEligible.companyAlias}-adset`);
      const creativeAliasFactory = buildAliasFactory(`${runtimeEligible.companyAlias}-creative`);

      const allOldRule = buildCreativeOldRuleChallenger(
        decisionOs.creatives.map((creative) =>
          toOldRuleInput(creative, currentRowsById.get(creative.creativeId) ?? null),
        ),
      );
      const oldRuleById = new Map(allOldRule.map((row) => [row.creativeId, row]));

      const segmentCounts: Record<string, number> = {};
      const oldChallengerCounts: Record<string, number> = {};

      for (const entry of sampled) {
        const creative = entry.creative;
        const operatorItem = buildCreativeOperatorItem(creative);
        const oldRule = oldRuleById.get(creative.creativeId) ?? null;
        const companyAlias = runtimeEligible.companyAlias;
        const accountAlias = accountAliasFactory(entry.contextRow?.accountId ?? entry.contextRow?.accountName);
        const campaignAlias = campaignAliasFactory(entry.contextRow?.campaignName ?? entry.contextRow?.campaignId);
        const adSetAlias = adSetAliasFactory(entry.contextRow?.adSetName ?? entry.contextRow?.adSetId);
        const creativeAlias = creativeAliasFactory(creative.name);
        const replacements: Array<[string | null | undefined, string]> = [
          [entry.contextRow?.accountName, accountAlias],
          [entry.contextRow?.accountId, accountAlias],
          [entry.contextRow?.campaignName, campaignAlias],
          [entry.contextRow?.campaignId, campaignAlias],
          [entry.contextRow?.adSetName, adSetAlias],
          [entry.contextRow?.adSetId, adSetAlias],
          [creative.name, creativeAlias],
          [creative.creativeId, creativeAlias],
        ];
        const userFacingSegment = creativeOperatorSegmentLabel(creative);
        const oldRuleSegment = oldRule?.challengerAction ?? null;
        const commercialTruthConfigured =
          decisionOs.commercialTruthCoverage.configuredSections.targetPack;
        const businessValidationStatus = resolveBusinessValidationStatus({
          creative,
          commercialTruthConfigured,
        });
        const relativeStrengthClass = hasTrueScaleEvidence(creative)
          ? isReviewOnlyScaleCandidate({
              creative,
              commercialTruthConfigured,
            })
            ? "review_only_scale_candidate"
            : "true_scale_candidate"
          : hasRelativeScaleReviewEvidence(creative)
            ? "strong_relative"
            : "none";

        const sanitizedRow: SanitizedAuditRow = {
          companyAlias,
          accountAlias,
          campaignAlias,
          adSetAlias,
          creativeAlias,
          activeStatus: entry.active.isActive,
          activeStatusSource: entry.active.source,
          campaignStatus: entry.active.campaignStatus,
          adSetStatus: entry.active.adSetStatus,
          spend30d: round(creative.spend),
          recent7d: metricWindow(last7ById, creative.creativeId),
          mid30d: metricWindow(currentRowsById, creative.creativeId),
          long90d: metricWindow(last90ById, creative.creativeId),
          currentDecisionOsInternalSegment: creative.operatorPolicy?.segment ?? null,
          currentUserFacingSegment: userFacingSegment,
          currentInstructionHeadline: sanitizeText(operatorItem.instruction?.headline ?? "", replacements),
          reasonSummary: sanitizeText(operatorItem.reason, replacements),
          nextObservation: (operatorItem.instruction?.nextObservation ?? []).map((value) =>
            sanitizeText(value, replacements),
          ),
          benchmarkScope: creative.benchmarkScope,
          benchmarkScopeLabel: sanitizeText(creative.benchmarkScopeLabel, replacements),
          baselineReliability: creative.benchmarkReliability,
          accountBaseline: summarizeBaseline(creative.relativeBaseline),
          campaignBaseline: summarizeCampaignBaseline(creative),
          commercialTruthAvailability: {
            targetPackConfigured: commercialTruthConfigured,
            missingInputs: decisionOs.commercialTruthCoverage.missingInputs,
          },
          businessValidationStatus,
          pushReadiness: creative.operatorPolicy?.pushReadiness ?? null,
          queueEligible: creative.operatorPolicy?.queueEligible ?? false,
          canApply: creative.operatorPolicy?.canApply ?? false,
          lifecycleState: creative.lifecycleState,
          primaryAction: creative.primaryAction,
          evidenceSource: creative.evidenceSource,
          trustState: creative.trust.truthState,
          previewWindow: creative.previewStatus?.liveDecisionWindow ?? null,
          deploymentCompatibility: creative.deployment.compatibility.status,
          deploymentTargetLane: creative.deployment.targetLane ?? null,
          oldRuleChallengerAction: oldRule?.challengerAction ?? null,
          oldRuleChallengerSegment: mapOldRuleSegmentLabel(oldRule?.challengerAction),
          oldRuleChallengerReason: oldRule ? sanitizeText(oldRule.reason, replacements) : null,
          relativeStrengthClass,
          campaignContextLimited: hasWeakCampaignContext(creative),
        };

        const privateRow: PrivateAuditRow = {
          ...sanitizedRow,
          businessId,
          businessName: runtimeEligible.businessName,
          accountName: entry.contextRow?.accountName ?? null,
          campaignName: entry.contextRow?.campaignName ?? null,
          adSetName: entry.contextRow?.adSetName ?? null,
          creativeName: creative.name,
          creativeId: creative.creativeId,
        };

        sanitizedRows.push(sanitizedRow);
        localPrivateRows.push(privateRow);
        increment(segmentCounts, userFacingSegment);
        increment(oldChallengerCounts, oldRuleSegment);
        increment(globalSegments, userFacingSegment);
      }

      businessSummaries.push({
        companyAlias: runtimeEligible.companyAlias,
        screeningLiveRows: runtimeEligible.live30d.rows.length,
        currentDecisionOsRows: decisionOs.creatives.length,
        sampledCreatives: sampled.length,
        activeCreativesSampled: sampled.filter((row) => row.isActive).length,
        userFacingSegments: segmentCounts,
        oldChallengerSegments: oldChallengerCounts,
        zeroScale: (segmentCounts.Scale ?? 0) === 0,
        zeroScaleReview: (segmentCounts["Scale Review"] ?? 0) === 0,
      });
      debug("evaluated-business", {
        companyAlias: runtimeEligible.companyAlias,
        creatives: decisionOs.creatives.length,
        sampled: sampled.length,
      });
    }

    const sanitizedArtifact: SanitizedAuditArtifact = {
      generatedAt,
      source: "creative_live_firm_audit",
      auditWindow,
      sanitization: {
        rawIdsIncluded: false,
        rawNamesIncluded: false,
        notes: [
          "Company, campaign, ad set, account, and creative identifiers are replaced with stable aliases.",
          "A local private reference artifact with raw names is written to /tmp and is not committed.",
        ],
      },
      cohort: {
        historicalSnapshotCandidates: discovery.candidateRows.length,
        eligibleCandidates: discovery.candidateEligibility.eligible.length,
        runtimeEligibleBusinesses: discovery.runtimeEligibleBusinesses.length,
        runtimeSkippedCandidates: countRuntimeSkippedCandidates(
          discovery.runtimeSkippedCandidatesByReason,
        ),
        runtimeSkippedCandidatesByReason: discovery.runtimeSkippedCandidatesByReason,
        runtimeTokenReadabilityStatus: discovery.runtimeTokenReadability.status,
      },
      globalSummary: {
        sampledCreatives: sanitizedRows.length,
        businessesWithZeroScale: businessSummaries.filter((row) => row.zeroScale).length,
        businessesWithZeroScaleReview: businessSummaries.filter((row) => row.zeroScaleReview).length,
        userFacingSegments: globalSegments,
      },
      businesses: businessSummaries,
      rows: sanitizedRows,
    };

    const privateArtifact: PrivateAuditArtifact = {
      ...sanitizedArtifact,
      businesses: discovery.runtimeEligibleBusinesses.map((business) => {
        const summary =
          businessSummaries.find((row) => row.companyAlias === business.companyAlias) ??
          {
            companyAlias: business.companyAlias,
            screeningLiveRows: business.live30d.rows.length,
            currentDecisionOsRows: 0,
            sampledCreatives: 0,
            activeCreativesSampled: 0,
            userFacingSegments: {},
            oldChallengerSegments: {},
            zeroScale: true,
            zeroScaleReview: true,
          };
        return {
          ...summary,
          businessId: business.business.business_id,
          businessName: business.businessName,
        };
      }),
      rows: localPrivateRows,
    };

    await persistArtifacts({
      sanitized: sanitizedArtifact,
      localPrivate: privateArtifact,
    });

    return {
      sanitizedArtifact,
      privateArtifact,
    };
  } finally {
    restoreRuntime();
  }
}

if (isDirectRun()) {
  runCreativeLiveFirmAudit()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => {
      resetDbClientCache();
    });
}
