import { GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS } from "@/lib/google-ads/advisor-readiness";
import { GLOBAL_OPERATOR_REVIEW_WORKFLOW } from "@/lib/global-operator-review";
import type { GlobalRebuildState, GlobalRebuildTruthReview } from "@/lib/rebuild-truth-review";

export const SYNC_EFFECTIVENESS_REVIEW_COMMAND = "npm run ops:sync-effectiveness-review";

export type SyncEffectivenessSummaryState =
  | "improving"
  | "stable_but_incomplete"
  | "stalled_by_quota"
  | "blocked_repair_needed"
  | "sparse_due_to_rebuild"
  | "ready_with_current_support";

export type SyncEffectivenessFreshnessSource =
  | "google_hot_window_support"
  | "google_core_daily"
  | "meta_protected_published_truth"
  | "meta_core_daily"
  | "none_visible";

export interface SyncEffectivenessWorkflow {
  adminSurface: string;
  reviewCommand: string;
  readyMeans: "evidence_only";
}

export interface ProviderSyncEffectivenessFreshness {
  source: SyncEffectivenessFreshnessSource;
  mostRecentTrustedDay: string | null;
  lagDays: number | null;
  warehouseReadyThroughDay: string | null;
  warehouseLagDays: number | null;
  progressMovedRecently: boolean;
  latestProgressAt: string | null;
}

export interface ProviderSyncEffectivenessCoverage {
  rebuildState: GlobalRebuildState;
  coldBootstrap: boolean;
  backfillInProgress: boolean;
  partialUpstreamCoverage: boolean;
  warehouseImproving: boolean;
  totalBusinesses: number;
  progressingBusinesses: number;
  stalledBusinesses: number;
  readyBusinesses: number;
}

export interface ProviderSyncEffectivenessQuota {
  quotaLimitedBusinesses: number;
  quotaPressurePresent: boolean;
  suggestsQuotaStall: boolean;
}

export interface GoogleSyncTruthHealthReview {
  kind: "google_ads";
  hotWindowSupportBusinesses: number;
  currentHotWindowSupportBusinesses: number;
  requiredWindowDays: number;
  supportReadyThroughDay: string | null;
  supportLagDays: number | null;
  summary: string;
}

export interface MetaSyncTruthHealthReview {
  kind: "meta";
  protectedPublishedTruthState: GlobalRebuildTruthReview["meta"]["protectedPublishedTruth"]["state"];
  protectedPublishedRows: number;
  activePublicationPointerRows: number;
  latestProtectedPublishedDay: string | null;
  lagDays: number | null;
  summary: string;
}

export interface ProviderSyncEffectivenessReview {
  provider: "google_ads" | "meta";
  summaryState: SyncEffectivenessSummaryState;
  summary: string;
  freshness: ProviderSyncEffectivenessFreshness;
  coverage: ProviderSyncEffectivenessCoverage;
  quota: ProviderSyncEffectivenessQuota;
  truthHealth: GoogleSyncTruthHealthReview | MetaSyncTruthHealthReview;
  topSignals: string[];
}

export interface GoogleProviderSyncEffectivenessReview
  extends Omit<ProviderSyncEffectivenessReview, "provider" | "truthHealth"> {
  provider: "google_ads";
  truthHealth: GoogleSyncTruthHealthReview;
}

export interface MetaProviderSyncEffectivenessReview
  extends Omit<ProviderSyncEffectivenessReview, "provider" | "truthHealth"> {
  provider: "meta";
  truthHealth: MetaSyncTruthHealthReview;
}

export interface SyncEffectivenessReview {
  capturedAt: string;
  workflow: SyncEffectivenessWorkflow;
  googleAds: GoogleProviderSyncEffectivenessReview;
  meta: MetaProviderSyncEffectivenessReview;
}

export interface GoogleSyncEffectivenessBusinessInput {
  businessId: string;
  progressState?: "ready" | "syncing" | "partial_progressing" | "partial_stuck" | "blocked";
  quotaLimitedEvidence?: boolean;
  lastProgressHeartbeatAt?: string | null;
  latestCheckpointUpdatedAt?: string | null;
  latestPartitionActivityAt?: string | null;
  campaignReadyThroughDate?: string | null;
  searchTermReadyThroughDate?: string | null;
  productReadyThroughDate?: string | null;
  assetReadyThroughDate?: string | null;
  searchTermCompletedDays?: number;
  productCompletedDays?: number;
  assetCompletedDays?: number;
}

export interface MetaSyncEffectivenessBusinessInput {
  businessId: string;
  progressState?: "ready" | "syncing" | "partial_progressing" | "partial_stuck" | "blocked";
  quotaLimitedEvidence?: boolean;
  lastProgressHeartbeatAt?: string | null;
  latestCheckpointUpdatedAt?: string | null;
  latestPartitionActivityAt?: string | null;
  lastSuccessfulPublishAt?: string | null;
  accountReadyThroughDate?: string | null;
  adsetReadyThroughDate?: string | null;
  creativeReadyThroughDate?: string | null;
  adReadyThroughDate?: string | null;
}

function normalizeIsoDay(value: string | null | undefined) {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function minIsoDay(values: Array<string | null | undefined>) {
  const normalized = values
    .map((value) => normalizeIsoDay(value))
    .filter((value): value is string => Boolean(value));
  if (normalized.length === 0) return null;
  return [...normalized].sort((left, right) => left.localeCompare(right))[0] ?? null;
}

function minIsoDayIfComplete(values: Array<string | null | undefined>, total: number) {
  const normalized = values
    .map((value) => normalizeIsoDay(value))
    .filter((value): value is string => Boolean(value));
  if (total <= 0 || normalized.length !== total) return null;
  return [...normalized].sort((left, right) => left.localeCompare(right))[0] ?? null;
}

function maxIsoTimestamp(values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function dayDiff(asOfDay: string, day: string | null) {
  const normalizedDay = normalizeIsoDay(day);
  if (!normalizedDay) return null;
  const asOfMs = Date.parse(`${asOfDay}T00:00:00.000Z`);
  const dayMs = Date.parse(`${normalizedDay}T00:00:00.000Z`);
  if (!Number.isFinite(asOfMs) || !Number.isFinite(dayMs)) return null;
  return Math.max(0, Math.round((asOfMs - dayMs) / 86_400_000));
}

function isRecentTimestamp(value: string | null | undefined, windowMinutes: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= Math.max(1, windowMinutes) * 60_000;
}

function summarizeSummaryState(state: SyncEffectivenessSummaryState) {
  switch (state) {
    case "improving":
      return "Improving";
    case "stable_but_incomplete":
      return "Stable but incomplete";
    case "stalled_by_quota":
      return "Stalled by quota";
    case "blocked_repair_needed":
      return "Blocked / repair needed";
    case "sparse_due_to_rebuild":
      return "Sparse due to rebuild";
    case "ready_with_current_support":
      return "Ready with current support";
    default:
      return state;
  }
}

function countBusinessesWithProgress(
  rows: Array<{
    progressState?: "ready" | "syncing" | "partial_progressing" | "partial_stuck" | "blocked";
  }>,
  states: Array<"syncing" | "partial_progressing">,
) {
  return rows.filter((row) => states.some((state) => row.progressState === state)).length;
}

function countStalledBusinesses(
  rows: Array<{
    progressState?: "ready" | "syncing" | "partial_progressing" | "partial_stuck" | "blocked";
  }>,
) {
  return rows.filter(
    (row) => row.progressState === "partial_stuck" || row.progressState === "blocked",
  ).length;
}

function deriveGoogleSupportReadyThroughDate(row: GoogleSyncEffectivenessBusinessInput) {
  return minIsoDay([
    row.searchTermReadyThroughDate ?? null,
    row.productReadyThroughDate ?? null,
    row.assetReadyThroughDate ?? null,
  ]);
}

function hasCurrentGoogleHotWindowSupport(
  row: GoogleSyncEffectivenessBusinessInput,
  asOfDay: string,
) {
  const supportReadyThroughDay = deriveGoogleSupportReadyThroughDate(row);
  const supportDays = Math.min(
    Number(row.searchTermCompletedDays ?? 0),
    Number(row.productCompletedDays ?? 0),
    Number(row.assetCompletedDays ?? 0),
  );
  const supportLagDays = dayDiff(asOfDay, supportReadyThroughDay);

  return (
    supportDays >= GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS &&
    supportReadyThroughDay != null &&
    supportLagDays != null &&
    supportLagDays <= 2
  );
}

function deriveMetaProtectedPublishedDay(
  review: GlobalRebuildTruthReview["meta"]["protectedPublishedTruth"],
) {
  return minIsoDay(review.classes.map((entry) => entry.latestProtectedValue ?? null));
}

function buildGoogleSummaryState(input: {
  rebuildState: GlobalRebuildState;
  progressMovedRecently: boolean;
  hotWindowCurrentBusinesses: number;
  totalBusinesses: number;
}) {
  switch (input.rebuildState) {
    case "blocked":
    case "repair_required":
      return "blocked_repair_needed" as const;
    case "quota_limited":
      return input.progressMovedRecently ? "stable_but_incomplete" : "stalled_by_quota";
    case "cold_bootstrap":
      return "sparse_due_to_rebuild";
    case "ready":
      return input.hotWindowCurrentBusinesses === input.totalBusinesses && input.totalBusinesses > 0
        ? "ready_with_current_support"
        : "stable_but_incomplete";
    case "backfill_in_progress":
    case "partial_upstream_coverage":
    default:
      return input.progressMovedRecently ? "improving" : "stable_but_incomplete";
  }
}

function buildMetaSummaryState(input: {
  rebuildState: GlobalRebuildState;
  progressMovedRecently: boolean;
  protectedPublishedTruthState: GlobalRebuildTruthReview["meta"]["protectedPublishedTruth"]["state"];
}) {
  switch (input.rebuildState) {
    case "blocked":
    case "repair_required":
      return "blocked_repair_needed" as const;
    case "quota_limited":
      return input.progressMovedRecently ? "stable_but_incomplete" : "stalled_by_quota";
    case "cold_bootstrap":
      return "sparse_due_to_rebuild";
    case "ready":
      return input.protectedPublishedTruthState === "present"
        ? "ready_with_current_support"
        : "stable_but_incomplete";
    case "backfill_in_progress":
    case "partial_upstream_coverage":
    default:
      return input.progressMovedRecently ? "improving" : "stable_but_incomplete";
  }
}

function buildGoogleSummary(input: {
  summaryState: SyncEffectivenessSummaryState;
  rebuildState: GlobalRebuildState;
  progressMovedRecently: boolean;
  hotWindowCurrentBusinesses: number;
  totalBusinesses: number;
  quotaLimitedBusinesses: number;
}) {
  switch (input.summaryState) {
    case "blocked_repair_needed":
      return "Google still has blocked rebuild evidence. Do not treat current rows as healthy sync progress.";
    case "stalled_by_quota":
      return "Google is quota-constrained and recent evidence does not show clean catch-up yet.";
    case "sparse_due_to_rebuild":
      return "Google is still in cold bootstrap on the rebuilt warehouse. Sparse rows are not yet trustworthy progress.";
    case "ready_with_current_support":
      return "Google rebuilt coverage and current hot-window support are visible under the locked contract. Ready means evidence only.";
    case "improving":
      return "Google rebuild is still incomplete, but recent checkpoint activity and current support coverage show active catch-up.";
    case "stable_but_incomplete":
    default:
      return input.rebuildState === "quota_limited" && input.quotaLimitedBusinesses > 0
        ? "Google remains incomplete under visible quota pressure, but some recent activity is still present."
        : input.hotWindowCurrentBusinesses === 0 && input.totalBusinesses > 0
          ? "Google core coverage exists, but current hot-window support is not yet visible across rebuilt data."
          : "Google remains incomplete. Current evidence is not strong enough to claim clean catch-up yet.";
  }
}

function buildMetaSummary(input: {
  summaryState: SyncEffectivenessSummaryState;
  protectedPublishedTruthState: GlobalRebuildTruthReview["meta"]["protectedPublishedTruth"]["state"];
  rebuildState: GlobalRebuildState;
  quotaLimitedBusinesses: number;
}) {
  switch (input.summaryState) {
    case "blocked_repair_needed":
      return "Meta still has blocked or repair-required rebuild evidence. Do not treat current rows as healthy historical truth.";
    case "stalled_by_quota":
      return "Meta is quota-constrained and recent evidence does not show clean catch-up yet.";
    case "sparse_due_to_rebuild":
      return "Meta is still in cold bootstrap on the rebuilt warehouse. Sparse rows are not yet trustworthy historical truth.";
    case "ready_with_current_support":
      return "Meta protected published truth is visible and current under the locked contract. Ready means evidence only.";
    case "improving":
      return "Meta rebuild is still incomplete, but recent worker or publication movement shows active catch-up.";
    case "stable_but_incomplete":
    default:
      return input.protectedPublishedTruthState !== "present"
        ? "Meta remains incomplete because protected published truth is not yet visible enough to trust globally."
        : input.rebuildState === "quota_limited" && input.quotaLimitedBusinesses > 0
          ? "Meta remains incomplete under visible quota pressure, but some recent activity is still present."
          : "Meta remains incomplete. Current evidence is not strong enough to claim clean catch-up yet.";
  }
}

export function buildSyncEffectivenessReview(input: {
  globalRebuildReview: GlobalRebuildTruthReview;
  googleBusinesses?: GoogleSyncEffectivenessBusinessInput[];
  metaBusinesses?: MetaSyncEffectivenessBusinessInput[];
  capturedAt?: string;
}): SyncEffectivenessReview {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const asOfDay = capturedAt.slice(0, 10);
  const googleBusinesses = input.googleBusinesses ?? [];
  const metaBusinesses = input.metaBusinesses ?? [];
  const googleTotal = googleBusinesses.length;
  const metaTotal = metaBusinesses.length;

  const googleProgressingBusinesses = countBusinessesWithProgress(googleBusinesses, [
    "syncing",
    "partial_progressing",
  ]);
  const googleStalledBusinesses = countStalledBusinesses(googleBusinesses);
  const googleLatestProgressAt = maxIsoTimestamp(
    googleBusinesses.flatMap((row) => [
      row.lastProgressHeartbeatAt ?? null,
      row.latestCheckpointUpdatedAt ?? null,
      row.latestPartitionActivityAt ?? null,
    ]),
  );
  const googleProgressMovedRecently =
    googleProgressingBusinesses > 0 || isRecentTimestamp(googleLatestProgressAt, 30);
  const googleQuotaLimitedBusinesses = googleBusinesses.filter(
    (row) => row.quotaLimitedEvidence === true,
  ).length;
  const googleWarehouseReadyThroughDay = minIsoDayIfComplete(
    googleBusinesses.map((row) => row.campaignReadyThroughDate ?? null),
    googleTotal,
  );
  const googleSupportReadyThroughDays = googleBusinesses.map((row) =>
    deriveGoogleSupportReadyThroughDate(row),
  );
  const googleCurrentSupportReadyThroughDays = googleBusinesses.map((row) =>
    hasCurrentGoogleHotWindowSupport(row, asOfDay) ? deriveGoogleSupportReadyThroughDate(row) : null,
  );
  const googleHotWindowSupportBusinesses = googleBusinesses.filter((row) =>
    hasCurrentGoogleHotWindowSupport(row, asOfDay),
  ).length;
  const googleSupportReadyThroughDay = minIsoDay(
    googleBusinesses.map((row) => deriveGoogleSupportReadyThroughDate(row)),
  );
  const googleCurrentTrustedDay = minIsoDayIfComplete(googleCurrentSupportReadyThroughDays, googleTotal);
  const googleSummaryState = buildGoogleSummaryState({
    rebuildState: input.globalRebuildReview.googleAds.rebuild.state,
    progressMovedRecently: googleProgressMovedRecently,
    hotWindowCurrentBusinesses: googleHotWindowSupportBusinesses,
    totalBusinesses: googleTotal,
  });
  const googleTruthHealth: GoogleSyncTruthHealthReview = {
    kind: "google_ads",
    hotWindowSupportBusinesses: googleBusinesses.filter((row) => {
      const supportReadyThroughDay = deriveGoogleSupportReadyThroughDate(row);
      const supportDays = Math.min(
        Number(row.searchTermCompletedDays ?? 0),
        Number(row.productCompletedDays ?? 0),
        Number(row.assetCompletedDays ?? 0),
      );
      return supportDays >= GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS && supportReadyThroughDay != null;
    }).length,
    currentHotWindowSupportBusinesses: googleHotWindowSupportBusinesses,
    requiredWindowDays: GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS,
    supportReadyThroughDay: googleSupportReadyThroughDay,
    supportLagDays: dayDiff(asOfDay, googleSupportReadyThroughDay),
    summary:
      googleHotWindowSupportBusinesses === googleTotal && googleTotal > 0
        ? `Google ${GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS}-day hot-window support is current across all tracked businesses.`
        : googleHotWindowSupportBusinesses > 0
          ? `Google ${GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS}-day hot-window support is current in ${googleHotWindowSupportBusinesses}/${googleTotal} businesses.`
          : `Google ${GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS}-day hot-window support is not yet current in rebuilt data.`,
  };
  const googleCoverage: ProviderSyncEffectivenessCoverage = {
    rebuildState: input.globalRebuildReview.googleAds.rebuild.state,
    coldBootstrap: input.globalRebuildReview.googleAds.rebuild.state === "cold_bootstrap",
    backfillInProgress: input.globalRebuildReview.googleAds.rebuild.state === "backfill_in_progress",
    partialUpstreamCoverage:
      input.globalRebuildReview.googleAds.rebuild.state === "partial_upstream_coverage",
    warehouseImproving: googleProgressMovedRecently,
    totalBusinesses: googleTotal,
    progressingBusinesses: googleProgressingBusinesses,
    stalledBusinesses: googleStalledBusinesses,
    readyBusinesses: input.globalRebuildReview.googleAds.rebuild.evidence.readyBusinesses,
  };
  const googleQuota: ProviderSyncEffectivenessQuota = {
    quotaLimitedBusinesses: input.globalRebuildReview.googleAds.rebuild.evidence.quotaLimitedBusinesses,
    quotaPressurePresent: googleQuotaLimitedBusinesses > 0,
    suggestsQuotaStall:
      input.globalRebuildReview.googleAds.rebuild.state === "quota_limited" &&
      !googleProgressMovedRecently,
  };
  const googleFreshness: ProviderSyncEffectivenessFreshness = {
    source:
      googleCurrentTrustedDay != null
        ? "google_hot_window_support"
        : googleWarehouseReadyThroughDay != null
          ? "google_core_daily"
          : "none_visible",
    mostRecentTrustedDay: googleCurrentTrustedDay,
    lagDays: dayDiff(asOfDay, googleCurrentTrustedDay),
    warehouseReadyThroughDay: googleWarehouseReadyThroughDay,
    warehouseLagDays: dayDiff(asOfDay, googleWarehouseReadyThroughDay),
    progressMovedRecently: googleProgressMovedRecently,
    latestProgressAt: googleLatestProgressAt,
  };
  const googleTopSignals = [
    googleFreshness.mostRecentTrustedDay
      ? `Trusted support day ${googleFreshness.mostRecentTrustedDay} (${googleFreshness.lagDays ?? "?"}d lag).`
      : "No globally trusted Google hot-window day is visible yet.",
    googleFreshness.warehouseReadyThroughDay
      ? `Core warehouse through ${googleFreshness.warehouseReadyThroughDay} (${googleFreshness.warehouseLagDays ?? "?"}d lag).`
      : "No global Google core ready-through day is visible yet.",
    `${googleCoverage.progressingBusinesses}/${googleCoverage.totalBusinesses} businesses are progressing; ${googleCoverage.stalledBusinesses} look stalled.`,
    googleQuota.quotaPressurePresent
      ? `Quota pressure is visible in ${googleQuota.quotaLimitedBusinesses}/${googleCoverage.totalBusinesses} businesses.`
      : "No current Google quota pressure is visible in the shared review.",
    googleTruthHealth.summary,
  ];

  const metaProgressingBusinesses = countBusinessesWithProgress(metaBusinesses, [
    "syncing",
    "partial_progressing",
  ]);
  const metaStalledBusinesses = countStalledBusinesses(metaBusinesses);
  const metaLatestProgressAt = maxIsoTimestamp(
    metaBusinesses.flatMap((row) => [
      row.lastProgressHeartbeatAt ?? null,
      row.latestCheckpointUpdatedAt ?? null,
      row.latestPartitionActivityAt ?? null,
      row.lastSuccessfulPublishAt ?? null,
    ]),
  );
  const metaProgressMovedRecently =
    metaProgressingBusinesses > 0 ||
    isRecentTimestamp(metaLatestProgressAt, 30) ||
    metaBusinesses.some((row) => isRecentTimestamp(row.lastSuccessfulPublishAt ?? null, 24 * 60));
  const metaWarehouseReadyThroughDay = minIsoDayIfComplete(
    metaBusinesses.map((row) =>
      minIsoDay([row.accountReadyThroughDate ?? null, row.adsetReadyThroughDate ?? null]),
    ),
    metaTotal,
  );
  const metaProtectedPublishedDay = deriveMetaProtectedPublishedDay(
    input.globalRebuildReview.meta.protectedPublishedTruth,
  );
  const metaSummaryState = buildMetaSummaryState({
    rebuildState: input.globalRebuildReview.meta.rebuild.state,
    progressMovedRecently: metaProgressMovedRecently,
    protectedPublishedTruthState: input.globalRebuildReview.meta.protectedPublishedTruth.state,
  });
  const metaTruthHealth: MetaSyncTruthHealthReview = {
    kind: "meta",
    protectedPublishedTruthState: input.globalRebuildReview.meta.protectedPublishedTruth.state,
    protectedPublishedRows: input.globalRebuildReview.meta.protectedPublishedTruth.protectedPublishedRows,
    activePublicationPointerRows:
      input.globalRebuildReview.meta.protectedPublishedTruth.activePublicationPointerRows,
    latestProtectedPublishedDay: metaProtectedPublishedDay,
    lagDays: dayDiff(asOfDay, metaProtectedPublishedDay),
    summary: input.globalRebuildReview.meta.protectedPublishedTruth.summary,
  };
  const metaCoverage: ProviderSyncEffectivenessCoverage = {
    rebuildState: input.globalRebuildReview.meta.rebuild.state,
    coldBootstrap: input.globalRebuildReview.meta.rebuild.state === "cold_bootstrap",
    backfillInProgress: input.globalRebuildReview.meta.rebuild.state === "backfill_in_progress",
    partialUpstreamCoverage:
      input.globalRebuildReview.meta.rebuild.state === "partial_upstream_coverage",
    warehouseImproving: metaProgressMovedRecently,
    totalBusinesses: metaTotal,
    progressingBusinesses: metaProgressingBusinesses,
    stalledBusinesses: metaStalledBusinesses,
    readyBusinesses: input.globalRebuildReview.meta.rebuild.evidence.readyBusinesses,
  };
  const metaQuotaLimitedBusinesses = metaBusinesses.filter(
    (row) => row.quotaLimitedEvidence === true,
  ).length;
  const metaQuota: ProviderSyncEffectivenessQuota = {
    quotaLimitedBusinesses: input.globalRebuildReview.meta.rebuild.evidence.quotaLimitedBusinesses,
    quotaPressurePresent: metaQuotaLimitedBusinesses > 0,
    suggestsQuotaStall:
      input.globalRebuildReview.meta.rebuild.state === "quota_limited" && !metaProgressMovedRecently,
  };
  const metaFreshness: ProviderSyncEffectivenessFreshness = {
    source:
      metaProtectedPublishedDay != null
        ? "meta_protected_published_truth"
        : metaWarehouseReadyThroughDay != null
          ? "meta_core_daily"
          : "none_visible",
    mostRecentTrustedDay: metaProtectedPublishedDay,
    lagDays: dayDiff(asOfDay, metaProtectedPublishedDay),
    warehouseReadyThroughDay: metaWarehouseReadyThroughDay,
    warehouseLagDays: dayDiff(asOfDay, metaWarehouseReadyThroughDay),
    progressMovedRecently: metaProgressMovedRecently,
    latestProgressAt: metaLatestProgressAt,
  };
  const metaTopSignals = [
    metaFreshness.mostRecentTrustedDay
      ? `Trusted published day ${metaFreshness.mostRecentTrustedDay} (${metaFreshness.lagDays ?? "?"}d lag).`
      : "No globally trusted Meta published day is visible yet.",
    metaFreshness.warehouseReadyThroughDay
      ? `Core warehouse through ${metaFreshness.warehouseReadyThroughDay} (${metaFreshness.warehouseLagDays ?? "?"}d lag).`
      : "No global Meta core ready-through day is visible yet.",
    `${metaCoverage.progressingBusinesses}/${metaCoverage.totalBusinesses} businesses are progressing; ${metaCoverage.stalledBusinesses} look stalled.`,
    metaQuota.quotaPressurePresent
      ? `Quota pressure is visible in ${metaQuota.quotaLimitedBusinesses}/${metaCoverage.totalBusinesses} businesses.`
      : "No current Meta quota pressure is visible in the shared review.",
    metaTruthHealth.summary,
  ];

  return {
    capturedAt,
    workflow: {
      adminSurface: GLOBAL_OPERATOR_REVIEW_WORKFLOW.adminSurface,
      reviewCommand: SYNC_EFFECTIVENESS_REVIEW_COMMAND,
      readyMeans: GLOBAL_OPERATOR_REVIEW_WORKFLOW.readyMeans,
    },
    googleAds: {
      provider: "google_ads",
      summaryState: googleSummaryState,
      summary: buildGoogleSummary({
        summaryState: googleSummaryState,
        rebuildState: input.globalRebuildReview.googleAds.rebuild.state,
        progressMovedRecently: googleProgressMovedRecently,
        hotWindowCurrentBusinesses: googleHotWindowSupportBusinesses,
        totalBusinesses: googleTotal,
        quotaLimitedBusinesses: googleQuota.quotaLimitedBusinesses,
      }),
      freshness: googleFreshness,
      coverage: googleCoverage,
      quota: googleQuota,
      truthHealth: googleTruthHealth,
      topSignals: googleTopSignals,
    },
    meta: {
      provider: "meta",
      summaryState: metaSummaryState,
      summary: buildMetaSummary({
        summaryState: metaSummaryState,
        protectedPublishedTruthState: metaTruthHealth.protectedPublishedTruthState,
        rebuildState: input.globalRebuildReview.meta.rebuild.state,
        quotaLimitedBusinesses: metaQuota.quotaLimitedBusinesses,
      }),
      freshness: metaFreshness,
      coverage: metaCoverage,
      quota: metaQuota,
      truthHealth: metaTruthHealth,
      topSignals: metaTopSignals,
    },
  };
}

export function formatSyncEffectivenessSummaryState(state: SyncEffectivenessSummaryState) {
  return summarizeSummaryState(state);
}
