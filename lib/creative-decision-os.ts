import type { MetaCampaignRow } from "@/app/api/meta/campaigns/route";
import type { getMetaAdSetsForRange } from "@/lib/meta/adsets-source";
import type { getMetaBreakdownsForRange } from "@/lib/meta/breakdowns-source";
import { buildOperatorDecisionMetadata } from "@/lib/operator-decision-metadata";
import type { AccountOperatingModePayload, BusinessCommercialTruthSnapshot } from "@/src/types/business-commercial";
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
import {
  metaCampaignFamilyLabel,
  resolveMetaCampaignFamily,
  type MetaCampaignFamily,
  type MetaCampaignLaneLabel,
} from "@/lib/meta/campaign-lanes";

type MetaAdSetRow = Awaited<ReturnType<typeof getMetaAdSetsForRange>>["rows"][number];
type MetaBreakdownRow = Awaited<ReturnType<typeof getMetaBreakdownsForRange>>["location"][number];

export const CREATIVE_DECISION_OS_CONTRACT_VERSION = "creative-decision-os.v1";
export const CREATIVE_DECISION_OS_ENGINE_VERSION = "2026-04-10-phase-04-v1";

export type CreativeDecisionAction = "scale_hard" | "scale" | "watch" | "test_more" | "pause" | "kill";
export type LegacyCreativeLifecycleState =
  | "stable_winner"
  | "emerging_winner"
  | "volatile"
  | "fatigued_winner"
  | "test_only"
  | "blocked";
export type CreativeDecisionLifecycleState =
  | "incubating"
  | "validating"
  | "scale_ready"
  | "stable_winner"
  | "fatigued_winner"
  | "blocked"
  | "retired"
  | "comeback_candidate";
export type CreativeDecisionPrimaryAction =
  | "promote_to_scaling"
  | "keep_in_test"
  | "hold_no_touch"
  | "refresh_replace"
  | "block_deploy"
  | "retest_comeback";
export type CreativeDecisionFamilySource =
  | "story_identity"
  | "asset_identity"
  | "copy_signature"
  | "singleton";
export type CreativeDecisionBenchmarkCohort =
  | "family"
  | "family_format"
  | "format_age"
  | "format_spend_maturity"
  | "meta_campaign_family"
  | "format"
  | "account";
export type CreativeDecisionGeoContext = "scale" | "validate" | "pool" | "isolate" | "none";
export type CreativeFatigueStatus = "none" | "watch" | "fatigued" | "unknown";
export type CreativeDecisionAdSetRole =
  | "scaling_hero"
  | "validation_challenger"
  | "test_probe"
  | "refresh_replacement"
  | "hold_position"
  | "blocked"
  | null;

export interface CreativeDecisionOsHistoricalWindow {
  spend: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  ctr: number;
  purchases: number;
  impressions: number;
  linkClicks: number;
  hookRate: number;
  holdRate: number;
  video25Rate: number;
  watchRate: number;
  video75Rate: number;
  clickToPurchaseRate: number;
  atcToPurchaseRate: number;
}

export interface CreativeDecisionOsHistoricalWindows {
  last3?: CreativeDecisionOsHistoricalWindow | null;
  last7?: CreativeDecisionOsHistoricalWindow | null;
  last14?: CreativeDecisionOsHistoricalWindow | null;
  last30?: CreativeDecisionOsHistoricalWindow | null;
  last90?: CreativeDecisionOsHistoricalWindow | null;
  allHistory?: CreativeDecisionOsHistoricalWindow | null;
}

export interface CreativeDecisionOsInputRow {
  creativeId: string;
  name: string;
  creativeFormat?: "image" | "video" | "catalog";
  creativeAgeDays: number;
  spendVelocity: number;
  frequency: number;
  spend: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
  cpc: number;
  purchases: number;
  impressions: number;
  linkClicks: number;
  hookRate: number;
  holdRate: number;
  video25Rate: number;
  watchRate: number;
  video75Rate: number;
  clickToPurchaseRate: number;
  atcToPurchaseRate: number;
  copyText?: string | null;
  copyVariants?: string[];
  headlineVariants?: string[];
  descriptionVariants?: string[];
  objectStoryId?: string | null;
  effectiveObjectStoryId?: string | null;
  postId?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  adSetId?: string | null;
  adSetName?: string | null;
  taxonomyPrimaryLabel?: string | null;
  taxonomySecondaryLabel?: string | null;
  taxonomyVisualFormat?: string | null;
  aiTags?: Partial<Record<string, string[]>>;
  historicalWindows?: CreativeDecisionOsHistoricalWindows | null;
}

export interface CreativeDecisionBenchmarkMetric {
  current: number | null;
  benchmark: number | null;
  deltaPct: number | null;
  status: "better" | "near" | "worse" | "unknown";
}

export interface CreativeDecisionBenchmark {
  selectedCohort: CreativeDecisionBenchmarkCohort;
  selectedCohortLabel: string;
  sampleSize: number;
  fallbackChain: CreativeDecisionBenchmarkCohort[];
  missingContext: string[];
  metrics: {
    roas: CreativeDecisionBenchmarkMetric;
    cpa: CreativeDecisionBenchmarkMetric;
    ctr: CreativeDecisionBenchmarkMetric;
    clickToPurchase: CreativeDecisionBenchmarkMetric;
    attention: CreativeDecisionBenchmarkMetric & { label: string };
  };
}

export interface CreativeDecisionFatigue {
  status: CreativeFatigueStatus;
  confidence: number;
  ctrDecay: number | null;
  clickToPurchaseDecay: number | null;
  roasDecay: number | null;
  spendConcentration: number | null;
  frequencyPressure: number | null;
  winnerMemory: boolean;
  evidence: string[];
  missingContext: string[];
}

export interface CreativeDecisionDeploymentRecommendation {
  metaFamily: MetaCampaignFamily;
  metaFamilyLabel: string;
  targetLane: MetaCampaignLaneLabel | null;
  targetAdSetRole: CreativeDecisionAdSetRole;
  preferredCampaignIds: string[];
  preferredCampaignNames: string[];
  preferredAdSetIds: string[];
  preferredAdSetNames: string[];
  geoContext: CreativeDecisionGeoContext;
  constraints: string[];
  whatWouldChangeThisDecision: string[];
}

export interface CreativeDecisionPatternReference {
  hook: string;
  angle: string;
  format: string;
}

export interface CreativeRuleReportFactor {
  label: string;
  impact: "positive" | "negative" | "neutral";
  value: string;
  reason: string;
}

export interface CreativeRuleReportPayload {
  creativeId: string;
  creativeName: string;
  action: CreativeDecisionAction;
  lifecycleState?: LegacyCreativeLifecycleState;
  score: number;
  confidence: number;
  summary: string;
  coreVerdict?: string;
  accountContext: {
    roasAvg: number;
    cpaAvg: number;
    ctrAvg: number;
    spendMedian: number;
    spendP20: number;
    spendP80: number;
  };
  timeframeContext?: {
    coreVerdict: string;
    selectedRangeOverlay: string;
    historicalSupport: string;
    note?: string | null;
  };
  factors: CreativeRuleReportFactor[];
  family?: {
    familyId: string;
    familyLabel: string;
    familySource: CreativeDecisionFamilySource;
    memberCount: number;
  };
  benchmark?: CreativeDecisionBenchmark;
  fatigue?: CreativeDecisionFatigue;
  deployment?: CreativeDecisionDeploymentRecommendation;
  deterministicDecision?: {
    lifecycleState: CreativeDecisionLifecycleState;
    primaryAction: CreativeDecisionPrimaryAction;
    legacyAction: CreativeDecisionAction;
  };
  commercialContext?: {
    operatingMode: AccountOperatingModePayload["recommendedMode"] | null;
    confidence: number;
    missingInputs: string[];
  };
  pattern?: CreativeDecisionPatternReference;
}

export interface CreativeDecisionOsCreative {
  creativeId: string;
  familyId: string;
  familyLabel: string;
  familySource: CreativeDecisionFamilySource;
  name: string;
  creativeFormat: "image" | "video" | "catalog";
  creativeAgeDays: number;
  spend: number;
  purchaseValue: number;
  roas: number;
  cpa: number;
  ctr: number;
  purchases: number;
  impressions: number;
  linkClicks: number;
  score: number;
  confidence: number;
  lifecycleState: CreativeDecisionLifecycleState;
  primaryAction: CreativeDecisionPrimaryAction;
  legacyAction: CreativeDecisionAction;
  legacyLifecycleState: LegacyCreativeLifecycleState;
  decisionSignals: string[];
  summary: string;
  benchmark: CreativeDecisionBenchmark;
  fatigue: CreativeDecisionFatigue;
  deployment: CreativeDecisionDeploymentRecommendation;
  pattern: CreativeDecisionPatternReference;
  report: CreativeRuleReportPayload;
  trust: DecisionTrustMetadata;
}

export interface CreativeDecisionOsFamily {
  familyId: string;
  familyLabel: string;
  familySource: CreativeDecisionFamilySource;
  creativeIds: string[];
  dominantFormat: string;
  lifecycleState: CreativeDecisionLifecycleState;
  primaryAction: CreativeDecisionPrimaryAction;
  totalSpend: number;
  totalPurchaseValue: number;
  totalPurchases: number;
  topAngles: string[];
  topHooks: string[];
  metaFamily: MetaCampaignFamily;
  metaFamilyLabel: string;
}

export interface CreativeDecisionOsPattern {
  patternKey: string;
  hook: string;
  angle: string;
  format: string;
  creativeIds: string[];
  spend: number;
  purchaseValue: number;
  roas: number;
  lifecycleState: CreativeDecisionLifecycleState;
  confidence: number;
}

export interface CreativeDecisionLifecycleBoardItem {
  state: CreativeDecisionLifecycleState;
  label: string;
  count: number;
  creativeIds: string[];
}

export interface CreativeDecisionOperatorQueue {
  key: "promotion" | "keep_testing" | "fatigued_blocked" | "comeback";
  label: string;
  summary: string;
  count: number;
  creativeIds: string[];
}

export interface CreativeDecisionOsCommercialTruthCoverage {
  operatingMode: AccountOperatingModePayload["recommendedMode"] | null;
  confidence: number;
  missingInputs: string[];
  activeInputs: string[];
  guardrails: string[];
  configuredSections: {
    targetPack: boolean;
    countryEconomics: boolean;
    promoCalendar: boolean;
    operatingConstraints: boolean;
  };
}

export interface CreativeDecisionOsV1Response {
  contractVersion: typeof CREATIVE_DECISION_OS_CONTRACT_VERSION;
  engineVersion: typeof CREATIVE_DECISION_OS_ENGINE_VERSION;
  generatedAt: string;
  businessId: string;
  startDate: string;
  endDate: string;
  analyticsWindow: OperatorAnalyticsWindow;
  decisionWindows: OperatorDecisionWindows;
  historicalMemory: OperatorHistoricalMemory;
  decisionAsOf: string;
  summary: {
    totalCreatives: number;
    scaleReadyCount: number;
    keepTestingCount: number;
    fatiguedCount: number;
    blockedCount: number;
    comebackCount: number;
    message: string;
    operatingMode: AccountOperatingModePayload["recommendedMode"] | null;
    surfaceSummary: {
      actionCoreCount: number;
      watchlistCount: number;
      archiveCount: number;
      degradedCount: number;
    };
  };
  creatives: CreativeDecisionOsCreative[];
  families: CreativeDecisionOsFamily[];
  patterns: CreativeDecisionOsPattern[];
  lifecycleBoard: CreativeDecisionLifecycleBoardItem[];
  operatorQueues: CreativeDecisionOperatorQueue[];
  commercialTruthCoverage: CreativeDecisionOsCommercialTruthCoverage;
}

interface BuildCreativeDecisionOsInput {
  businessId: string;
  startDate: string;
  endDate: string;
  analyticsWindow?: OperatorAnalyticsWindow;
  decisionWindows?: OperatorDecisionWindows;
  historicalMemory?: OperatorHistoricalMemory;
  decisionAsOf?: string;
  rows: CreativeDecisionOsInputRow[];
  campaigns?: MetaCampaignRow[];
  adSets?: MetaAdSetRow[];
  breakdowns?: { location?: MetaBreakdownRow[] | null } | null;
  commercialTruth?: BusinessCommercialTruthSnapshot | null;
  operatingMode?: AccountOperatingModePayload | null;
  generatedAt?: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0] ?? 0;
  const index = (values.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  const lowerValue = values[lower] ?? values[values.length - 1] ?? 0;
  const upperValue = values[upper] ?? values[values.length - 1] ?? 0;
  return lowerValue + (upperValue - lowerValue) * weight;
}

function average(values: number[]) {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length === 0) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function safeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "");
}

function buildDecisionTrust(input: {
  surfaceLane: DecisionSurfaceLane;
  truthState: DecisionTrustMetadata["truthState"];
  operatorDisposition: DecisionOperatorDisposition;
  reasons: Array<string | null | undefined>;
}) {
  return {
    surfaceLane: input.surfaceLane,
    truthState: input.truthState,
    operatorDisposition: input.operatorDisposition,
    reasons: input.reasons
      .map((reason) => reason?.trim())
      .filter((reason): reason is string => Boolean(reason)),
  } satisfies DecisionTrustMetadata;
}

function normalizeMediaKey(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function sum(values: number[]) {
  return values.reduce((acc, value) => acc + value, 0);
}

function sumBy<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((acc, row) => acc + pick(row), 0);
}

function meanMetric(rows: CreativeDecisionOsInputRow[], pick: (row: CreativeDecisionOsInputRow) => number) {
  if (rows.length === 0) return 0;
  return average(rows.map(pick));
}

function pickAttentionMetric(row: CreativeDecisionOsInputRow) {
  if (row.creativeFormat === "video") {
    if (row.hookRate > 0) return { label: "Thumbstop", value: row.hookRate };
    if (row.video25Rate > 0) return { label: "Video 25%", value: row.video25Rate };
    if (row.watchRate > 0) return { label: "Watch rate", value: row.watchRate };
  }
  if (row.hookRate > 0) return { label: "Hook rate", value: row.hookRate };
  if (row.ctr > 0) return { label: "CTR", value: row.ctr };
  return { label: "Attention", value: 0 };
}

function statusFromDelta(deltaPct: number | null, direction: "high" | "low") {
  if (deltaPct === null || !Number.isFinite(deltaPct)) return "unknown" as const;
  const directionalDelta = direction === "low" ? -deltaPct : deltaPct;
  if (directionalDelta >= 0.15) return "better" as const;
  if (directionalDelta <= -0.15) return "worse" as const;
  return "near" as const;
}

function metricDelta(current: number, benchmark: number) {
  if (!Number.isFinite(current) || !Number.isFinite(benchmark) || benchmark <= 0) return null;
  return (current - benchmark) / benchmark;
}

function legacyLifecycleFromState(state: CreativeDecisionLifecycleState, legacyAction: CreativeDecisionAction): LegacyCreativeLifecycleState {
  if (state === "stable_winner") return "stable_winner";
  if (state === "scale_ready") return "emerging_winner";
  if (state === "fatigued_winner") return "fatigued_winner";
  if (state === "blocked" || state === "retired") return "blocked";
  if (state === "incubating" || state === "comeback_candidate") return "test_only";
  if (legacyAction === "test_more") return "test_only";
  return "volatile";
}

function legacyActionFromPrimary(input: {
  primaryAction: CreativeDecisionPrimaryAction;
  lifecycleState: CreativeDecisionLifecycleState;
  score: number;
  confidence: number;
}) {
  if (input.primaryAction === "promote_to_scaling") {
    return input.lifecycleState === "stable_winner" || (input.score >= 86 && input.confidence >= 0.76)
      ? "scale_hard"
      : "scale";
  }
  if (input.primaryAction === "keep_in_test" || input.primaryAction === "retest_comeback") {
    return "test_more";
  }
  if (input.primaryAction === "refresh_replace") {
    return "pause";
  }
  if (input.primaryAction === "block_deploy") {
    return input.lifecycleState === "blocked" ? "kill" : "pause";
  }
  return "watch";
}

function buildStoryIdentityKey(row: CreativeDecisionOsInputRow) {
  const storyId = row.effectiveObjectStoryId ?? row.objectStoryId ?? row.postId ?? null;
  return storyId ? `story:${storyId}` : null;
}

function buildAssetIdentityKey(row: CreativeDecisionOsInputRow) {
  const mediaKey = normalizeMediaKey(
    (row as CreativeDecisionOsInputRow & { previewUrl?: string | null }).previewUrl ??
      (row as CreativeDecisionOsInputRow & { imageUrl?: string | null }).imageUrl ??
      null,
  );
  return mediaKey ? `asset:${mediaKey}` : null;
}

function buildCopyIdentityKey(row: CreativeDecisionOsInputRow) {
  const aiTagSignature = Object.entries(row.aiTags ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => `${key}:${(values ?? []).join("|")}`)
    .join(";");
  const copyKey = [
    normalizeText(row.copyText ?? row.copyVariants?.[0] ?? null),
    normalizeText(row.headlineVariants?.[0] ?? null),
    normalizeText(row.name),
    normalizeText(row.taxonomyPrimaryLabel ?? null),
    aiTagSignature,
  ]
    .filter(Boolean)
    .join("|");
  return copyKey ? `copy:${copyKey}` : null;
}

interface FamilySeed {
  familyId: string;
  familySource: CreativeDecisionFamilySource;
}

function buildFamilySeeds(rows: CreativeDecisionOsInputRow[]) {
  const counts = new Map<string, number>();
  const recordCount = (key: string | null) => {
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };

  for (const row of rows) {
    recordCount(buildStoryIdentityKey(row));
    recordCount(buildAssetIdentityKey(row));
    recordCount(buildCopyIdentityKey(row));
  }

  const result = new Map<string, FamilySeed>();
  for (const row of rows) {
    const storyKey = buildStoryIdentityKey(row);
    if (storyKey && (counts.get(storyKey) ?? 0) >= 2) {
      result.set(row.creativeId, { familyId: storyKey, familySource: "story_identity" });
      continue;
    }
    const assetKey = buildAssetIdentityKey(row);
    if (assetKey && (counts.get(assetKey) ?? 0) >= 2) {
      result.set(row.creativeId, { familyId: assetKey, familySource: "asset_identity" });
      continue;
    }
    const copyKey = buildCopyIdentityKey(row);
    if (copyKey && (counts.get(copyKey) ?? 0) >= 2) {
      result.set(row.creativeId, { familyId: copyKey, familySource: "copy_signature" });
      continue;
    }
    result.set(row.creativeId, { familyId: `singleton:${row.creativeId}`, familySource: "singleton" });
  }
  return result;
}

function chooseFamilyLabel(rows: CreativeDecisionOsInputRow[]) {
  const headline = rows
    .flatMap((row) => row.headlineVariants ?? [])
    .find((value) => normalizeText(value).length > 0);
  if (headline) return headline;
  const copy = rows
    .map((row) => row.copyText ?? row.copyVariants?.[0] ?? null)
    .find((value) => normalizeText(value).length > 0);
  if (copy) return copy;
  return rows[0]?.name ?? "Creative family";
}

function ageBucket(ageDays: number) {
  if (ageDays <= 7) return "new";
  if (ageDays <= 21) return "learning";
  return "mature";
}

function buildBenchmarkMetric(current: number, benchmark: number, direction: "high" | "low"): CreativeDecisionBenchmarkMetric {
  const deltaPct = metricDelta(current, benchmark);
  return {
    current: round(current, 4),
    benchmark: benchmark > 0 ? round(benchmark, 4) : null,
    deltaPct: deltaPct === null ? null : round(deltaPct, 4),
    status: statusFromDelta(deltaPct, direction),
  };
}

function resolveGeoContext(mode: AccountOperatingModePayload["recommendedMode"] | null, action: CreativeDecisionPrimaryAction): CreativeDecisionGeoContext {
  if (action === "block_deploy") return "none";
  if (mode === "Margin Protect") return "isolate";
  if (action === "promote_to_scaling") return "scale";
  if (action === "keep_in_test" || action === "retest_comeback") return "validate";
  if (action === "refresh_replace") return "pool";
  return "pool";
}

function buildCommercialTruthCoverage(
  snapshot: BusinessCommercialTruthSnapshot | null | undefined,
  operatingMode: AccountOperatingModePayload | null | undefined,
): CreativeDecisionOsCommercialTruthCoverage {
  return {
    operatingMode: operatingMode?.recommendedMode ?? null,
    confidence: operatingMode?.confidence ?? 0.3,
    missingInputs: operatingMode?.missingInputs ?? [],
    activeInputs: operatingMode?.activeCommercialInputs.map((item) => `${item.label}: ${item.detail}`) ?? [],
    guardrails: operatingMode?.guardrails ?? [],
    configuredSections: {
      targetPack: snapshot?.sectionMeta.targetPack.configured ?? false,
      countryEconomics: snapshot?.sectionMeta.countryEconomics.configured ?? false,
      promoCalendar: snapshot?.sectionMeta.promoCalendar.configured ?? false,
      operatingConstraints: snapshot?.sectionMeta.operatingConstraints.configured ?? false,
    },
  };
}

function buildMetricContext(rows: CreativeDecisionOsInputRow[]) {
  const spendValues = rows.map((row) => row.spend).filter((value) => value > 0).sort((a, b) => a - b);
  const totalSpend = sumBy(rows, (row) => row.spend);
  const totalPurchaseValue = sumBy(rows, (row) => row.purchaseValue);
  const totalPurchases = sumBy(rows, (row) => row.purchases);
  const totalLinkClicks = sumBy(rows, (row) => row.linkClicks);

  return {
    roasAvg: totalSpend > 0 ? totalPurchaseValue / totalSpend : average(rows.map((row) => row.roas)),
    cpaAvg: totalPurchases > 0 ? totalSpend / totalPurchases : average(rows.map((row) => row.cpa).filter((value) => value > 0)),
    ctrAvg: average(rows.map((row) => row.ctr)),
    spendMedian: percentile(spendValues, 0.5),
    spendP20: percentile(spendValues, 0.2),
    spendP80: percentile(spendValues, 0.8),
    spendP75: percentile(spendValues, 0.75),
    accountAttentionAvg: average(rows.map((row) => pickAttentionMetric(row).value).filter((value) => value > 0)),
    clickToPurchaseAvg: average(rows.map((row) => row.clickToPurchaseRate).filter((value) => value > 0)),
  };
}

function buildHistoricalSummary(row: CreativeDecisionOsInputRow) {
  const windows = [
    row.historicalWindows?.last3,
    row.historicalWindows?.last7,
    row.historicalWindows?.last14,
    row.historicalWindows?.last30,
    row.historicalWindows?.last90,
    row.historicalWindows?.allHistory,
  ].filter((window): window is CreativeDecisionOsHistoricalWindow => Boolean(window));

  const strongCount = windows.filter((window) => window.roas >= 1.5 && window.purchases >= 1).length;
  const weakCount = windows.filter((window) => window.spend >= 50 && window.roas > 0 && window.roas < 0.9).length;
  const bestWindow = [...windows].sort((left, right) => right.roas - left.roas)[0] ?? null;
  const baselineRoas =
    windows.length > 0 ? average(windows.map((window) => window.roas).filter((value) => value > 0)) : row.roas;

  return {
    total: windows.length,
    strongCount,
    weakCount,
    bestWindow,
    baselineRoas,
  };
}

function selectBenchmark(
  row: CreativeDecisionOsInputRow,
  familyRows: CreativeDecisionOsInputRow[],
  allRows: CreativeDecisionOsInputRow[],
  metaFamily: MetaCampaignFamily,
) {
  const spendValues = allRows.map((item) => item.spend).filter((value) => value > 0).sort((a, b) => a - b);
  const p33 = percentile(spendValues, 0.33);
  const p66 = percentile(spendValues, 0.66);
  const spendBucket =
    row.spend <= p33 ? "low" : row.spend <= p66 ? "mid" : "high";

  const cohorts: Array<{
    key: CreativeDecisionBenchmarkCohort;
    label: string;
    rows: CreativeDecisionOsInputRow[];
  }> = [
    { key: "family", label: "Family", rows: familyRows.filter((candidate) => candidate.creativeId !== row.creativeId) },
    {
      key: "family_format",
      label: "Family + format",
      rows: familyRows.filter(
        (candidate) =>
          candidate.creativeId !== row.creativeId && candidate.creativeFormat === row.creativeFormat,
      ),
    },
    {
      key: "format_age",
      label: "Format + age",
      rows: allRows.filter(
        (candidate) =>
          candidate.creativeId !== row.creativeId &&
          candidate.creativeFormat === row.creativeFormat &&
          ageBucket(candidate.creativeAgeDays) === ageBucket(row.creativeAgeDays),
      ),
    },
    {
      key: "format_spend_maturity",
      label: "Format + spend maturity",
      rows: allRows.filter((candidate) => {
        const candidateBucket =
          candidate.spend <= p33 ? "low" : candidate.spend <= p66 ? "mid" : "high";
        return (
          candidate.creativeId !== row.creativeId &&
          candidate.creativeFormat === row.creativeFormat &&
          candidateBucket === spendBucket
        );
      }),
    },
    {
      key: "meta_campaign_family",
      label: "Meta family",
      rows: allRows.filter(
        (candidate) =>
          candidate.creativeId !== row.creativeId &&
          metaFamilyFromRow(candidate, new Map()) === metaFamily,
      ),
    },
    {
      key: "format",
      label: "Format",
      rows: allRows.filter(
        (candidate) =>
          candidate.creativeId !== row.creativeId && candidate.creativeFormat === row.creativeFormat,
      ),
    },
    {
      key: "account",
      label: "Account",
      rows: allRows.filter((candidate) => candidate.creativeId !== row.creativeId),
    },
  ];

  const fallbackChain: CreativeDecisionBenchmarkCohort[] = [];
  const missingContext: string[] = [];
  let selected = cohorts[cohorts.length - 1]!;

  for (const cohort of cohorts) {
    fallbackChain.push(cohort.key);
    const sampleSize = cohort.rows.length;
    const totalPurchases = sumBy(cohort.rows, (candidate) => candidate.purchases);
    const totalSpend = sumBy(cohort.rows, (candidate) => candidate.spend);
    if (sampleSize >= 2 && (totalPurchases >= 3 || totalSpend >= 150)) {
      selected = cohort;
      break;
    }
    missingContext.push(`${cohort.label} sample too thin`);
  }

  const selectedRows = selected.rows.length > 0 ? selected.rows : [row];
  const attentionRowValues = selectedRows.map((candidate) => pickAttentionMetric(candidate).value).filter((value) => value > 0);
  const attentionMetric = pickAttentionMetric(row);

  return {
    selectedCohort: selected.key,
    selectedCohortLabel: selected.label,
    sampleSize: selected.rows.length,
    fallbackChain,
    missingContext,
    metrics: {
      roas: buildBenchmarkMetric(row.roas, meanMetric(selectedRows, (candidate) => candidate.roas), "high"),
      cpa: buildBenchmarkMetric(row.cpa, meanMetric(selectedRows, (candidate) => candidate.cpa), "low"),
      ctr: buildBenchmarkMetric(row.ctr, meanMetric(selectedRows, (candidate) => candidate.ctr), "high"),
      clickToPurchase: buildBenchmarkMetric(
        row.clickToPurchaseRate,
        meanMetric(selectedRows, (candidate) => candidate.clickToPurchaseRate),
        "high",
      ),
      attention: {
        ...buildBenchmarkMetric(
          attentionMetric.value,
          attentionRowValues.length > 0 ? average(attentionRowValues) : attentionMetric.value,
          "high",
        ),
        label: attentionMetric.label,
      },
    },
  } satisfies CreativeDecisionBenchmark;
}

function buildFatigue(
  row: CreativeDecisionOsInputRow,
  familyRows: CreativeDecisionOsInputRow[],
  benchmark: CreativeDecisionBenchmark,
) {
  const historical = buildHistoricalSummary(row);
  const bestWindow = historical.bestWindow;
  const ctrDecay =
    bestWindow && bestWindow.ctr > 0 ? (bestWindow.ctr - row.ctr) / bestWindow.ctr : null;
  const clickToPurchaseDecay =
    bestWindow && bestWindow.clickToPurchaseRate > 0
      ? (bestWindow.clickToPurchaseRate - row.clickToPurchaseRate) / bestWindow.clickToPurchaseRate
      : null;
  const roasDecay =
    bestWindow && bestWindow.roas > 0 ? (bestWindow.roas - row.roas) / bestWindow.roas : null;
  const familySpend = sumBy(familyRows, (candidate) => candidate.spend);
  const spendConcentration = familySpend > 0 ? row.spend / familySpend : null;
  const frequencyPressure = row.frequency > 0 ? row.frequency : null;
  const missingContext: string[] = [];
  if (!bestWindow) missingContext.push("Historical winner window unavailable");
  if (!frequencyPressure) missingContext.push("Frequency unavailable");

  const decaySignals = [ctrDecay, clickToPurchaseDecay, roasDecay].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  const significantDecayCount = decaySignals.filter((value) => value >= 0.18).length;
  const winnerMemory = historical.strongCount >= 2;
  const pressureSignals =
    (spendConcentration !== null && spendConcentration >= 0.55 ? 1 : 0) +
    (frequencyPressure !== null && frequencyPressure >= 2.5 ? 1 : 0);
  const benchmarkWeakening =
    benchmark.metrics.roas.status === "worse" && benchmark.metrics.clickToPurchase.status === "worse";

  let status: CreativeFatigueStatus = "none";
  if (!winnerMemory && historical.total === 0) {
    status = "unknown";
  } else if (winnerMemory && significantDecayCount >= 2 && (pressureSignals >= 1 || benchmarkWeakening)) {
    status = "fatigued";
  } else if (winnerMemory && (significantDecayCount >= 1 || benchmarkWeakening)) {
    status = "watch";
  }

  const evidence: string[] = [];
  if (ctrDecay !== null) evidence.push(`CTR decay ${Math.round(ctrDecay * 100)}% vs prior winner window.`);
  if (clickToPurchaseDecay !== null) {
    evidence.push(`Click-to-purchase decay ${Math.round(clickToPurchaseDecay * 100)}%.`);
  }
  if (roasDecay !== null) evidence.push(`ROAS decay ${Math.round(roasDecay * 100)}%.`);
  if (spendConcentration !== null) {
    evidence.push(`This creative carries ${Math.round(spendConcentration * 100)}% of family spend.`);
  }
  if (frequencyPressure !== null) {
    evidence.push(`Observed frequency ${round(frequencyPressure, 2)}.`);
  }

  let confidence = 0.48;
  if (winnerMemory) confidence += 0.16;
  if (significantDecayCount >= 2) confidence += 0.14;
  if (pressureSignals >= 1) confidence += 0.08;
  if (missingContext.length > 0) confidence -= 0.08;

  return {
    status,
    confidence: clamp(round(confidence, 2), 0.32, 0.9),
    ctrDecay: ctrDecay === null ? null : round(ctrDecay, 4),
    clickToPurchaseDecay: clickToPurchaseDecay === null ? null : round(clickToPurchaseDecay, 4),
    roasDecay: roasDecay === null ? null : round(roasDecay, 4),
    spendConcentration: spendConcentration === null ? null : round(spendConcentration, 4),
    frequencyPressure: frequencyPressure === null ? null : round(frequencyPressure, 4),
    winnerMemory,
    evidence: evidence.slice(0, 4),
    missingContext,
  } satisfies CreativeDecisionFatigue;
}

function metaFamilyFromRow(row: CreativeDecisionOsInputRow, campaignById: Map<string, MetaCampaignRow>) {
  const campaign = row.campaignId ? campaignById.get(row.campaignId) : null;
  if (campaign) return resolveMetaCampaignFamily(campaign);
  if ((row.taxonomyPrimaryLabel ?? "").toLowerCase().includes("lead")) return "lead";
  return "purchase_value";
}

function classifyLifecycle(input: {
  row: CreativeDecisionOsInputRow;
  benchmark: CreativeDecisionBenchmark;
  fatigue: CreativeDecisionFatigue;
  historical: ReturnType<typeof buildHistoricalSummary>;
  operatingMode: AccountOperatingModePayload | null | undefined;
}) {
  const { row, benchmark, fatigue, historical, operatingMode } = input;
  const lowSignal = row.spend < 120 || row.purchases < 2 || row.impressions < 5000;
  const severeCommercialBlock =
    operatingMode?.recommendedMode === "Recovery" ||
    operatingMode?.guardrails.some((guardrail) => guardrail.toLowerCase().includes("do not scale")) === true;

  if (row.spend < 10 && row.impressions < 500 && row.purchases === 0) {
    if (historical.strongCount >= 2) return "comeback_candidate" as const;
    return "retired" as const;
  }
  if (severeCommercialBlock) {
    return row.purchases > 0 && historical.strongCount >= 2
      ? ("fatigued_winner" as const)
      : ("blocked" as const);
  }
  if (
    benchmark.metrics.roas.status === "worse" &&
    benchmark.metrics.cpa.status === "worse" &&
    row.spend >= 150 &&
    row.purchases <= 1
  ) {
    return historical.strongCount >= 2 ? ("comeback_candidate" as const) : ("blocked" as const);
  }
  if (fatigue.status === "fatigued") return "fatigued_winner" as const;
  if (
    benchmark.metrics.roas.status === "better" &&
    benchmark.metrics.clickToPurchase.status !== "worse" &&
    row.purchases >= 3 &&
    row.spend >= 150
  ) {
    return historical.strongCount >= 2 ? ("stable_winner" as const) : ("scale_ready" as const);
  }
  if (lowSignal) return row.creativeAgeDays <= 10 ? ("incubating" as const) : ("validating" as const);
  return "validating" as const;
}

function decidePrimaryAction(
  lifecycleState: CreativeDecisionLifecycleState,
  operatingMode: AccountOperatingModePayload | null | undefined,
) {
  if (operatingMode?.recommendedMode === "Recovery" && lifecycleState !== "stable_winner") {
    return "block_deploy" as const;
  }
  if (lifecycleState === "scale_ready") return "promote_to_scaling" as const;
  if (lifecycleState === "stable_winner") return "hold_no_touch" as const;
  if (lifecycleState === "fatigued_winner") return "refresh_replace" as const;
  if (lifecycleState === "blocked" || lifecycleState === "retired") return "block_deploy" as const;
  if (lifecycleState === "comeback_candidate") return "retest_comeback" as const;
  return "keep_in_test" as const;
}

function buildCreativeTrust(input: {
  row: CreativeDecisionOsInputRow;
  lifecycleState: CreativeDecisionLifecycleState;
  primaryAction: CreativeDecisionPrimaryAction;
  operatingMode: AccountOperatingModePayload | null | undefined;
  historical: ReturnType<typeof buildHistoricalSummary>;
  summary: string;
}) {
  const lowMateriality =
    input.row.spend < 40 && input.row.purchases === 0 && input.row.impressions < 2_000;
  const archiveContext =
    input.lifecycleState === "retired" ||
    (lowMateriality &&
      input.primaryAction !== "retest_comeback" &&
      input.historical.strongCount === 0);
  const degradedMode = input.operatingMode?.degradedMode;

  if (archiveContext) {
    return buildDecisionTrust({
      surfaceLane: "archive_context",
      truthState: "inactive_or_immaterial",
      operatorDisposition: "archive_only",
      reasons: [
        input.lifecycleState === "retired"
          ? "Creative is retired from the live action core."
          : "Creative signal is too small for the default action core.",
        input.summary,
      ],
    });
  }

  if (input.primaryAction === "hold_no_touch") {
    return buildDecisionTrust({
      surfaceLane: "watchlist",
      truthState: "live_confident",
      operatorDisposition: "protected_watchlist",
      reasons: [input.summary],
    });
  }

  if (degradedMode?.active) {
    if (input.primaryAction === "promote_to_scaling") {
      return buildDecisionTrust({
        surfaceLane: "watchlist",
        truthState: "degraded_missing_truth",
        operatorDisposition: "degraded_no_scale",
        reasons: [...degradedMode.reasons, input.summary],
      });
    }
    if (input.primaryAction === "keep_in_test") {
      return buildDecisionTrust({
        surfaceLane: lowMateriality ? "watchlist" : "action_core",
        truthState: "degraded_missing_truth",
        operatorDisposition: lowMateriality ? "monitor_low_truth" : "review_hold",
        reasons: [...degradedMode.reasons, input.summary],
      });
    }
  }

  if (input.primaryAction === "keep_in_test" && lowMateriality) {
    return buildDecisionTrust({
      surfaceLane: "watchlist",
      truthState: "live_confident",
      operatorDisposition: "monitor_low_truth",
      reasons: [input.summary],
    });
  }

  return buildDecisionTrust({
    surfaceLane: "action_core",
    truthState: "live_confident",
    operatorDisposition: "standard",
    reasons: [input.summary],
  });
}

function buildDeployment(
  row: CreativeDecisionOsInputRow,
  input: {
    campaignsById: Map<string, MetaCampaignRow>;
    adSets: MetaAdSetRow[];
    locationRows: MetaBreakdownRow[];
    operatingMode: AccountOperatingModePayload | null | undefined;
    primaryAction: CreativeDecisionPrimaryAction;
    lifecycleState: CreativeDecisionLifecycleState;
    metaFamily: MetaCampaignFamily;
    confidence: number;
  },
): CreativeDecisionDeploymentRecommendation {
  const currentCampaign = row.campaignId ? input.campaignsById.get(row.campaignId) : null;
  const preferredCampaigns = (currentCampaign
    ? [currentCampaign]
    : Array.from(input.campaignsById.values()).filter(
        (campaign) => resolveMetaCampaignFamily(campaign) === input.metaFamily,
      ))
    .filter((campaign) => campaign.status === "ACTIVE");

  const targetLane: MetaCampaignLaneLabel | null =
    input.primaryAction === "promote_to_scaling" || input.primaryAction === "hold_no_touch"
      ? "Scaling"
      : input.primaryAction === "keep_in_test"
        ? input.lifecycleState === "validating"
          ? "Validation"
          : "Test"
        : input.primaryAction === "retest_comeback"
          ? "Test"
          : null;

  const targetAdSetRole: CreativeDecisionAdSetRole =
    input.primaryAction === "promote_to_scaling"
      ? "scaling_hero"
      : input.primaryAction === "hold_no_touch"
        ? "hold_position"
        : input.primaryAction === "keep_in_test"
          ? input.lifecycleState === "validating"
            ? "validation_challenger"
            : "test_probe"
          : input.primaryAction === "retest_comeback"
            ? "test_probe"
            : input.primaryAction === "refresh_replace"
              ? "refresh_replacement"
              : "blocked";

  const compatibleAdSets = input.adSets.filter((adSet) => {
    if (row.campaignId && adSet.campaignId === row.campaignId) return true;
    if (preferredCampaigns.some((campaign) => campaign.id === adSet.campaignId)) return true;
    return false;
  });

  const constraints = [...(input.operatingMode?.guardrails ?? [])];
  if (input.operatingMode?.recommendedMode === "Margin Protect") {
    constraints.push("Require stronger efficiency proof before widening delivery.");
  }
  if (input.primaryAction === "refresh_replace") {
    constraints.push("Do not redeploy the same fatigued asset without a refreshed concept.");
  }
  if (input.primaryAction === "block_deploy") {
    constraints.push("Deployment blocked until performance or commercial truth improves.");
  }

  const geoContext = resolveGeoContext(input.operatingMode?.recommendedMode ?? null, input.primaryAction);
  const topGeo = input.locationRows
    .filter((row) => safeNumber(row.spend) > 0)
    .sort((left, right) => safeNumber(right.spend) - safeNumber(left.spend))[0];
  const whatWouldChangeThisDecision = [
    ...(input.operatingMode?.changeTriggers ?? []),
    input.confidence < 0.62 ? "Higher signal depth would improve target precision." : "Keep monitoring efficiency drift after deployment.",
    topGeo ? `A major change in ${topGeo.label ?? topGeo.key} performance would re-rank the deployment lane.` : "Authoritative GEO context would sharpen deployment targeting.",
  ];

  return {
    metaFamily: input.metaFamily,
    metaFamilyLabel: metaCampaignFamilyLabel(input.metaFamily),
    targetLane,
    targetAdSetRole,
    preferredCampaignIds: input.confidence >= 0.56 ? preferredCampaigns.slice(0, 2).map((campaign) => campaign.id) : [],
    preferredCampaignNames: input.confidence >= 0.56 ? preferredCampaigns.slice(0, 2).map((campaign) => campaign.name) : [],
    preferredAdSetIds: input.confidence >= 0.64 ? compatibleAdSets.slice(0, 3).map((adSet) => adSet.id) : [],
    preferredAdSetNames: input.confidence >= 0.64 ? compatibleAdSets.slice(0, 3).map((adSet) => adSet.name) : [],
    geoContext,
    constraints: constraints.slice(0, 4),
    whatWouldChangeThisDecision: whatWouldChangeThisDecision.slice(0, 4),
  };
}

function buildPattern(row: CreativeDecisionOsInputRow): CreativeDecisionPatternReference {
  return {
    hook: row.aiTags?.hookTactic?.[0] ?? row.headlineVariants?.[0] ?? row.taxonomyPrimaryLabel ?? "unlabeled_hook",
    angle: row.aiTags?.messagingAngle?.[0] ?? row.taxonomySecondaryLabel ?? "unlabeled_angle",
    format: row.creativeFormat ?? "image",
  };
}

function buildScore(
  row: CreativeDecisionOsInputRow,
  benchmark: CreativeDecisionBenchmark,
  fatigue: CreativeDecisionFatigue,
  lifecycleState: CreativeDecisionLifecycleState,
) {
  let score = 55;
  const roasStatus = benchmark.metrics.roas.status;
  const cpaStatus = benchmark.metrics.cpa.status;
  const ctrStatus = benchmark.metrics.ctr.status;
  const ctpStatus = benchmark.metrics.clickToPurchase.status;
  if (roasStatus === "better") score += 14;
  if (cpaStatus === "better") score += 9;
  if (ctrStatus === "better") score += 6;
  if (ctpStatus === "better") score += 8;
  if (row.purchases >= 4) score += 5;
  if (row.spend >= 200) score += 4;
  if (fatigue.status === "fatigued") score -= 20;
  if (fatigue.status === "watch") score -= 9;
  if (lifecycleState === "blocked") score -= 28;
  if (lifecycleState === "retired") score -= 18;
  if (lifecycleState === "comeback_candidate") score -= 8;
  return clamp(Math.round(score), 0, 100);
}

function buildConfidence(
  row: CreativeDecisionOsInputRow,
  benchmark: CreativeDecisionBenchmark,
  fatigue: CreativeDecisionFatigue,
  operatingMode: AccountOperatingModePayload | null | undefined,
) {
  let confidence = 0.42;
  if (row.purchases >= 3) confidence += 0.12;
  if (row.spend >= 150) confidence += 0.1;
  if (benchmark.sampleSize >= 3) confidence += 0.08;
  if (fatigue.status === "fatigued") confidence += 0.06;
  if (benchmark.missingContext.length > 2) confidence -= 0.08;
  if (operatingMode?.missingInputs.length) confidence -= 0.06;
  return clamp(round(confidence, 2), 0.3, 0.92);
}

function buildSignals(params: {
  lifecycleState: CreativeDecisionLifecycleState;
  primaryAction: CreativeDecisionPrimaryAction;
  benchmark: CreativeDecisionBenchmark;
  fatigue: CreativeDecisionFatigue;
  deployment: CreativeDecisionDeploymentRecommendation;
}) {
  const signals = [
    `Lifecycle: ${params.lifecycleState.replaceAll("_", " ")}`,
    `Primary decision: ${params.primaryAction.replaceAll("_", " ")}`,
    `Benchmark cohort: ${params.benchmark.selectedCohortLabel}`,
    `Deployment lane: ${params.deployment.targetLane ?? "none"}`,
  ];
  if (params.fatigue.status !== "none") {
    signals.push(`Fatigue: ${params.fatigue.status}`);
  }
  return signals;
}

function buildSummary(
  primaryAction: CreativeDecisionPrimaryAction,
  lifecycleState: CreativeDecisionLifecycleState,
  benchmark: CreativeDecisionBenchmark,
  fatigue: CreativeDecisionFatigue,
) {
  if (primaryAction === "promote_to_scaling") {
    return "Deterministic engine marks this creative as scale-ready for a Meta scaling lane.";
  }
  if (primaryAction === "hold_no_touch") {
    return "Deterministic engine marks this as a shipped winner that should stay protected.";
  }
  if (primaryAction === "refresh_replace") {
    return "Deterministic engine treats this as fatigue-driven decay that needs replacement, not more budget.";
  }
  if (primaryAction === "block_deploy") {
    return lifecycleState === "retired"
      ? "Deterministic engine keeps this inactive until it earns a comeback case."
      : "Deterministic engine blocks deployment because downside risk outweighs current upside.";
  }
  if (primaryAction === "retest_comeback") {
    return "Deterministic engine sees prior winner memory and recommends a bounded comeback retest.";
  }
  if (fatigue.status === "watch") {
    return "Deterministic engine keeps this in test while monitoring early fatigue pressure.";
  }
  return `Deterministic engine keeps this in test against the ${benchmark.selectedCohortLabel.toLowerCase()} benchmark.`;
}

function buildReasons(
  benchmark: CreativeDecisionBenchmark,
  fatigue: CreativeDecisionFatigue,
  deployment: CreativeDecisionDeploymentRecommendation,
) {
  const reasons = [
    `ROAS benchmark status is ${benchmark.metrics.roas.status}.`,
    `Click-to-purchase benchmark status is ${benchmark.metrics.clickToPurchase.status}.`,
    `Selected cohort is ${benchmark.selectedCohortLabel}.`,
  ];
  if (fatigue.evidence[0]) reasons.push(fatigue.evidence[0]);
  if (deployment.constraints[0]) reasons.push(deployment.constraints[0]);
  return reasons.slice(0, 4);
}

function buildLifecycleBoard(creatives: CreativeDecisionOsCreative[]) {
  const orderedStates: CreativeDecisionLifecycleState[] = [
    "incubating",
    "validating",
    "scale_ready",
    "stable_winner",
    "fatigued_winner",
    "blocked",
    "retired",
    "comeback_candidate",
  ];
  return orderedStates.map((state) => ({
    state,
    label: state.replaceAll("_", " "),
    count: creatives.filter((creative) => creative.lifecycleState === state).length,
    creativeIds: creatives
      .filter((creative) => creative.lifecycleState === state)
      .map((creative) => creative.creativeId),
  }));
}

function buildOperatorQueues(creatives: CreativeDecisionOsCreative[]) {
  const actionCoreCreatives = creatives.filter(
    (creative) => creative.trust.surfaceLane === "action_core",
  );
  const definitions = [
    {
      key: "promotion" as const,
      label: "Promotion queue",
      summary: "Scale-ready creatives that can move into scaling lanes.",
      match: (creative: CreativeDecisionOsCreative) => creative.primaryAction === "promote_to_scaling",
    },
    {
      key: "keep_testing" as const,
      label: "Keep testing",
      summary: "Incubating and validating creatives that still need bounded test volume.",
      match: (creative: CreativeDecisionOsCreative) => creative.primaryAction === "keep_in_test",
    },
    {
      key: "fatigued_blocked" as const,
      label: "Fatigued / blocked",
      summary: "Creatives that should be refreshed or held back from deployment.",
      match: (creative: CreativeDecisionOsCreative) =>
        creative.primaryAction === "refresh_replace" || creative.primaryAction === "block_deploy",
    },
    {
      key: "comeback" as const,
      label: "Comeback",
      summary: "Former winners worth a tightly-bounded retest.",
      match: (creative: CreativeDecisionOsCreative) => creative.primaryAction === "retest_comeback",
    },
  ];

  return definitions.map((definition) => {
    const matched = actionCoreCreatives.filter(definition.match);
    return {
      key: definition.key,
      label: definition.label,
      summary: definition.summary,
      count: matched.length,
      creativeIds: matched.map((creative) => creative.creativeId),
    } satisfies CreativeDecisionOperatorQueue;
  });
}

export function buildCreativeDecisionOs(
  input: BuildCreativeDecisionOsInput,
): CreativeDecisionOsV1Response {
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
  const rows = input.rows
    .map((row) => ({
      ...row,
      creativeFormat: row.creativeFormat ?? "image",
      aiTags: row.aiTags ?? {},
      copyVariants: row.copyVariants ?? [],
      headlineVariants: row.headlineVariants ?? [],
      descriptionVariants: row.descriptionVariants ?? [],
      historicalWindows: row.historicalWindows ?? null,
    }))
    .filter((row) => row.creativeId);

  if (rows.length === 0) {
    return {
      contractVersion: CREATIVE_DECISION_OS_CONTRACT_VERSION,
      engineVersion: CREATIVE_DECISION_OS_ENGINE_VERSION,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      analyticsWindow: decisionMetadata.analyticsWindow,
      decisionWindows: decisionMetadata.decisionWindows,
      historicalMemory: decisionMetadata.historicalMemory,
      decisionAsOf: decisionMetadata.decisionAsOf,
      summary: {
        totalCreatives: 0,
        scaleReadyCount: 0,
        keepTestingCount: 0,
        fatiguedCount: 0,
        blockedCount: 0,
        comebackCount: 0,
        message: "No creative rows were available for the live decision window.",
        operatingMode: input.operatingMode?.recommendedMode ?? null,
        surfaceSummary: {
          actionCoreCount: 0,
          watchlistCount: 0,
          archiveCount: 0,
          degradedCount: 0,
        },
      },
      creatives: [],
      families: [],
      patterns: [],
      lifecycleBoard: buildLifecycleBoard([]),
      operatorQueues: buildOperatorQueues([]),
      commercialTruthCoverage: buildCommercialTruthCoverage(
        input.commercialTruth,
        input.operatingMode,
      ),
    };
  }

  const campaignsById = new Map((input.campaigns ?? []).map((campaign) => [campaign.id, campaign]));
  const locationRows = input.breakdowns?.location ?? [];
  const familySeeds = buildFamilySeeds(rows);
  const metricContext = buildMetricContext(rows);
  const familyRowsById = new Map<string, CreativeDecisionOsInputRow[]>();

  for (const row of rows) {
    const seed = familySeeds.get(row.creativeId)!;
    familyRowsById.set(seed.familyId, [...(familyRowsById.get(seed.familyId) ?? []), row]);
  }

  const creatives: CreativeDecisionOsCreative[] = rows.map((row) => {
    const familySeed = familySeeds.get(row.creativeId)!;
    const familyRows = familyRowsById.get(familySeed.familyId) ?? [row];
    const metaFamily = metaFamilyFromRow(row, campaignsById);
    const benchmark = selectBenchmark(row, familyRows, rows, metaFamily);
    const fatigue = buildFatigue(row, familyRows, benchmark);
    const historical = buildHistoricalSummary(row);
    const lifecycleState = classifyLifecycle({
      row,
      benchmark,
      fatigue,
      historical,
      operatingMode: input.operatingMode,
    });
    const primaryAction = decidePrimaryAction(lifecycleState, input.operatingMode);
    const score = buildScore(row, benchmark, fatigue, lifecycleState);
    const confidence = buildConfidence(row, benchmark, fatigue, input.operatingMode);
    const legacyAction = legacyActionFromPrimary({
      primaryAction,
      lifecycleState,
      score,
      confidence,
    });
    const legacyLifecycleState = legacyLifecycleFromState(lifecycleState, legacyAction);
    const deployment = buildDeployment(row, {
      campaignsById,
      adSets: input.adSets ?? [],
      locationRows,
      operatingMode: input.operatingMode,
      primaryAction,
      lifecycleState,
      metaFamily,
      confidence,
    });
    const pattern = buildPattern(row);
    const summary = buildSummary(primaryAction, lifecycleState, benchmark, fatigue);
    const reasons = buildReasons(benchmark, fatigue, deployment);
    const familyLabel = chooseFamilyLabel(familyRows);
    const trust = buildCreativeTrust({
      row,
      lifecycleState,
      primaryAction,
      operatingMode: input.operatingMode,
      historical,
      summary,
    });
    const report: CreativeRuleReportPayload = {
      creativeId: row.creativeId,
      creativeName: row.name,
      action: legacyAction,
      lifecycleState: legacyLifecycleState,
      score,
      confidence,
      summary,
      coreVerdict: reasons[0],
      accountContext: {
        roasAvg: round(metricContext.roasAvg, 4),
        cpaAvg: round(metricContext.cpaAvg, 4),
        ctrAvg: round(metricContext.ctrAvg, 4),
        spendMedian: round(metricContext.spendMedian, 4),
        spendP20: round(metricContext.spendP20, 4),
        spendP80: round(metricContext.spendP80, 4),
      },
      timeframeContext: {
        coreVerdict: `Live decision window is ${row.roas.toFixed(2)}x ROAS on ${row.purchases} purchases against the ${benchmark.selectedCohortLabel.toLowerCase()} benchmark.`,
        selectedRangeOverlay: `Live decision window says ROAS is ${benchmark.metrics.roas.status} and click-to-purchase is ${benchmark.metrics.clickToPurchase.status}.`,
        historicalSupport:
          historical.total > 0
            ? `${historical.strongCount}/${historical.total} historical windows look like winner memory.`
            : "Historical support is limited for this creative.",
        note:
          fatigue.status === "fatigued"
            ? "Fatigue engine sees meaningful decay versus prior winner windows."
            : benchmark.missingContext[0] ?? null,
      },
      factors: [
        {
          label: "ROAS benchmark",
          impact:
            benchmark.metrics.roas.status === "better"
              ? "positive"
              : benchmark.metrics.roas.status === "worse"
                ? "negative"
                : "neutral",
          value: `${row.roas.toFixed(2)}x vs ${benchmark.metrics.roas.benchmark?.toFixed(2) ?? "n/a"}x`,
          reason: reasons[0] ?? "ROAS benchmark comparison is mixed.",
        },
        {
          label: "CPA benchmark",
          impact:
            benchmark.metrics.cpa.status === "better"
              ? "positive"
              : benchmark.metrics.cpa.status === "worse"
                ? "negative"
                : "neutral",
          value: `${row.cpa.toFixed(2)} vs ${benchmark.metrics.cpa.benchmark?.toFixed(2) ?? "n/a"}`,
          reason: `CPA benchmark status is ${benchmark.metrics.cpa.status}.`,
        },
        {
          label: "Fatigue",
          impact:
            fatigue.status === "fatigued"
              ? "negative"
              : fatigue.status === "watch"
                ? "neutral"
                : "positive",
          value: fatigue.status,
          reason: fatigue.evidence[0] ?? "No fatigue evidence was detected.",
        },
        {
          label: "Deployment lane",
          impact: deployment.targetLane === "Scaling" ? "positive" : deployment.targetLane ? "neutral" : "negative",
          value: `${deployment.targetLane ?? "none"} / ${deployment.targetAdSetRole ?? "none"}`,
          reason: deployment.constraints[0] ?? "Deployment lane is based on deterministic Meta alignment.",
        },
      ],
      family: {
        familyId: familySeed.familyId,
        familyLabel,
        familySource: familySeed.familySource,
        memberCount: familyRows.length,
      },
      benchmark,
      fatigue,
      deployment,
      deterministicDecision: {
        lifecycleState,
        primaryAction,
        legacyAction,
      },
      commercialContext: {
        operatingMode: input.operatingMode?.recommendedMode ?? null,
        confidence: input.operatingMode?.confidence ?? 0.3,
        missingInputs: input.operatingMode?.missingInputs ?? [],
      },
      pattern,
    };

    return {
      creativeId: row.creativeId,
      familyId: familySeed.familyId,
      familyLabel,
      familySource: familySeed.familySource,
      name: row.name,
      creativeFormat: row.creativeFormat,
      creativeAgeDays: row.creativeAgeDays,
      spend: row.spend,
      purchaseValue: row.purchaseValue,
      roas: row.roas,
      cpa: row.cpa,
      ctr: row.ctr,
      purchases: row.purchases,
      impressions: row.impressions,
      linkClicks: row.linkClicks,
      score,
      confidence,
      lifecycleState,
      primaryAction,
      legacyAction,
      legacyLifecycleState,
      decisionSignals: buildSignals({
        lifecycleState,
        primaryAction,
        benchmark,
        fatigue,
        deployment,
      }),
      summary,
      benchmark,
      fatigue,
      deployment,
      pattern,
      report,
      trust,
    };
  });

  const families = Array.from(familyRowsById.entries()).map(([familyId, familyRows]) => {
    const creativeEntries = creatives.filter((creative) => creative.familyId === familyId);
    const dominantFormat = creativeEntries[0]?.creativeFormat ?? "image";
    const highestPriority = [...creativeEntries].sort((left, right) => right.score - left.score)[0];
    const topAngles = Array.from(new Set(creativeEntries.map((creative) => creative.pattern.angle))).slice(0, 3);
    const topHooks = Array.from(new Set(creativeEntries.map((creative) => creative.pattern.hook))).slice(0, 3);
    return {
      familyId,
      familyLabel: chooseFamilyLabel(familyRows),
      familySource: familySeeds.get(familyRows[0]!.creativeId)?.familySource ?? "singleton",
      creativeIds: creativeEntries.map((creative) => creative.creativeId),
      dominantFormat,
      lifecycleState: highestPriority?.lifecycleState ?? "validating",
      primaryAction: highestPriority?.primaryAction ?? "keep_in_test",
      totalSpend: round(sumBy(familyRows, (row) => row.spend), 2),
      totalPurchaseValue: round(sumBy(familyRows, (row) => row.purchaseValue), 2),
      totalPurchases: sumBy(familyRows, (row) => row.purchases),
      topAngles,
      topHooks,
      metaFamily: highestPriority?.deployment.metaFamily ?? "purchase_value",
      metaFamilyLabel: highestPriority?.deployment.metaFamilyLabel ?? metaCampaignFamilyLabel("purchase_value"),
    } satisfies CreativeDecisionOsFamily;
  });

  const patternMap = new Map<string, CreativeDecisionOsPattern>();
  for (const creative of creatives) {
    const key = `${creative.pattern.hook}__${creative.pattern.angle}__${creative.pattern.format}`;
    const existing = patternMap.get(key);
    if (existing) {
      existing.creativeIds.push(creative.creativeId);
      existing.spend = round(existing.spend + creative.spend, 2);
      existing.purchaseValue = round(existing.purchaseValue + creative.purchaseValue, 2);
      existing.roas = existing.spend > 0 ? round(existing.purchaseValue / existing.spend, 2) : 0;
      existing.confidence = round((existing.confidence + creative.confidence) / 2, 2);
      if (creative.score > existing.confidence * 100) {
        existing.lifecycleState = creative.lifecycleState;
      }
      continue;
    }
    patternMap.set(key, {
      patternKey: key,
      hook: creative.pattern.hook,
      angle: creative.pattern.angle,
      format: creative.pattern.format,
      creativeIds: [creative.creativeId],
      spend: round(creative.spend, 2),
      purchaseValue: round(creative.purchaseValue, 2),
      roas: creative.spend > 0 ? round(creative.purchaseValue / creative.spend, 2) : 0,
      lifecycleState: creative.lifecycleState,
      confidence: creative.confidence,
    });
  }

  const patterns = Array.from(patternMap.values())
    .sort((left, right) => right.spend - left.spend)
    .slice(0, 8);
  const lifecycleBoard = buildLifecycleBoard(creatives);
  const operatorQueues = buildOperatorQueues(creatives);
  const commercialTruthCoverage = buildCommercialTruthCoverage(
    input.commercialTruth,
    input.operatingMode,
  );
  const surfaceSummary = {
    actionCoreCount: creatives.filter(
      (creative) => creative.trust.surfaceLane === "action_core",
    ).length,
    watchlistCount: creatives.filter(
      (creative) => creative.trust.surfaceLane === "watchlist",
    ).length,
    archiveCount: creatives.filter(
      (creative) => creative.trust.surfaceLane === "archive_context",
    ).length,
    degradedCount: creatives.filter(
      (creative) => creative.trust.truthState === "degraded_missing_truth",
    ).length,
  };

  return {
    contractVersion: CREATIVE_DECISION_OS_CONTRACT_VERSION,
    engineVersion: CREATIVE_DECISION_OS_ENGINE_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    analyticsWindow: decisionMetadata.analyticsWindow,
    decisionWindows: decisionMetadata.decisionWindows,
    historicalMemory: decisionMetadata.historicalMemory,
    decisionAsOf: decisionMetadata.decisionAsOf,
    summary: {
      totalCreatives: creatives.length,
      scaleReadyCount: creatives.filter(
        (creative) =>
          creative.lifecycleState === "scale_ready" || creative.lifecycleState === "stable_winner",
      ).length,
      keepTestingCount: creatives.filter((creative) => creative.primaryAction === "keep_in_test").length,
      fatiguedCount: creatives.filter((creative) => creative.lifecycleState === "fatigued_winner").length,
      blockedCount: creatives.filter(
        (creative) =>
          creative.lifecycleState === "blocked" || creative.lifecycleState === "retired",
      ).length,
      comebackCount: creatives.filter((creative) => creative.lifecycleState === "comeback_candidate").length,
      message:
        input.operatingMode?.recommendedMode === "Recovery"
          ? "Commercial truth is in a recovery posture, so Decision OS biases toward safer hold and block outcomes."
          : "Decision OS highlights which creatives to scale, keep in test, refresh, block, or retest.",
      operatingMode: input.operatingMode?.recommendedMode ?? null,
      surfaceSummary,
    },
    creatives,
    families: families.sort((left, right) => right.totalSpend - left.totalSpend),
    patterns,
    lifecycleBoard,
    operatorQueues,
    commercialTruthCoverage,
  };
}

export function mapCreativeDecisionOsToLegacyDecisions(
  payload: Pick<CreativeDecisionOsV1Response, "creatives">,
) {
  return payload.creatives.map((creative) => ({
    creativeId: creative.creativeId,
    action: creative.legacyAction,
    lifecycleState: creative.legacyLifecycleState,
    score: creative.score,
    confidence: creative.confidence,
    scoringFactors: creative.report.factors.map((factor) => `${factor.label}: ${factor.value}`),
    reasons: creative.report.factors.map((factor) => `${factor.label}: ${factor.reason}`).slice(0, 4),
    nextStep: creative.summary,
  }));
}
