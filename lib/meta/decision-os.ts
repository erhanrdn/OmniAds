import type { MetaBreakdownsResponse } from "@/app/api/meta/breakdowns/route";
import type { MetaCampaignRow } from "@/app/api/meta/campaigns/route";
import type { MetaAdSetData } from "@/lib/api/meta";
import { buildOperatorDecisionMetadata } from "@/lib/operator-decision-metadata";
import { buildMetaCampaignLaneSignals } from "@/lib/meta/campaign-lanes";
import { buildAccountOperatingMode } from "@/lib/business-operating-mode";
import type {
  AccountOperatingModePayload,
  BusinessCommercialTruthSnapshot,
  BusinessCountryEconomicsRow,
} from "@/src/types/business-commercial";
import type {
  OperatorAnalyticsWindow,
  OperatorDecisionWindows,
  OperatorHistoricalMemory,
} from "@/src/types/operator-decision";
import type {
  DecisionOperatorDisposition,
  DecisionSurfaceLane,
  DecisionTrustMetadata,
} from "@/src/types/decision-trust";

export const META_DECISION_OS_V1_CONTRACT = "meta-decision-os.v1" as const;

export const META_CAMPAIGN_ROLES = [
  "Promo / Clearance",
  "Catalog / DPA",
  "Retargeting",
  "Existing Customer / LTV",
  "Geo Expansion",
  "Prospecting Scale",
  "Prospecting Validation",
  "Prospecting Test",
] as const;
export type MetaCampaignRole = (typeof META_CAMPAIGN_ROLES)[number];

export const META_AD_SET_ACTION_TYPES = [
  "pause",
  "recover",
  "rebuild",
  "scale_budget",
  "reduce_budget",
  "hold",
  "duplicate_to_new_geo_cluster",
  "merge_into_pooled_geo",
  "switch_optimization",
  "tighten_bid",
  "broaden",
  "monitor_only",
] as const;
export type MetaAdSetActionType = (typeof META_AD_SET_ACTION_TYPES)[number];

export const META_GEO_ACTION_TYPES = [
  "scale",
  "validate",
  "pool",
  "isolate",
  "cut",
  "monitor",
] as const;
export type MetaGeoActionType = (typeof META_GEO_ACTION_TYPES)[number];

export type MetaDecisionImpact = "positive" | "negative" | "mixed" | "neutral";
export type MetaActionSize = "none" | "small" | "medium" | "large";
export type MetaDecisionPriority = "critical" | "high" | "medium" | "low";
export type MetaRiskLevel = "low" | "medium" | "high";
export type MetaCommercialFallbackMode = "configured_targets" | "conservative_fallback";
export type MetaPlacementAction = "keep_advantage_plus" | "exception_review";

export interface MetaDecisionEvidence {
  label: string;
  value: string;
  impact: MetaDecisionImpact;
}

export interface MetaGeoSourceFreshness {
  dataState: "ready" | "syncing" | "stale";
  lastSyncedAt: string | null;
  isPartial: boolean;
  verificationState: string | null;
  reason: string | null;
}

export interface MetaGeoSourceRow {
  key: string;
  label: string;
  spend: number;
  revenue: number;
  purchases: number;
  clicks: number;
  impressions: number;
}

export interface MetaGeoSourceSnapshot {
  rows: MetaGeoSourceRow[];
  freshness: MetaGeoSourceFreshness;
}

export interface MetaGeoMateriality {
  thinSignal: boolean;
  material: boolean;
  archiveContext: boolean;
}

export interface MetaGeoSupportingMetrics {
  spend: number;
  revenue: number;
  roas: number;
  purchases: number;
  clicks: number;
  impressions: number;
  spendShare: number;
}

export interface MetaGeoCommercialContext {
  serviceability: BusinessCountryEconomicsRow["serviceability"] | null;
  priorityTier: BusinessCountryEconomicsRow["priorityTier"] | null;
  scaleOverride: BusinessCountryEconomicsRow["scaleOverride"] | null;
  economicsMultiplier: number | null;
  marginModifier: number | null;
  countryEconomicsConfigured: boolean;
  countryEconomicsUpdatedAt: string | null;
  countryEconomicsSourceLabel: string | null;
}

export interface MetaCampaignDecision {
  campaignId: string;
  campaignName: string;
  status: string;
  role: MetaCampaignRole;
  primaryAction: MetaAdSetActionType;
  confidence: number;
  why: string;
  evidence: MetaDecisionEvidence[];
  guardrails: string[];
  noTouch: boolean;
  whatWouldChangeThisDecision: string[];
  adSetDecisionIds: string[];
  laneLabel: "Scaling" | "Validation" | "Test" | null;
  trust: DecisionTrustMetadata;
}

export interface MetaAdSetDecision {
  decisionId: string;
  adSetId: string;
  adSetName: string;
  campaignId: string;
  campaignName: string;
  actionType: MetaAdSetActionType;
  actionSize: MetaActionSize;
  priority: MetaDecisionPriority;
  confidence: number;
  reasons: string[];
  guardrails: string[];
  relatedCreativeNeeds: string[];
  relatedGeoContext: string[];
  supportingMetrics: {
    spend: number;
    revenue: number;
    roas: number;
    cpa: number | null;
    ctr: number | null;
    purchases: number;
    impressions: number;
    clicks: number;
    bidStrategyLabel: string | null;
    optimizationGoal: string | null;
    dailyBudget: number | null;
    lifetimeBudget: number | null;
  };
  whatWouldChangeThisDecision: string[];
  noTouch: boolean;
  trust: DecisionTrustMetadata;
}

export interface MetaBudgetShift {
  fromCampaignId: string;
  fromCampaignName: string;
  toCampaignId: string;
  toCampaignName: string;
  from: string;
  to: string;
  whyNow: string;
  riskLevel: MetaRiskLevel;
  expectedBenefit: string;
  suggestedMoveBand: string;
  confidence: number;
  guardrails: string[];
}

export interface MetaGeoDecision {
  geoKey: string;
  countryCode: string;
  label: string;
  action: MetaGeoActionType;
  queueEligible: boolean;
  confidence: number;
  why: string;
  evidence: MetaDecisionEvidence[];
  guardrails: string[];
  whatWouldChangeThisDecision: string[];
  clusterKey: string | null;
  clusterLabel: string | null;
  grouped: boolean;
  groupMemberCount: number;
  groupMemberLabels: string[];
  materiality: MetaGeoMateriality;
  supportingMetrics: MetaGeoSupportingMetrics;
  freshness: MetaGeoSourceFreshness;
  commercialContext: MetaGeoCommercialContext;
  trust: DecisionTrustMetadata;
}

export interface MetaPlacementAnomaly {
  placementKey: string;
  label: string;
  action: MetaPlacementAction;
  confidence: number;
  note: string;
  evidence: MetaDecisionEvidence[];
  whatWouldChangeThisDecision: string[];
}

export interface MetaNoTouchItem {
  entityType: "campaign" | "adset" | "geo";
  entityId: string;
  label: string;
  reason: string;
  confidence: number;
  guardrails: string[];
}

export interface MetaCommercialTruthCoverage {
  mode: MetaCommercialFallbackMode;
  targetPackConfigured: boolean;
  countryEconomicsConfigured: boolean;
  promoCalendarConfigured: boolean;
  operatingConstraintsConfigured: boolean;
  missingInputs: string[];
  notes: string[];
}

export interface MetaDecisionOsSummary {
  todayPlanHeadline: string;
  todayPlan: string[];
  budgetShiftSummary: string;
  noTouchSummary: string;
  operatingMode: {
    currentMode: string;
    recommendedMode: string;
    confidence: number;
  } | null;
  confidence: number;
  surfaceSummary: {
    actionCoreCount: number;
    watchlistCount: number;
    archiveCount: number;
    degradedCount: number;
  };
  geoSummary: {
    actionCoreCount: number;
    watchlistCount: number;
    queuedCount: number;
    pooledClusterCount: number;
    sourceFreshness: MetaGeoSourceFreshness;
    countryEconomics: {
      configured: boolean;
      updatedAt: string | null;
      sourceLabel: string | null;
    };
  };
}

export interface MetaDecisionOsV1Response {
  contractVersion: typeof META_DECISION_OS_V1_CONTRACT;
  generatedAt: string;
  businessId: string;
  startDate: string;
  endDate: string;
  analyticsWindow: OperatorAnalyticsWindow;
  decisionWindows: OperatorDecisionWindows;
  historicalMemory: OperatorHistoricalMemory;
  decisionAsOf: string;
  summary: MetaDecisionOsSummary;
  campaigns: MetaCampaignDecision[];
  adSets: MetaAdSetDecision[];
  budgetShifts: MetaBudgetShift[];
  geoDecisions: MetaGeoDecision[];
  placementAnomalies: MetaPlacementAnomaly[];
  noTouchList: MetaNoTouchItem[];
  commercialTruthCoverage: MetaCommercialTruthCoverage;
}

export interface BuildMetaDecisionOsInput {
  businessId: string;
  startDate: string;
  endDate: string;
  analyticsWindow?: OperatorAnalyticsWindow;
  decisionWindows?: OperatorDecisionWindows;
  historicalMemory?: OperatorHistoricalMemory;
  decisionAsOf?: string;
  campaigns: MetaCampaignRow[];
  adSets: MetaAdSetData[];
  breakdowns: Pick<MetaBreakdownsResponse, "location" | "placement"> | null;
  geoSource?: MetaGeoSourceSnapshot | null;
  commercialTruth: BusinessCommercialTruthSnapshot;
}

interface TargetThresholds {
  targetRoas: number;
  breakEvenRoas: number;
  targetCpa: number;
  breakEvenCpa: number;
  mode: MetaCommercialFallbackMode;
}

interface CampaignRoleDecision {
  role: MetaCampaignRole;
  confidence: number;
  why: string;
}

interface GeoConstraint {
  countryCode: string;
  economicsMultiplier: number | null;
  marginModifier: number | null;
  serviceability: BusinessCountryEconomicsRow["serviceability"];
  priorityTier: BusinessCountryEconomicsRow["priorityTier"];
  scaleOverride: BusinessCountryEconomicsRow["scaleOverride"];
}

const ACTION_PRIORITY: Record<MetaAdSetActionType, number> = {
  pause: 0,
  recover: 1,
  rebuild: 2,
  scale_budget: 3,
  reduce_budget: 4,
  hold: 5,
  duplicate_to_new_geo_cluster: 6,
  merge_into_pooled_geo: 7,
  switch_optimization: 8,
  tighten_bid: 9,
  broaden: 10,
  monitor_only: 11,
};

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.99, Math.max(0.2, Number(value.toFixed(2))));
}

function round(value: number, precision = 2) {
  return Number(value.toFixed(precision));
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `$${round(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRatio(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `${round(value)}x`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `${round(value)}%`;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function matchesAnyKeyword(source: string, keywords: string[]) {
  return keywords.some((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return pattern.test(source);
  });
}

function toCountryCode(label: string | null | undefined) {
  const normalized = String(label ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function isRecentIso(input: string | null | undefined, referenceIso: string, days = 3) {
  if (!input) return false;
  const timestamp = new Date(input).getTime();
  const reference = new Date(`${referenceIso}T23:59:59.999Z`).getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(reference)) return false;
  return reference - timestamp <= days * 86_400_000;
}

function isPromoActiveOnDate(
  startDate: string,
  endDate: string,
  asOfDate: string,
) {
  return startDate <= asOfDate && endDate >= asOfDate;
}

function determineThresholds(snapshot: BusinessCommercialTruthSnapshot): TargetThresholds {
  const targetPack = snapshot.targetPack;
  if (
    targetPack?.targetRoas != null ||
    targetPack?.breakEvenRoas != null ||
    targetPack?.targetCpa != null ||
    targetPack?.breakEvenCpa != null
  ) {
    return {
      targetRoas: targetPack?.targetRoas ?? 2.6,
      breakEvenRoas: targetPack?.breakEvenRoas ?? 1.8,
      targetCpa: targetPack?.targetCpa ?? 42,
      breakEvenCpa: targetPack?.breakEvenCpa ?? 58,
      mode: "configured_targets",
    };
  }
  return {
    targetRoas: 2.5,
    breakEvenRoas: 1.8,
    targetCpa: 40,
    breakEvenCpa: 55,
    mode: "conservative_fallback",
  };
}

function collectCommercialTruthCoverage(snapshot: BusinessCommercialTruthSnapshot): MetaCommercialTruthCoverage {
  const thresholds = determineThresholds(snapshot);
  const missingInputs: string[] = [];
  if (!snapshot.targetPack) missingInputs.push("target_pack");
  if (snapshot.countryEconomics.length === 0) missingInputs.push("country_economics");
  if (snapshot.promoCalendar.length === 0) missingInputs.push("promo_calendar");
  if (!snapshot.operatingConstraints) missingInputs.push("operating_constraints");

  return {
    mode: thresholds.mode,
    targetPackConfigured: Boolean(snapshot.targetPack),
    countryEconomicsConfigured: snapshot.countryEconomics.length > 0,
    promoCalendarConfigured: snapshot.promoCalendar.length > 0,
    operatingConstraintsConfigured: Boolean(snapshot.operatingConstraints),
    missingInputs,
    notes:
      thresholds.mode === "configured_targets"
        ? ["Commercial targets are configured, so decision aggressiveness can scale to business-specific thresholds."]
        : [
            "Commercial targets are missing, so Decision OS is using conservative fallback thresholds.",
            "Safe actions stay preferred while missing truth lowers confidence.",
          ],
  };
}

function classifyCampaignRole(input: {
  campaign: MetaCampaignRow;
  laneLabel: "Scaling" | "Validation" | "Test" | null;
  activePromoNames: string[];
}): CampaignRoleDecision {
  const source = `${input.campaign.name} ${input.campaign.objective ?? ""} ${input.campaign.optimizationGoal ?? ""}`.toLowerCase();
  const promoKeywords = ["promo", "promotion", "sale", "clearance", "summer gear", "discount", "offer"];
  const catalogKeywords = ["catalog", "dpa", "product set", "shopping", "advantage+ shopping"];
  const retargetingKeywords = ["remarketing", "retarget", "retargeting", "visitor", "cart", "atc", "vc", "viewcontent"];
  const ltvKeywords = ["ltv", "repeat", "existing", "customer", "crm", "vip", "purchaser"];
  const geoKeywords = ["geo", "intl", "international", "expansion", "uk", "ca", "au", "eu", "mena"];

  if (matchesAnyKeyword(source, promoKeywords) || input.activePromoNames.some((name) => source.includes(name))) {
    return {
      role: "Promo / Clearance",
      confidence: 0.92,
      why: "Campaign naming or active promo overlap indicates this is a promo-driven lane.",
    };
  }
  if (matchesAnyKeyword(source, catalogKeywords)) {
    return {
      role: "Catalog / DPA",
      confidence: 0.88,
      why: "Campaign naming indicates catalog or DPA-style delivery.",
    };
  }
  if (matchesAnyKeyword(source, retargetingKeywords)) {
    return {
      role: "Retargeting",
      confidence: 0.9,
      why: "Campaign naming indicates retargeting or remarketing intent.",
    };
  }
  if (matchesAnyKeyword(source, ltvKeywords)) {
    return {
      role: "Existing Customer / LTV",
      confidence: 0.89,
      why: "Campaign naming indicates existing-customer or LTV intent.",
    };
  }
  if (matchesAnyKeyword(source, geoKeywords)) {
    return {
      role: "Geo Expansion",
      confidence: 0.86,
      why: "Campaign naming suggests this lane is being used for geo expansion.",
    };
  }
  if (input.laneLabel === "Scaling") {
    return {
      role: "Prospecting Scale",
      confidence: 0.84,
      why: "Scaling lane signal places this campaign in the prospecting scale role.",
    };
  }
  if (input.laneLabel === "Test") {
    return {
      role: "Prospecting Test",
      confidence: 0.8,
      why: "Lane analysis marks this as an exploratory or low-signal prospecting test.",
    };
  }
  if (input.laneLabel === "Validation") {
    return {
      role: "Prospecting Validation",
      confidence: 0.82,
      why: "Lane analysis marks this as a validation lane.",
    };
  }
  return {
    role: "Prospecting Validation",
    confidence: 0.58,
    why: "No stronger role signal exists, so this falls back to prospecting validation with reduced confidence.",
  };
}

function buildOperatingModeSummary(input: BuildMetaDecisionOsInput): AccountOperatingModePayload | null {
  try {
    return buildAccountOperatingMode({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      analyticsWindow: input.analyticsWindow,
      decisionWindows: input.decisionWindows,
      historicalMemory: input.historicalMemory,
      decisionAsOf: input.decisionAsOf,
      snapshot: input.commercialTruth,
      campaigns: { rows: input.campaigns },
      breakdowns: input.breakdowns
        ? ({
            age: [],
            location: input.breakdowns.location,
            placement: input.breakdowns.placement,
            budget: { campaign: [], adset: [] },
            audience: { available: false },
            products: { available: false },
          } satisfies MetaBreakdownsResponse)
        : null,
    });
  } catch {
    return null;
  }
}

function buildDecisionTrust(input: {
  surfaceLane: DecisionSurfaceLane;
  truthState: DecisionTrustMetadata["truthState"];
  operatorDisposition: DecisionOperatorDisposition;
  reasons: Array<string | null | undefined>;
}): DecisionTrustMetadata {
  return {
    surfaceLane: input.surfaceLane,
    truthState: input.truthState,
    operatorDisposition: input.operatorDisposition,
    reasons: input.reasons
      .map((reason) => reason?.trim())
      .filter((reason): reason is string => Boolean(reason)),
  };
}

function isInactiveMetaStatus(status: string | null | undefined) {
  const normalized = normalizeText(status);
  return normalized.length > 0 && normalized !== "active";
}

function isArchiveMetaAdSet(adSet: MetaAdSetData) {
  if (isInactiveMetaStatus(adSet.status)) return true;
  if (adSet.spend <= 0) return true;
  if (adSet.spend < 60 && adSet.purchases === 0 && adSet.impressions < 3_000) {
    return true;
  }
  return false;
}

function isArchiveMetaCampaign(campaign: MetaCampaignRow) {
  if (isInactiveMetaStatus(campaign.status)) return true;
  if (campaign.spend <= 0) return true;
  if (campaign.spend < 90 && campaign.purchases === 0 && campaign.impressions < 8_000) {
    return true;
  }
  return false;
}

function findGeoConstraint(
  snapshot: BusinessCommercialTruthSnapshot,
  countryCode: string | null,
): GeoConstraint | null {
  if (!countryCode) return null;
  const row = snapshot.countryEconomics.find(
    (candidate) => candidate.countryCode.toUpperCase() === countryCode,
  );
  if (!row) return null;
  return {
    countryCode,
    economicsMultiplier: row.economicsMultiplier,
    marginModifier: row.marginModifier,
    serviceability: row.serviceability,
    priorityTier: row.priorityTier,
    scaleOverride: row.scaleOverride,
  };
}

function formatPriorityTierLabel(
  value: BusinessCountryEconomicsRow["priorityTier"] | null,
) {
  if (!value) return "unconfigured";
  return value.replace("_", " ");
}

function buildGeoClusterKey(input: {
  action: Extract<MetaGeoActionType, "pool" | "validate" | "monitor">;
  priorityTier: BusinessCountryEconomicsRow["priorityTier"] | null;
  serviceability: BusinessCountryEconomicsRow["serviceability"] | null;
  truthState: DecisionTrustMetadata["truthState"];
}) {
  return [
    input.action,
    input.priorityTier ?? "unconfigured",
    input.serviceability ?? "unknown",
    input.truthState,
  ].join(":");
}

function buildGeoClusterLabel(input: {
  action: Extract<MetaGeoActionType, "pool" | "validate" | "monitor">;
  priorityTier: BusinessCountryEconomicsRow["priorityTier"] | null;
  serviceability: BusinessCountryEconomicsRow["serviceability"] | null;
}) {
  return `${input.action} • ${formatPriorityTierLabel(input.priorityTier)} • ${input.serviceability ?? "unknown serviceability"}`;
}

function resolveDefaultGeoSourceFreshness(
  input: Pick<BuildMetaDecisionOsInput, "breakdowns">,
): MetaGeoSourceFreshness {
  const rowCount = input.breakdowns?.location.length ?? 0;
  return {
    dataState: rowCount > 0 ? "ready" : "stale",
    lastSyncedAt: null,
    isPartial: false,
    verificationState: null,
    reason:
      rowCount > 0
        ? null
        : "Country breakdown source did not return rows for the current decision window.",
  };
}

function buildGeoAction(input: {
  row: MetaGeoSourceRow;
  accountRoas: number;
  snapshot: BusinessCommercialTruthSnapshot;
  thresholds: TargetThresholds;
  geoFreshness: MetaGeoSourceFreshness;
  totalGeoSpend: number;
}): MetaGeoDecision {
  const countryCode = toCountryCode(input.row.label) ?? input.row.key.toUpperCase();
  const roas = input.row.spend > 0 ? input.row.revenue / input.row.spend : 0;
  const constraint = findGeoConstraint(input.snapshot, countryCode);
  const thinSignal = input.row.spend < 250 || input.row.purchases < 6;
  const archiveContext =
    input.row.spend <= 0 ||
    (input.row.spend < 120 && input.row.purchases === 0);
  const material = !archiveContext && (input.row.spend >= 120 || input.row.purchases > 0);
  const strong = roas >= input.thresholds.targetRoas && input.row.purchases >= 10;
  const weak = roas > 0 && roas < input.thresholds.breakEvenRoas && input.row.spend >= 200;
  let action: MetaGeoActionType = "monitor";
  let why = "Keep this geo under observation while more signal accumulates.";
  let confidence = 0.56;

  if (constraint?.serviceability === "blocked") {
    action = "cut";
    why = "Serviceability is blocked, so spend should not keep flowing here.";
    confidence = 0.95;
  } else if (constraint?.scaleOverride === "deprioritize") {
    action = "cut";
    why = "Commercial truth explicitly deprioritizes this GEO.";
    confidence = 0.88;
  } else if (constraint?.scaleOverride === "hold") {
    action = "monitor";
    why = "Commercial truth says hold, so this geo should be monitored rather than scaled.";
    confidence = 0.8;
  } else if (constraint?.scaleOverride === "prefer_scale" && strong) {
    action = "scale";
    why = "Commercial truth prefers scale here and current economics are strong enough to support it.";
    confidence = 0.88;
  } else if (constraint?.serviceability === "limited" && weak) {
    action = "cut";
    why = "Serviceability is limited and the current efficiency does not justify preserving spend.";
    confidence = 0.84;
  } else if (strong && input.row.spend >= 600) {
    action = constraint?.priorityTier === "tier_1" ? "isolate" : "scale";
    why =
      action === "isolate"
        ? "This GEO is winning with enough volume to justify its own isolated operating path."
        : "This GEO is outperforming the account and can take more controlled spend.";
    confidence = action === "isolate" ? 0.82 : 0.78;
  } else if (thinSignal && (constraint?.priorityTier === "tier_3" || !constraint)) {
    action = "pool";
    why = "Signal is thin, so this GEO belongs in a pooled validation cluster instead of a dedicated path.";
    confidence = 0.74;
  } else if (thinSignal) {
    action = "validate";
    why = "Signal is still thin, but not weak enough to cut. Validate before making a bigger move.";
    confidence = 0.68;
  } else if (weak) {
    action = "cut";
    why = "This GEO is below break-even with enough spend to justify a cut decision.";
    confidence = 0.8;
  }

  const degradedMissingTruth =
    input.thresholds.mode === "conservative_fallback" ||
    input.snapshot.countryEconomics.length === 0;
  const watchlistAction = action === "monitor" || action === "pool" || action === "validate";
  const trust = archiveContext
    ? buildDecisionTrust({
        surfaceLane: "archive_context",
        truthState: "inactive_or_immaterial",
        operatorDisposition: "archive_only",
        reasons: [
          "Geo signal is inactive or immaterial for the live action core.",
          thinSignal ? "Thin-signal GEOs stay out of the default action core." : null,
        ],
      })
    : degradedMissingTruth
      ? buildDecisionTrust({
          surfaceLane:
            action === "scale" || action === "isolate" || watchlistAction
              ? "watchlist"
              : "action_core",
          truthState: "degraded_missing_truth",
          operatorDisposition:
            action === "scale" || action === "isolate"
              ? "degraded_no_scale"
              : action === "cut"
                ? "review_reduce"
                : "monitor_low_truth",
          reasons: [
            "Commercial truth is incomplete, so GEO actions stay trust-capped.",
            why,
          ],
        })
      : watchlistAction
        ? buildDecisionTrust({
            surfaceLane: "watchlist",
            truthState: "live_confident",
            operatorDisposition: "monitor_low_truth",
            reasons: [why],
          })
        : buildDecisionTrust({
            surfaceLane: "action_core",
            truthState: "live_confident",
            operatorDisposition: "standard",
            reasons: [why],
          });
  const queueEligible = material && trust.surfaceLane === "action_core";
  const clusterKey =
    action === "pool" || action === "validate" || action === "monitor"
      ? buildGeoClusterKey({
          action,
          priorityTier: constraint?.priorityTier ?? null,
          serviceability: constraint?.serviceability ?? null,
          truthState: trust.truthState,
        })
      : null;
  const clusterLabel =
    action === "pool" || action === "validate" || action === "monitor"
      ? buildGeoClusterLabel({
          action,
          priorityTier: constraint?.priorityTier ?? null,
          serviceability: constraint?.serviceability ?? null,
        })
      : null;

  return {
    geoKey: `${countryCode}:${action}`,
    countryCode,
    label: input.row.label,
    action,
    queueEligible,
    confidence: clampConfidence(confidence),
    why,
    evidence: [
      { label: "Spend", value: formatCurrency(input.row.spend), impact: "neutral" },
      { label: "ROAS", value: formatRatio(roas), impact: roas >= input.thresholds.targetRoas ? "positive" : roas < input.thresholds.breakEvenRoas ? "negative" : "mixed" },
      {
        label: "Commercial override",
        value: constraint ? `${constraint.serviceability} / ${constraint.scaleOverride}` : "None",
        impact: constraint?.scaleOverride === "prefer_scale" ? "positive" : constraint?.scaleOverride === "deprioritize" ? "negative" : "neutral",
      },
    ],
    guardrails: [
      action === "scale" || action === "isolate"
        ? "Scale only while serviceability and margin assumptions stay intact."
        : "Do not build a dedicated manual GEO structure from thin-signal rows.",
    ],
    whatWouldChangeThisDecision: [
      action === "cut"
        ? "ROAS recovering above break-even or serviceability improving would reopen this GEO."
        : "More conversion depth or an explicit business override would change this GEO decision.",
    ],
    clusterKey,
    clusterLabel,
    grouped: false,
    groupMemberCount: 1,
    groupMemberLabels: [input.row.label],
    materiality: {
      thinSignal,
      material,
      archiveContext,
    },
    supportingMetrics: {
      spend: round(input.row.spend),
      revenue: round(input.row.revenue),
      roas: round(roas),
      purchases: input.row.purchases,
      clicks: input.row.clicks,
      impressions: input.row.impressions,
      spendShare:
        input.totalGeoSpend > 0 ? round(input.row.spend / input.totalGeoSpend, 4) : 0,
    },
    freshness: input.geoFreshness,
    commercialContext: {
      serviceability: constraint?.serviceability ?? null,
      priorityTier: constraint?.priorityTier ?? null,
      scaleOverride: constraint?.scaleOverride ?? null,
      economicsMultiplier: constraint?.economicsMultiplier ?? null,
      marginModifier: constraint?.marginModifier ?? null,
      countryEconomicsConfigured:
        input.snapshot.sectionMeta.countryEconomics.configured,
      countryEconomicsUpdatedAt:
        input.snapshot.sectionMeta.countryEconomics.updatedAt,
      countryEconomicsSourceLabel:
        input.snapshot.sectionMeta.countryEconomics.sourceLabel,
    },
    trust,
  };
}

function hydrateGeoClusters(geoDecisions: MetaGeoDecision[]) {
  const decisionsByCluster = new Map<string, MetaGeoDecision[]>();
  for (const decision of geoDecisions) {
    if (!decision.clusterKey) continue;
    const existing = decisionsByCluster.get(decision.clusterKey);
    if (existing) existing.push(decision);
    else decisionsByCluster.set(decision.clusterKey, [decision]);
  }

  return geoDecisions.map((decision) => {
    if (!decision.clusterKey) return decision;
    const peers =
      decisionsByCluster.get(decision.clusterKey)?.slice().sort(
        (left, right) =>
          right.supportingMetrics.spend - left.supportingMetrics.spend ||
          left.label.localeCompare(right.label),
      ) ?? [decision];
    return {
      ...decision,
      grouped: peers.length > 1,
      groupMemberCount: peers.length,
      groupMemberLabels: peers.map((peer) => peer.label),
      clusterLabel: decision.clusterLabel ?? peers[0]?.clusterLabel ?? null,
    };
  });
}

function buildPlacementAnomalies(input: {
  rows: Array<{ key: string; label: string; spend: number; revenue: number }>;
  accountRoas: number;
}) {
  const totalSpend = input.rows.reduce((sum, row) => sum + row.spend, 0);
  return input.rows
    .map((row) => {
      const roas = row.spend > 0 ? row.revenue / row.spend : 0;
      const spendShare = totalSpend > 0 ? row.spend / totalSpend : 0;
      if (row.spend < 150 || spendShare < 0.12) return null;
      if (roas >= input.accountRoas * 0.8) return null;
      return {
        placementKey: row.key,
        label: row.label,
        action: "exception_review" as const,
        confidence: clampConfidence(spendShare >= 0.2 ? 0.8 : 0.68),
        note:
          "Advantage+ placements should stay on by default. Review this only because spend concentration is paired with persistent underperformance.",
        evidence: [
          { label: "Spend share", value: formatPercent(spendShare * 100), impact: "negative" as const },
          { label: "Placement ROAS", value: formatRatio(roas), impact: "negative" as const },
          { label: "Account ROAS", value: formatRatio(input.accountRoas), impact: "neutral" as const },
        ],
        whatWouldChangeThisDecision: [
          "If this placement recovers closer to account average or loses spend share concentration, keep automation untouched.",
        ],
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

function buildRelatedCreativeNeeds(input: {
  actionType: MetaAdSetActionType;
  ctr: number | null;
  roas: number;
}) {
  const needs: string[] = [];
  if (input.actionType === "rebuild" || input.actionType === "recover") {
    needs.push("Refresh the active creative mix before expecting the same structure to recover.");
  }
  if (input.ctr != null && input.ctr < 1.2) {
    needs.push("CTR is soft, so check whether the message or hook is the real bottleneck.");
  }
  if (input.actionType === "scale_budget" && input.roas >= 3) {
    needs.push("Do not mix new testing creatives into this scaling path unless a separate validation lane exists.");
  }
  return needs;
}

function buildAdSetDecision(input: {
  adSet: MetaAdSetData;
  campaign: MetaCampaignRow | null;
  campaignRole: MetaCampaignRole;
  thresholds: TargetThresholds;
  commercialTruth: BusinessCommercialTruthSnapshot;
  geoCoverageMode: MetaCommercialFallbackMode;
  operatingMode: AccountOperatingModePayload | null;
  decisionAsOf: string;
}): MetaAdSetDecision {
  const roas = input.adSet.spend > 0 ? input.adSet.revenue / input.adSet.spend : 0;
  const cpa = input.adSet.cpa ?? (input.adSet.purchases > 0 ? input.adSet.spend / input.adSet.purchases : null);
  const hasStrongSignal = input.adSet.spend >= 250 && input.adSet.purchases >= 8;
  const hasVeryStrongSignal = input.adSet.spend >= 500 && input.adSet.purchases >= 18;
  const lowSignal = !hasStrongSignal;
  const recentChange =
    isRecentIso(input.adSet.previousBudgetCapturedAt, input.decisionAsOf, 3) ||
    isRecentIso(input.adSet.previousBidValueCapturedAt, input.decisionAsOf, 3);
  const mixedConfig =
    input.adSet.isConfigMixed ||
    input.adSet.isBudgetMixed ||
    Boolean(input.adSet.isOptimizationGoalMixed) ||
    Boolean(input.adSet.isBidStrategyMixed) ||
    Boolean(input.adSet.isBidValueMixed);
  const targetMet =
    roas >= input.thresholds.targetRoas ||
    (cpa != null && cpa <= input.thresholds.targetCpa);
  const breakEvenMiss =
    (roas > 0 && roas < input.thresholds.breakEvenRoas) ||
    (cpa != null && cpa > input.thresholds.breakEvenCpa);
  const nearTarget =
    (roas > 0 && roas >= input.thresholds.targetRoas * 0.9 && roas < input.thresholds.targetRoas) ||
    (cpa != null && cpa <= input.thresholds.targetCpa * 1.1 && cpa > input.thresholds.targetCpa);
  const manualDoNotScale = Boolean(input.commercialTruth.operatingConstraints?.manualDoNotScaleReason);
  const stockBlocked = input.commercialTruth.operatingConstraints?.stockPressureStatus === "blocked";
  const landingConcern = Boolean(input.commercialTruth.operatingConstraints?.landingPageConcern);
  const retargetingRole =
    input.campaignRole === "Retargeting" || input.campaignRole === "Existing Customer / LTV";
  const geoRole = input.campaignRole === "Geo Expansion";
  const stableWinner =
    targetMet && hasVeryStrongSignal && !recentChange && !mixedConfig;
  const promoSafeWinner =
    normalizeText(input.campaign?.name).includes("promo") &&
    targetMet &&
    hasStrongSignal &&
    !recentChange &&
    !mixedConfig;
  const actionReasons: string[] = [];
  const guardrails: string[] = [];
  let actionType: MetaAdSetActionType = "monitor_only";
  let actionSize: MetaActionSize = "none";
  let priority: MetaDecisionPriority = "low";
  let confidence = 0.74;
  let fallbackDisposition: DecisionOperatorDisposition | null = null;

  if (stockBlocked || manualDoNotScale) {
    actionType = "hold";
    actionSize = "none";
    priority = "high";
    confidence = 0.9;
    actionReasons.push(
      stockBlocked
        ? "Operating constraints say stock pressure is blocked."
        : "Commercial constraints include an explicit do-not-scale instruction.",
    );
    guardrails.push("Do not widen spend until the operator-level constraint is cleared.");
  } else if (breakEvenMiss && hasStrongSignal && input.adSet.status.toLowerCase() === "active") {
    actionType = "pause";
    actionSize = "large";
    priority = "critical";
    confidence = 0.9;
    actionReasons.push("Efficiency is below break-even with enough spend to justify a hard stop.");
    guardrails.push("Pause the loser before scaling any adjacent lanes.");
  } else if (mixedConfig && hasStrongSignal) {
    actionType = "rebuild";
    actionSize = "medium";
    priority = "high";
    confidence = 0.86;
    actionReasons.push("Mixed budget or optimization config makes this ad set hard to trust operationally.");
    guardrails.push("Rebuild into a cleaner structure instead of stacking more edits onto mixed config.");
  } else if (retargetingRole && targetMet && input.adSet.status.toLowerCase() !== "active") {
    actionType = "recover";
    actionSize = "medium";
    priority = "high";
    confidence = 0.84;
    actionReasons.push("This retargeting lane is efficient enough to recover even though delivery is muted.");
    guardrails.push("Recover in controlled steps and keep audience intent clean.");
  } else if ((stableWinner && retargetingRole) || promoSafeWinner) {
    actionType = "hold";
    actionSize = "none";
    priority = "medium";
    confidence = 0.84;
    actionReasons.push(
      retargetingRole
        ? "This is a stable retargeting winner, so the safer move is to protect it instead of layering more change onto it."
        : "This promo-safe winner should be protected while the promo window stays live.",
    );
    guardrails.push("Keep this winner stable and avoid mixing testing changes into it.");
  } else if (targetMet && hasVeryStrongSignal && !recentChange && !mixedConfig) {
    actionType = "scale_budget";
    actionSize = roas >= input.thresholds.targetRoas * 1.2 ? "large" : "medium";
    priority = "high";
    confidence = input.geoCoverageMode === "configured_targets" ? 0.88 : 0.78;
    actionReasons.push("This ad set is winning against target with enough conversion depth to scale.");
    guardrails.push("Scale in steps rather than by a single large jump.");
  } else if (breakEvenMiss && hasStrongSignal) {
    actionType = "reduce_budget";
    actionSize = "medium";
    priority = "high";
    confidence = 0.8;
    actionReasons.push("Performance is not strong enough to keep the current budget load.");
    guardrails.push("Reduce load before testing broader fixes.");
  } else if (recentChange || nearTarget || landingConcern) {
    actionType = "hold";
    actionSize = "none";
    priority = nearTarget ? "medium" : "high";
    confidence = recentChange ? 0.72 : 0.7;
    actionReasons.push(
      recentChange
        ? "A recent config change is still settling."
        : landingConcern
          ? "Landing-page concern lowers confidence in any aggressive move."
          : "Signal is near target but not strong enough for a decisive move.",
    );
    guardrails.push("Hold until the current signal resolves more clearly.");
  } else if (geoRole && targetMet && lowSignal) {
    actionType = "duplicate_to_new_geo_cluster";
    actionSize = "small";
    priority = "medium";
    confidence = 0.7;
    actionReasons.push("Geo expansion is promising, but the next move should stay controlled through a new cluster.");
    guardrails.push("Keep this as a validation move, not a broad budget release.");
  } else if (geoRole && breakEvenMiss && lowSignal) {
    actionType = "merge_into_pooled_geo";
    actionSize = "small";
    priority = "medium";
    confidence = 0.68;
    actionReasons.push("Thin-signal geo expansion should be pooled instead of isolated.");
    guardrails.push("Do not keep a dedicated geo path alive without enough signal.");
  } else if (
    normalizeText(input.adSet.optimizationGoal).includes("add to cart") &&
    hasStrongSignal &&
    roas >= input.thresholds.targetRoas
  ) {
    actionType = "switch_optimization";
    actionSize = "small";
    priority = "medium";
    confidence = 0.74;
    actionReasons.push("The lane is healthy enough that a cleaner purchase optimization path is justified.");
    guardrails.push("Only switch optimization once the current stable baseline is documented.");
  } else if (
    (normalizeText(input.adSet.bidStrategyLabel).includes("cap") ||
      normalizeText(input.adSet.bidStrategyType).includes("cap")) &&
    hasStrongSignal &&
    !targetMet &&
    !breakEvenMiss
  ) {
    actionType = "tighten_bid";
    actionSize = "small";
    priority = "medium";
    confidence = 0.66;
    actionReasons.push("Bid control exists, so tightening the bid is safer than a structural rewrite.");
    guardrails.push("Change the bid guardrail before changing multiple levers at once.");
  } else if (targetMet && input.adSet.impressions < 20_000 && input.adSet.clicks < 250) {
    actionType = "broaden";
    actionSize = "small";
    priority = "medium";
    confidence = 0.64;
    actionReasons.push("Efficiency is strong, but reach is still narrow enough to justify a controlled broadening move.");
    guardrails.push("Broaden only after checking that current winners are not simply budget-limited.");
  } else if (lowSignal) {
    actionType = "monitor_only";
    actionSize = "none";
    priority = "low";
    confidence = 0.58;
    actionReasons.push("This ad set does not have enough clean signal for a bigger action.");
    guardrails.push("Low-signal lanes should stay observable, not over-operated.");
  }

  if (input.geoCoverageMode === "conservative_fallback") {
    if (actionType === "pause") {
      actionType = hasStrongSignal ? "reduce_budget" : "hold";
      actionSize = hasStrongSignal ? "medium" : "none";
      priority = "high";
      confidence = Math.min(confidence, hasStrongSignal ? 0.72 : 0.66);
      fallbackDisposition = hasStrongSignal ? "review_reduce" : "review_hold";
      actionReasons.unshift(
        "Commercial targets are missing, so a hard pause is downgraded to a review-safe action.",
      );
    } else if (actionType === "scale_budget" || actionType === "broaden") {
      actionType = "hold";
      actionSize = "none";
      priority = "medium";
      confidence = Math.min(confidence, 0.68);
      fallbackDisposition = "degraded_no_scale";
      actionReasons.unshift("Commercial targets are missing, so aggressive actions are downgraded to a safer hold.");
    } else if (actionType === "reduce_budget") {
      fallbackDisposition = "review_reduce";
    } else if (actionType === "hold") {
      fallbackDisposition = "review_hold";
    } else if (actionType === "monitor_only") {
      fallbackDisposition = "monitor_low_truth";
    }
  }
  if (mixedConfig) confidence -= 0.08;
  if (recentChange) confidence -= 0.07;
  if (lowSignal) confidence -= 0.09;
  if (input.geoCoverageMode === "conservative_fallback") confidence -= 0.05;

  const noTouch =
    actionType === "hold" &&
    targetMet &&
    hasVeryStrongSignal &&
    !recentChange &&
    !mixedConfig &&
    !manualDoNotScale &&
    !stockBlocked;

  if (noTouch) {
    actionReasons.unshift("This is a stable winner, so the safer move is to preserve it.");
    guardrails.push("Do not mix tests or structure changes into this winner path.");
  }

  const archiveContext = isArchiveMetaAdSet(input.adSet);
  const watchlistAction = noTouch || actionType === "hold" || actionType === "monitor_only";
  const trust = archiveContext
    ? buildDecisionTrust({
        surfaceLane: "archive_context",
        truthState: "inactive_or_immaterial",
        operatorDisposition: "archive_only",
        reasons: [
          isInactiveMetaStatus(input.adSet.status)
            ? `Ad set status is ${normalizeText(input.adSet.status)}.`
            : "Ad set volume is too small for the live action core.",
          actionReasons[0],
        ],
      })
    : fallbackDisposition
      ? buildDecisionTrust({
          surfaceLane:
            fallbackDisposition === "review_reduce" ? "action_core" : "watchlist",
          truthState: "degraded_missing_truth",
          operatorDisposition: fallbackDisposition,
          reasons: [
            "Commercial truth is incomplete, so this action is trust-capped.",
            actionReasons[0],
          ],
        })
      : noTouch
        ? buildDecisionTrust({
            surfaceLane: "watchlist",
            truthState: "live_confident",
            operatorDisposition: "protected_watchlist",
            reasons: [actionReasons[0]],
          })
        : watchlistAction
          ? buildDecisionTrust({
              surfaceLane: "watchlist",
              truthState: "live_confident",
              operatorDisposition: actionType === "monitor_only" ? "monitor_low_truth" : "review_hold",
              reasons: [actionReasons[0]],
            })
          : buildDecisionTrust({
              surfaceLane: "action_core",
              truthState: "live_confident",
              operatorDisposition: "standard",
              reasons: [actionReasons[0]],
            });

  return {
    decisionId: `${input.adSet.id}:${actionType}`,
    adSetId: input.adSet.id,
    adSetName: input.adSet.name,
    campaignId: input.adSet.campaignId,
    campaignName: input.campaign?.name ?? "Unknown campaign",
    actionType,
    actionSize,
    priority,
    confidence: clampConfidence(confidence),
    reasons: actionReasons,
    guardrails,
    relatedCreativeNeeds: buildRelatedCreativeNeeds({
      actionType,
      ctr: input.adSet.inlineLinkClickCtr ?? input.adSet.ctr,
      roas,
    }),
    relatedGeoContext:
      input.campaignRole === "Geo Expansion"
        ? ["Keep GEO actions operational. Thin-signal lanes should pool or validate before isolated scale."]
        : [],
    supportingMetrics: {
      spend: round(input.adSet.spend),
      revenue: round(input.adSet.revenue),
      roas: round(roas),
      cpa: cpa != null ? round(cpa) : null,
      ctr: input.adSet.inlineLinkClickCtr ?? input.adSet.ctr ?? null,
      purchases: input.adSet.purchases,
      impressions: input.adSet.impressions,
      clicks: input.adSet.clicks,
      bidStrategyLabel: input.adSet.bidStrategyLabel ?? null,
      optimizationGoal: input.adSet.optimizationGoal ?? null,
      dailyBudget: input.adSet.dailyBudget ?? null,
      lifetimeBudget: input.adSet.lifetimeBudget ?? null,
    },
    whatWouldChangeThisDecision: [
      noTouch
        ? "A clear efficiency drop, promo change, or new operator constraint would reopen this winner."
        : "A stronger target hit, cleaner config, or more conversion depth would change this action.",
    ],
    noTouch,
    trust,
  };
}

function buildCampaignDecision(input: {
  campaign: MetaCampaignRow;
  laneLabel: "Scaling" | "Validation" | "Test" | null;
  roleDecision: CampaignRoleDecision;
  adSetDecisions: MetaAdSetDecision[];
  thresholds: TargetThresholds;
}): MetaCampaignDecision {
  const topAdSetDecision =
    [...input.adSetDecisions].sort(
      (left, right) =>
        ACTION_PRIORITY[left.actionType] - ACTION_PRIORITY[right.actionType] ||
        right.confidence - left.confidence,
    )[0] ?? null;
  const noTouch = input.adSetDecisions.some((decision) => decision.noTouch);
  const roas = input.campaign.spend > 0 ? input.campaign.revenue / input.campaign.spend : 0;
  const primaryAction = noTouch
    ? "hold"
    : topAdSetDecision?.actionType ??
      (roas >= input.thresholds.targetRoas ? "scale_budget" : "monitor_only");
  const evidence: MetaDecisionEvidence[] = [
    {
      label: "ROAS",
      value: formatRatio(roas),
      impact:
        roas >= input.thresholds.targetRoas
          ? "positive"
          : roas < input.thresholds.breakEvenRoas
            ? "negative"
            : "mixed",
    },
    {
      label: "Spend",
      value: formatCurrency(input.campaign.spend),
      impact: "neutral",
    },
    {
      label: "Role confidence",
      value: formatPercent(input.roleDecision.confidence * 100),
      impact: "neutral",
    },
  ];
  const why = noTouch
    ? "This campaign contains a stable winner that should be protected before making broader changes."
    : input.roleDecision.why;
  const degradedFromAdSets = input.adSetDecisions.some(
    (decision) => decision.trust.truthState === "degraded_missing_truth",
  );
  const archiveContext =
    isArchiveMetaCampaign(input.campaign) ||
    input.adSetDecisions.every(
      (decision) => decision.trust.surfaceLane === "archive_context",
    );
  const watchlistAction =
    noTouch ||
    primaryAction === "hold" ||
    primaryAction === "monitor_only" ||
    input.adSetDecisions.some((decision) => decision.trust.surfaceLane === "watchlist");
  const trust = archiveContext
    ? buildDecisionTrust({
        surfaceLane: "archive_context",
        truthState: "inactive_or_immaterial",
        operatorDisposition: "archive_only",
        reasons: [
          isInactiveMetaStatus(input.campaign.status)
            ? `Campaign status is ${normalizeText(input.campaign.status)}.`
            : "Campaign signal is inactive or immaterial for the default action core.",
          why,
        ],
      })
    : degradedFromAdSets
      ? buildDecisionTrust({
          surfaceLane: watchlistAction ? "watchlist" : "action_core",
          truthState: "degraded_missing_truth",
          operatorDisposition:
            primaryAction === "reduce_budget" ? "review_reduce" : "review_hold",
          reasons: [
            "Related ad-set actions are trust-capped because commercial truth is incomplete.",
            why,
          ],
        })
      : noTouch
        ? buildDecisionTrust({
            surfaceLane: "watchlist",
            truthState: "live_confident",
            operatorDisposition: "protected_watchlist",
            reasons: [why],
          })
        : watchlistAction
          ? buildDecisionTrust({
              surfaceLane: "watchlist",
              truthState: "live_confident",
              operatorDisposition: "review_hold",
              reasons: [why],
            })
          : buildDecisionTrust({
              surfaceLane: "action_core",
              truthState: "live_confident",
              operatorDisposition: "standard",
              reasons: [why],
            });

  return {
    campaignId: input.campaign.id,
    campaignName: input.campaign.name,
    status: input.campaign.status,
    role: input.roleDecision.role,
    primaryAction,
    confidence: clampConfidence(
      topAdSetDecision
        ? (topAdSetDecision.confidence + input.roleDecision.confidence) / 2
        : input.roleDecision.confidence,
    ),
    why,
    evidence,
    guardrails: noTouch
      ? ["Preserve the winner path and avoid mixing in structural testing."]
      : [
          primaryAction === "scale_budget"
            ? "Scale only while the supporting ad-set winners remain stable."
            : "Use the ad-set action list to decide where this campaign should move next.",
        ],
    noTouch,
    whatWouldChangeThisDecision: [
      noTouch
        ? "Only a clear efficiency drop or a new business constraint should change this protection call."
        : "A different ad-set winner/loser mix would change this campaign-level action.",
    ],
    adSetDecisionIds: input.adSetDecisions.map((decision) => decision.decisionId),
    laneLabel: input.laneLabel,
    trust,
  };
}

function buildBudgetShifts(input: {
  campaigns: MetaCampaignDecision[];
  campaignRows: MetaCampaignRow[];
}) {
  const byId = new Map(input.campaignRows.map((campaign) => [campaign.id, campaign]));
  const eligibleCampaigns = input.campaigns.filter(
    (campaign) => campaign.trust.surfaceLane === "action_core",
  );
  const donors = eligibleCampaigns.filter((campaign) =>
    campaign.primaryAction === "pause" || campaign.primaryAction === "reduce_budget",
  );
  const recipients = eligibleCampaigns.filter((campaign) =>
    campaign.primaryAction === "scale_budget" || campaign.primaryAction === "recover",
  );
  const maxRows = Math.min(donors.length, recipients.length, 4);
  const shifts: MetaBudgetShift[] = [];

  for (let index = 0; index < maxRows; index += 1) {
    const donor = donors[index];
    const recipient = recipients[index];
    const donorRow = byId.get(donor.campaignId);
    const recipientRow = byId.get(recipient.campaignId);
    if (!donor || !recipient || !donorRow || !recipientRow) continue;
    const movePct = donor.primaryAction === "pause" ? "20-30%" : "10-15%";
    shifts.push({
      fromCampaignId: donor.campaignId,
      fromCampaignName: donor.campaignName,
      toCampaignId: recipient.campaignId,
      toCampaignName: recipient.campaignName,
      from: donor.campaignName,
      to: recipient.campaignName,
      whyNow:
        donor.primaryAction === "pause"
          ? "A clear loser exists, so the released budget should move into the cleanest winner path."
          : "The donor is below target while the recipient has the stronger case for controlled growth.",
      riskLevel: donor.primaryAction === "pause" ? "medium" : "low",
      expectedBenefit: `${recipient.role} can absorb cleaner spend than ${donor.role} right now.`,
      suggestedMoveBand: `${movePct} of current budget load`,
      confidence: clampConfidence((donor.confidence + recipient.confidence) / 2),
      guardrails: [
        "Treat this as a read-only budget board, not an automatic write-back plan.",
        "Re-check the winner/loser pair after the first move band is absorbed.",
      ],
    });
  }

  return shifts;
}

function buildNoTouchList(input: {
  campaigns: MetaCampaignDecision[];
  adSets: MetaAdSetDecision[];
  geoDecisions: MetaGeoDecision[];
}) {
  const items: MetaNoTouchItem[] = [];
  for (const campaign of input.campaigns.filter((row) => row.noTouch)) {
    items.push({
      entityType: "campaign",
      entityId: campaign.campaignId,
      label: campaign.campaignName,
      reason: "Stable winner path. Do not mix testing or restructuring into this campaign right now.",
      confidence: campaign.confidence,
      guardrails: campaign.guardrails,
    });
  }
  for (const adSet of input.adSets.filter((row) => row.noTouch)) {
    items.push({
      entityType: "adset",
      entityId: adSet.adSetId,
      label: adSet.adSetName,
      reason: "Stable winner path. Protect this ad set from unnecessary edits.",
      confidence: adSet.confidence,
      guardrails: adSet.guardrails,
    });
  }
  for (const geo of input.geoDecisions.filter(
    (row) =>
      (row.action === "isolate" || row.action === "scale") &&
      row.trust.truthState === "live_confident",
  )) {
    if (geo.confidence < 0.82) continue;
    items.push({
      entityType: "geo",
      entityId: geo.countryCode,
      label: geo.label,
      reason: "This GEO is carrying enough value that it should stay protected while other moves happen around it.",
      confidence: geo.confidence,
      guardrails: geo.guardrails,
    });
  }
  return items.slice(0, 8);
}

function buildSummary(input: {
  campaignDecisions: MetaCampaignDecision[];
  adSetDecisions: MetaAdSetDecision[];
  budgetShifts: MetaBudgetShift[];
  geoDecisions: MetaGeoDecision[];
  noTouchList: MetaNoTouchItem[];
  operatingMode: AccountOperatingModePayload | null;
  geoFreshness: MetaGeoSourceFreshness;
  commercialTruth: BusinessCommercialTruthSnapshot;
}): MetaDecisionOsSummary {
  const topAdSetActions = [...input.adSetDecisions]
    .filter((decision) => decision.trust.surfaceLane === "action_core")
    .sort(
      (left, right) =>
        ACTION_PRIORITY[left.actionType] - ACTION_PRIORITY[right.actionType] ||
        right.confidence - left.confidence,
    )
    .slice(0, 3);
  const todayPlan = [
    ...topAdSetActions.map(
      (decision) =>
        `${decision.campaignName} / ${decision.adSetName}: ${decision.actionType.replaceAll("_", " ")}`,
    ),
    ...input.geoDecisions
      .filter((geo) => geo.trust.surfaceLane === "action_core")
      .filter((geo) => geo.action !== "monitor")
      .slice(0, 2)
      .map((geo) => `${geo.label}: ${geo.action}`),
  ].slice(0, 5);
  const surfaceRows = [
    ...input.campaignDecisions.map((decision) => decision.trust),
    ...input.adSetDecisions.map((decision) => decision.trust),
    ...input.geoDecisions.map((decision) => decision.trust),
  ];
  const pooledClusterCount = new Set(
    input.geoDecisions
      .filter((decision) => decision.grouped && decision.clusterKey)
      .map((decision) => decision.clusterKey),
  ).size;

  return {
    todayPlanHeadline:
      topAdSetActions.length > 0
        ? `Today's plan centers on ${topAdSetActions[0].actionType.replaceAll("_", " ")}.`
        : "Today's plan is to hold while more clean signal accumulates.",
    todayPlan,
    budgetShiftSummary:
      input.budgetShifts.length > 0
        ? `${input.budgetShifts.length} explainable budget shift candidate${input.budgetShifts.length > 1 ? "s" : ""} are ready.`
        : "No clean budget shift pair is ready yet.",
    noTouchSummary:
      input.noTouchList.length > 0
        ? `${input.noTouchList.length} winner path${input.noTouchList.length > 1 ? "s are" : " is"} marked no-touch.`
        : "No protected no-touch path is active yet.",
    operatingMode: input.operatingMode
      ? {
          currentMode: input.operatingMode.currentMode,
          recommendedMode: input.operatingMode.recommendedMode,
          confidence: input.operatingMode.confidence,
        }
      : null,
    confidence: clampConfidence(
      topAdSetActions.length > 0
        ? topAdSetActions.reduce((sum, decision) => sum + decision.confidence, 0) / topAdSetActions.length
        : 0.56,
    ),
    surfaceSummary: {
      actionCoreCount:
        input.budgetShifts.length +
        surfaceRows.filter((row) => row.surfaceLane === "action_core").length,
      watchlistCount: surfaceRows.filter((row) => row.surfaceLane === "watchlist").length,
      archiveCount: surfaceRows.filter((row) => row.surfaceLane === "archive_context").length,
      degradedCount: surfaceRows.filter(
        (row) => row.truthState === "degraded_missing_truth",
      ).length,
    },
    geoSummary: {
      actionCoreCount: input.geoDecisions.filter(
        (decision) => decision.trust.surfaceLane === "action_core",
      ).length,
      watchlistCount: input.geoDecisions.filter(
        (decision) => decision.trust.surfaceLane === "watchlist",
      ).length,
      queuedCount: input.geoDecisions.filter((decision) => decision.queueEligible).length,
      pooledClusterCount,
      sourceFreshness: input.geoFreshness,
      countryEconomics: {
        configured: input.commercialTruth.sectionMeta.countryEconomics.configured,
        updatedAt: input.commercialTruth.sectionMeta.countryEconomics.updatedAt,
        sourceLabel: input.commercialTruth.sectionMeta.countryEconomics.sourceLabel,
      },
    },
  };
}

export function buildMetaDecisionOs(
  input: BuildMetaDecisionOsInput,
): MetaDecisionOsV1Response {
  const decisionMetadata = {
    ...buildOperatorDecisionMetadata({
      analyticsStartDate: input.startDate,
      analyticsEndDate: input.endDate,
      decisionAsOf: input.decisionAsOf ?? input.endDate,
    }),
    ...(input.analyticsWindow ? { analyticsWindow: input.analyticsWindow } : {}),
    ...(input.decisionWindows ? { decisionWindows: input.decisionWindows } : {}),
    ...(input.historicalMemory ? { historicalMemory: input.historicalMemory } : {}),
    ...(input.decisionAsOf ? { decisionAsOf: input.decisionAsOf } : {}),
  };
  const thresholds = determineThresholds(input.commercialTruth);
  const commercialTruthCoverage = collectCommercialTruthCoverage(input.commercialTruth);
  const laneByCampaignId = buildMetaCampaignLaneSignals(input.campaigns);
  const activePromoNames = input.commercialTruth.promoCalendar
    .filter((promo) =>
      isPromoActiveOnDate(
        promo.startDate,
        promo.endDate,
        decisionMetadata.decisionAsOf,
      ),
    )
    .map((promo) => normalizeText(`${promo.title} ${promo.affectedScope ?? ""}`))
    .filter(Boolean);
  const operatingMode = buildOperatingModeSummary(input);
  const geoFreshness =
    input.geoSource?.freshness ?? resolveDefaultGeoSourceFreshness(input);
  const geoRows = input.geoSource?.rows ?? input.breakdowns?.location ?? [];
  const accountRoas =
    input.campaigns.reduce((sum, campaign) => sum + campaign.revenue, 0) /
    Math.max(1, input.campaigns.reduce((sum, campaign) => sum + campaign.spend, 0));
  const totalGeoSpend = geoRows.reduce((sum, row) => sum + row.spend, 0);
  const campaignById = new Map(input.campaigns.map((campaign) => [campaign.id, campaign]));

  const campaignRoleById = new Map<string, CampaignRoleDecision>();
  for (const campaign of input.campaigns) {
    campaignRoleById.set(
      campaign.id,
      classifyCampaignRole({
        campaign,
        laneLabel: laneByCampaignId.get(campaign.id)?.lane ?? null,
        activePromoNames,
      }),
    );
  }

  const adSetDecisions = input.adSets.map((adSet) =>
    buildAdSetDecision({
      adSet,
      campaign: campaignById.get(adSet.campaignId) ?? null,
      campaignRole: campaignRoleById.get(adSet.campaignId)?.role ?? "Prospecting Validation",
      thresholds,
      commercialTruth: input.commercialTruth,
      geoCoverageMode: commercialTruthCoverage.mode,
      operatingMode,
      decisionAsOf: decisionMetadata.decisionAsOf,
    }),
  );

  const campaignDecisions = input.campaigns.map((campaign) => {
    const roleDecision = campaignRoleById.get(campaign.id) ?? {
      role: "Prospecting Validation" as const,
      confidence: 0.58,
      why: "No stronger role signal exists.",
    };
    const relatedAdSets = adSetDecisions.filter((decision) => decision.campaignId === campaign.id);
    return buildCampaignDecision({
      campaign,
      laneLabel: laneByCampaignId.get(campaign.id)?.lane ?? null,
      roleDecision,
      adSetDecisions: relatedAdSets,
      thresholds,
    });
  });

  const budgetShifts = buildBudgetShifts({
    campaigns: campaignDecisions,
    campaignRows: input.campaigns,
  });
  const geoDecisions = hydrateGeoClusters(
    geoRows
    .map((row) =>
      buildGeoAction({
        row,
        accountRoas: Number.isFinite(accountRoas) ? accountRoas : 0,
        snapshot: input.commercialTruth,
        thresholds,
        geoFreshness,
        totalGeoSpend,
      }),
    )
    .sort((left, right) => right.confidence - left.confidence),
  );
  const placementAnomalies = buildPlacementAnomalies({
    rows: input.breakdowns?.placement ?? [],
    accountRoas: Number.isFinite(accountRoas) ? accountRoas : 0,
  });
  const noTouchList = buildNoTouchList({
    campaigns: campaignDecisions,
    adSets: adSetDecisions,
    geoDecisions,
  });
  const summary = buildSummary({
    campaignDecisions,
    adSetDecisions,
    budgetShifts,
    geoDecisions,
    noTouchList,
    operatingMode,
    geoFreshness,
    commercialTruth: input.commercialTruth,
  });

  return {
    contractVersion: META_DECISION_OS_V1_CONTRACT,
    generatedAt: new Date().toISOString(),
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    analyticsWindow: decisionMetadata.analyticsWindow,
    decisionWindows: decisionMetadata.decisionWindows,
    historicalMemory: decisionMetadata.historicalMemory,
    decisionAsOf: decisionMetadata.decisionAsOf,
    summary,
    campaigns: campaignDecisions.sort((left, right) => right.confidence - left.confidence),
    adSets: adSetDecisions.sort(
      (left, right) =>
        ACTION_PRIORITY[left.actionType] - ACTION_PRIORITY[right.actionType] ||
        right.confidence - left.confidence,
    ),
    budgetShifts,
    geoDecisions,
    placementAnomalies,
    noTouchList,
    commercialTruthCoverage,
  };
}
