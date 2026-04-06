import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getIntegrationMetadata } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { readProviderAccountSnapshot } from "@/lib/provider-account-snapshots";
import {
  META_PRODUCT_CORE_COVERAGE_SCOPES,
  META_RUNTIME_STATE_SCOPES,
  META_SECONDARY_REPORTING_SCOPES,
} from "@/lib/meta/core-config";
import { rollupMetaPageReadiness } from "@/lib/meta/page-readiness";
import { getMetaCurrentDayLiveAvailability } from "@/lib/meta/live";
import {
  getLatestMetaSyncHealth,
  getMetaAccountDailyCoverage,
  getMetaCampaignDailyCoverage,
  getMetaAccountDailyStats,
  getMetaAdDailyCoverage,
  getMetaAdDailyPreviewCoverage,
  getMetaAdSetDailyCoverage,
  getMetaCheckpointHealth,
  getMetaCreativeDailyCoverage,
  getMetaQueueComposition,
  getMetaQueueHealth,
  getMetaRawSnapshotCoverageByEndpoint,
  getMetaSyncJobHealth,
  getMetaSyncState,
} from "@/lib/meta/warehouse";
import { META_WAREHOUSE_HISTORY_DAYS, dayCountInclusive } from "@/lib/meta/history";
import { getMetaBreakdownSupportedStart, META_BREAKDOWN_MAX_HISTORY_DAYS } from "@/lib/meta/constraints";
import {
  buildProviderStateContract,
  buildProviderSurfaces,
} from "@/lib/provider-readiness";
import { isDemoBusinessId, getDemoMetaStatus } from "@/lib/demo-business";
import { getProviderWorkerHealthState } from "@/lib/sync/worker-health";
import { deriveMetaOperationsBlockReason } from "@/lib/meta/status-operations";
import {
  buildBlockingReason,
  buildProviderProgressEvidence,
  buildRepairableAction,
  buildRequiredCoverage,
  compactBlockingReasons,
  compactRepairableActions,
  deriveProviderStallFingerprints,
  deriveProviderProgressState,
} from "@/lib/sync/provider-status-truth";
import type { MetaSurfaceReadiness } from "@/lib/meta/status-types";

function buildMetaDomainReadiness(input: {
  availableSurfaces: string[];
  missingSurfaces: string[];
}) {
  const coreSurfacesReady = [...META_PRODUCT_CORE_COVERAGE_SCOPES].filter((surface) =>
    input.availableSurfaces.includes(surface)
  );
  const deepSurfacesPending = Array.from(
    new Set(
      input.missingSurfaces.filter((surface) => !META_PRODUCT_CORE_COVERAGE_SCOPES.includes(surface as never))
    )
  );
  const blockingSurfaces = [...META_PRODUCT_CORE_COVERAGE_SCOPES].filter((surface) =>
    input.missingSurfaces.includes(surface)
  );
  const summary =
    blockingSurfaces.length > 0
      ? "Core spend and campaign summary are still syncing."
      : null;
  return {
    coreSurfacesReady,
    deepSurfacesPending,
    blockingSurfaces,
    summary,
  };
}

const META_BREAKDOWN_ENDPOINTS = [
  "breakdown_age",
  "breakdown_country",
  "breakdown_publisher_platform,platform_position,impression_device",
] as const;

const META_BREAKDOWN_SURFACES = [
  {
    surfaceKey: "breakdowns.age",
    coverageKey: "age",
    endpointName: "breakdown_age",
    label: "Age",
  },
  {
    surfaceKey: "breakdowns.location",
    coverageKey: "location",
    endpointName: "breakdown_country",
    label: "Country",
  },
  {
    surfaceKey: "breakdowns.placement",
    coverageKey: "placement",
    endpointName: "breakdown_publisher_platform,platform_position,impression_device",
    label: "Placement",
  },
] as const;

const META_STATE_SCOPES = [...META_RUNTIME_STATE_SCOPES] as const;
const META_CORE_REQUIRED_SURFACES = [...META_PRODUCT_CORE_COVERAGE_SCOPES] as const;
const META_SECONDARY_SURFACES = [...META_SECONDARY_REPORTING_SCOPES, "ad_daily"] as const;
const META_DEEP_SURFACES = ["breakdowns"] as const;
const META_RECENT_RECOVERY_DAYS = Math.max(
  1,
  Number(process.env.META_RECENT_RECOVERY_DAYS ?? 14) || 14
);

function getTodayIsoForTimeZoneServer(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function minCompletedDays(
  values: Array<number | null | undefined>,
  totalDays: number | null | undefined
) {
  const finiteValues = values.filter((value): value is number => Number.isFinite(value));
  if (finiteValues.length === 0) return 0;
  const minValue = Math.min(...finiteValues);
  if (!Number.isFinite(totalDays) || (totalDays ?? 0) <= 0) return minValue;
  return Math.min(minValue, totalDays ?? 0);
}

function earliestReadyThroughDate(values: Array<string | null | undefined>) {
  return (
    values
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right))[0] ?? null
  );
}

function buildPhaseLabel(input: {
  selectedRangeIncomplete: boolean;
  selectedRangeIsToday: boolean;
  historicalQueuePaused: boolean;
  staleLeasedQueue: boolean;
  stateMissingWhileQueued: boolean;
  overallCompletedDays: number;
  totalDays: number;
  latestSyncType?: string | null;
}) {
  if (input.staleLeasedQueue) return "Meta sync is catching up";
  if (input.stateMissingWhileQueued) return "Meta queue is waiting for a worker";
  if (input.selectedRangeIncomplete && input.selectedRangeIsToday) return "Preparing today's data";
  if (input.selectedRangeIncomplete) return "Preparing selected dates";
  if (input.historicalQueuePaused) return "Historical sync is paused";
  if (input.overallCompletedDays < input.totalDays) return "Backfilling historical data";
  if (input.latestSyncType === "incremental_recent" || input.latestSyncType === "today_refresh") {
    return "Syncing recent history";
  }
  return "Ready";
}

function buildPageSurfaceState(input: {
  connected: boolean;
  hasAssignedAccounts: boolean;
  ready: boolean;
  activeProgress: boolean;
  blockedReason?: string | null;
  syncingReason: string;
  blockedFallbackReason: string;
}): MetaSurfaceReadiness["state"] {
  if (!input.connected || !input.hasAssignedAccounts) return "not_connected";
  if (input.blockedReason) return "blocked";
  if (input.ready) return "ready";
  if (input.activeProgress) return "syncing";
  return "partial";
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const businessId = url.searchParams.get("businessId");
  const selectedStartDate = url.searchParams.get("startDate");
  const selectedEndDate = url.searchParams.get("endDate");

  const access = await requireBusinessAccess({ request, businessId });
  if ("error" in access) return access.error;

  if (isDemoBusinessId(businessId)) {
    return NextResponse.json(getDemoMetaStatus(), { headers: { "Cache-Control": "no-store" } });
  }

  const [integration, assignments, latestSync, accountStats, accountSnapshot, legacyJobHealth, workerHealth] =
    await Promise.all([
      getIntegrationMetadata(businessId!, "meta").catch(() => null),
      getProviderAccountAssignments(businessId!, "meta").catch(() => null),
      getLatestMetaSyncHealth({ businessId: businessId!, providerAccountId: null }).catch(() => null),
      getMetaAccountDailyStats({ businessId: businessId!, providerAccountId: null }).catch(() => null),
      readProviderAccountSnapshot({ businessId: businessId!, provider: "meta" }).catch(() => null),
      getMetaSyncJobHealth({ businessId: businessId! }).catch(() => null),
      getProviderWorkerHealthState({
        businessId: businessId!,
        providerScope: "meta",
        staleThresholdMs: 3 * 60_000,
      }).catch(() => null),
    ]);

  const accountIds = assignments?.account_ids ?? [];
  const connected = Boolean(integration?.status === "connected");
  const primaryAccountId = accountIds[0] ?? null;
  const primaryAccountTimezone =
    accountSnapshot?.accounts.find((account) => account.id === primaryAccountId)?.timezone ??
    accountSnapshot?.accounts[0]?.timezone ??
    "UTC";
  const currentDateInTimezone = getTodayIsoForTimeZoneServer(primaryAccountTimezone);

  const initialBackfillEnd = addDays(
    new Date(`${currentDateInTimezone ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`),
    -1
  )
    .toISOString()
    .slice(0, 10);
  const initialBackfillStart = addDays(
    new Date(`${initialBackfillEnd}T00:00:00Z`),
    -(META_WAREHOUSE_HISTORY_DAYS - 1)
  )
    .toISOString()
    .slice(0, 10);
  const historicalTotalDays = dayCountInclusive(initialBackfillStart, initialBackfillEnd);
  const breakdownHistoricalStart =
    initialBackfillStart > getMetaBreakdownSupportedStart(initialBackfillEnd)
      ? initialBackfillStart
      : getMetaBreakdownSupportedStart(initialBackfillEnd);
  const effectiveHistoricalTotalDays = Math.min(
    historicalTotalDays,
    dayCountInclusive(breakdownHistoricalStart, initialBackfillEnd)
  );
  const recentWindowStart = addDays(
    new Date(`${initialBackfillEnd}T00:00:00Z`),
    -(Math.min(META_RECENT_RECOVERY_DAYS, historicalTotalDays) - 1)
  )
    .toISOString()
    .slice(0, 10);
  const recentWindowTotalDays = Math.min(
    META_RECENT_RECOVERY_DAYS,
    dayCountInclusive(recentWindowStart, initialBackfillEnd)
  );

  const [accountCoverage, campaignCoverage, adsetCoverage, adDailyCoverage, creativeCoverage, creativePreviewCoverage, breakdownCoverageByEndpoint, queueHealth, queueComposition, checkpointHealth, recentAccountCoverage, recentCampaignCoverage, recentAdsetCoverage, recentCreativeCoverage, recentAdCoverage, ...stateRows] =
      await Promise.all([
          getMetaAccountDailyCoverage({
            businessId: businessId!,
            providerAccountId: null,
            startDate: initialBackfillStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getMetaCampaignDailyCoverage({
            businessId: businessId!,
            providerAccountId: null,
            startDate: initialBackfillStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getMetaAdSetDailyCoverage({
            businessId: businessId!,
            providerAccountId: null,
            startDate: initialBackfillStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getMetaAdDailyCoverage({
            businessId: businessId!,
            providerAccountId: null,
            startDate: initialBackfillStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getMetaCreativeDailyCoverage({
            businessId: businessId!,
            providerAccountId: null,
            startDate: initialBackfillStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getMetaAdDailyPreviewCoverage({
            businessId: businessId!,
            providerAccountId: null,
            startDate: initialBackfillStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getMetaRawSnapshotCoverageByEndpoint({
            businessId: businessId!,
            providerAccountId: null,
            endpointNames: [...META_BREAKDOWN_ENDPOINTS],
            startDate: breakdownHistoricalStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getMetaQueueHealth({ businessId: businessId! }).catch(() => null),
          getMetaQueueComposition({ businessId: businessId! }).catch(() => null),
          getMetaCheckpointHealth({ businessId: businessId! }).catch(() => null),
          getMetaAccountDailyCoverage({
            businessId: businessId!,
            providerAccountId: null,
            startDate: recentWindowStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getMetaCampaignDailyCoverage({
            businessId: businessId!,
            providerAccountId: null,
            startDate: recentWindowStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getMetaAdSetDailyCoverage({
            businessId: businessId!,
            providerAccountId: null,
            startDate: recentWindowStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getMetaCreativeDailyCoverage({
            businessId: businessId!,
            providerAccountId: null,
            startDate: recentWindowStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getMetaAdDailyCoverage({
            businessId: businessId!,
            providerAccountId: null,
            startDate: recentWindowStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          ...META_STATE_SCOPES.map((scope) =>
            getMetaSyncState({ businessId: businessId!, scope }).catch(() => [])
          ),
        ]);

  const statesByScope = Object.fromEntries(
    META_STATE_SCOPES.map((scope, index) => [scope, stateRows[index] ?? []])
  ) as Record<(typeof META_STATE_SCOPES)[number], Awaited<ReturnType<typeof getMetaSyncState>>>;

  const latestMetaQueueActivityAt =
    queueHealth?.latestMaintenanceActivityAt ??
    queueHealth?.latestExtendedActivityAt ??
    queueHealth?.latestCoreActivityAt ??
    null;
  const operationsBlockReason = workerHealth
    ? deriveMetaOperationsBlockReason({
        workerHealthy: workerHealth.workerHealthy,
        queueDepth: queueHealth?.queueDepth ?? 0,
        leasedPartitions: queueHealth?.leasedPartitions ?? 0,
        consumeStage: workerHealth.consumeStage,
        heartbeatAgeMs: workerHealth.heartbeatAgeMs,
        latestActivityAt: latestMetaQueueActivityAt,
        historicalCoreQueued: queueComposition?.summary.historicalCoreQueued ?? 0,
        extendedHistoricalQueued: queueComposition?.summary.extendedHistoricalQueued ?? 0,
        maintenanceQueued: queueComposition?.summary.maintenanceQueued ?? 0,
      })
    : null;

  const relevantStates = (scope: (typeof META_STATE_SCOPES)[number]) =>
    (statesByScope[scope] ?? []).filter((row) =>
      accountIds.length === 0 ? true : accountIds.includes(row.providerAccountId)
    );

  const accountDailyStates = relevantStates("account_daily");
  const campaignDailyStates = relevantStates("campaign_daily");
  const adsetDailyStates = relevantStates("adset_daily");
  const creativeDailyStates = relevantStates("creative_daily");
  const adDailyStates = relevantStates("ad_daily");

  const breakdownCoverageDays = Math.min(
    ...META_BREAKDOWN_ENDPOINTS.map(
      (endpointName) => breakdownCoverageByEndpoint?.get(endpointName)?.completed_days ?? 0
    )
  );
  const breakdownReadyThroughDate =
    META_BREAKDOWN_ENDPOINTS.map(
      (endpointName) => breakdownCoverageByEndpoint?.get(endpointName)?.ready_through_date ?? null
    )
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => a.localeCompare(b))[0] ?? null;

  const historicalArchiveCompletedDays = minCompletedDays(
    [
      accountDailyStates.length > 0
        ? Math.min(...accountDailyStates.map((row) => row.completedDays))
        : accountCoverage?.completed_days ?? 0,
      campaignDailyStates.length > 0
        ? Math.min(...campaignDailyStates.map((row) => row.completedDays))
        : campaignCoverage?.completed_days ?? 0,
    ],
    historicalTotalDays
  );
  const historicalArchiveReadyThroughDate = earliestReadyThroughDate([
    accountDailyStates.length > 0
      ? earliestReadyThroughDate(accountDailyStates.map((row) => row.readyThroughDate))
      : accountCoverage?.ready_through_date ?? null,
    campaignDailyStates.length > 0
      ? earliestReadyThroughDate(campaignDailyStates.map((row) => row.readyThroughDate))
      : campaignCoverage?.ready_through_date ?? null,
  ]);

  const selectedRangeCoverage =
    selectedStartDate && selectedEndDate
      ? await getMetaAccountDailyCoverage({
          businessId: businessId!,
          providerAccountId: null,
          startDate: selectedStartDate,
          endDate: selectedEndDate,
        }).catch(() => null)
      : null;
  const selectedRangeCampaignCoverage =
    selectedStartDate && selectedEndDate
      ? await getMetaCampaignDailyCoverage({
          businessId: businessId!,
          providerAccountId: null,
          startDate: selectedStartDate,
          endDate: selectedEndDate,
        }).catch(() => null)
      : null;
  const selectedRangeAdsetCoverage =
    selectedStartDate && selectedEndDate
      ? await getMetaAdSetDailyCoverage({
          businessId: businessId!,
          providerAccountId: null,
          startDate: selectedStartDate,
          endDate: selectedEndDate,
        }).catch(() => null)
      : null;
  const selectedRangeBreakdownCoverageByEndpoint =
    selectedStartDate && selectedEndDate
      ? await getMetaRawSnapshotCoverageByEndpoint({
          businessId: businessId!,
          providerAccountId: null,
          endpointNames: [...META_BREAKDOWN_ENDPOINTS],
          startDate: selectedStartDate,
          endDate: selectedEndDate,
        }).catch(() => null)
      : null;
  const selectedRangeTotalDays =
    selectedStartDate && selectedEndDate ? dayCountInclusive(selectedStartDate, selectedEndDate) : null;
  const selectedRangeRequested = Boolean(selectedStartDate && selectedEndDate && selectedRangeTotalDays);
  const selectedRangeCoreCompletedDays = minCompletedDays(
    [selectedRangeCoverage?.completed_days ?? 0, selectedRangeCampaignCoverage?.completed_days ?? 0],
    selectedRangeTotalDays
  );
  const selectedRangeIncomplete =
    Boolean(selectedRangeTotalDays) && selectedRangeCoreCompletedDays < (selectedRangeTotalDays ?? 0);
  const selectedRangeCoreReadyThroughDate = earliestReadyThroughDate([
    selectedRangeCoverage?.ready_through_date ?? null,
    selectedRangeCampaignCoverage?.ready_through_date ?? null,
  ]);
  const selectedRangeBreakdownReadyThroughDate =
    selectedRangeRequested
      ? META_BREAKDOWN_ENDPOINTS.map(
          (endpointName) => selectedRangeBreakdownCoverageByEndpoint?.get(endpointName)?.ready_through_date ?? null
        )
          .filter((value): value is string => Boolean(value))
          .sort((a, b) => a.localeCompare(b))[0] ?? null
      : null;
  const selectedRangeIsToday =
    Boolean(selectedStartDate && selectedEndDate && currentDateInTimezone) &&
    selectedStartDate === selectedEndDate &&
    selectedStartDate === currentDateInTimezone;
  const selectedRangeBreakdownGuardrailBlocked =
    selectedRangeRequested && selectedEndDate && selectedStartDate
      ? selectedStartDate < getMetaBreakdownSupportedStart(selectedEndDate)
      : false;
  const scopeSummaries = [
    {
      scope: "account_daily",
      states: accountDailyStates,
      fallbackCompletedDays: accountCoverage?.completed_days ?? 0,
      fallbackReadyThroughDate: accountCoverage?.ready_through_date ?? null,
    },
    {
      scope: "campaign_daily",
      states: campaignDailyStates,
      fallbackCompletedDays: campaignCoverage?.completed_days ?? 0,
      fallbackReadyThroughDate: campaignCoverage?.ready_through_date ?? null,
    },
    {
      scope: "adset_daily",
      states: adsetDailyStates,
      fallbackCompletedDays: adsetCoverage?.completed_days ?? 0,
      fallbackReadyThroughDate: adsetCoverage?.ready_through_date ?? null,
    },
    {
      scope: "creative_daily",
      states: creativeDailyStates,
      fallbackCompletedDays: creativeCoverage?.completed_days ?? 0,
      fallbackReadyThroughDate: creativeCoverage?.ready_through_date ?? null,
    },
    {
      scope: "ad_daily",
      states: adDailyStates,
      fallbackCompletedDays: adDailyCoverage?.completed_days ?? 0,
      fallbackReadyThroughDate: adDailyCoverage?.ready_through_date ?? null,
    },
  ].map((entry) => ({
    scope: entry.scope,
    completedDays:
      entry.states.length > 0
        ? Math.min(...entry.states.map((row) => row.completedDays))
        : entry.fallbackCompletedDays,
    totalDays: historicalTotalDays,
    readyThroughDate:
      entry.states
        .map((row) => row.readyThroughDate)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => a.localeCompare(b))[0] ?? entry.fallbackReadyThroughDate,
    latestBackgroundActivityAt:
      entry.states
        .map((row) => row.latestBackgroundActivityAt)
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => b.localeCompare(a))[0] ?? null,
    deadLetterCount:
      entry.states.length > 0 ? Math.max(...entry.states.map((row) => row.deadLetterCount)) : 0,
  }));

  const historicalArchiveProgressPercent =
    historicalTotalDays > 0
      ? Math.min(100, Math.round((historicalArchiveCompletedDays / historicalTotalDays) * 100))
      : 0;
  const currentCoreProgressPercent =
    selectedRangeRequested && selectedRangeTotalDays
      ? Math.min(100, Math.round((selectedRangeCoreCompletedDays / selectedRangeTotalDays) * 100))
      : recentWindowTotalDays > 0
        ? Math.min(
            100,
            Math.round(
              (minCompletedDays(
                [recentAccountCoverage?.completed_days ?? 0, recentCampaignCoverage?.completed_days ?? 0],
                recentWindowTotalDays
              ) /
                recentWindowTotalDays) *
                100
            )
          )
        : 0;
  const historicalArchiveComplete = historicalArchiveCompletedDays >= historicalTotalDays;
  const currentCoreUsable = selectedRangeRequested
    ? Boolean(selectedRangeTotalDays) && selectedRangeCoreCompletedDays >= (selectedRangeTotalDays ?? 0)
    : minCompletedDays(
          [recentAccountCoverage?.completed_days ?? 0, recentCampaignCoverage?.completed_days ?? 0],
          recentWindowTotalDays
        ) >= recentWindowTotalDays;
  const latestBackgroundActivityAt =
    queueHealth?.latestCoreActivityAt ??
    queueHealth?.latestMaintenanceActivityAt ??
    queueHealth?.latestExtendedActivityAt ??
    null;
  const latestBackgroundActivityMs = latestBackgroundActivityAt
    ? new Date(String(latestBackgroundActivityAt)).getTime()
    : null;
  const backgroundRecentlyActive =
    latestBackgroundActivityMs != null &&
    Number.isFinite(latestBackgroundActivityMs) &&
    Date.now() - latestBackgroundActivityMs < 20 * 60 * 1000;
  const historicalQueuePaused =
    connected &&
    accountIds.length > 0 &&
    historicalArchiveCompletedDays < historicalTotalDays &&
    (queueHealth?.leasedPartitions ?? 0) === 0 &&
    (queueHealth?.queueDepth ?? 0) > 0 &&
    !backgroundRecentlyActive;
  const staleLeasedQueue =
    connected &&
    accountIds.length > 0 &&
    (queueHealth?.leasedPartitions ?? 0) > 0 &&
    !backgroundRecentlyActive;
  const stateMissingWhileQueued =
    connected &&
    accountIds.length > 0 &&
    (queueHealth?.queueDepth ?? 0) > 0 &&
    (queueHealth?.leasedPartitions ?? 0) === 0 &&
    scopeSummaries.every((summary) => summary.completedDays === 0);
  const phaseLabel = buildPhaseLabel({
    selectedRangeIncomplete: Boolean(selectedRangeIncomplete),
    selectedRangeIsToday,
    historicalQueuePaused,
    staleLeasedQueue,
    stateMissingWhileQueued,
    overallCompletedDays: historicalArchiveCompletedDays,
    totalDays: historicalTotalDays,
    latestSyncType: latestSync?.sync_type ? String(latestSync.sync_type) : null,
  });

  const selectedRangeStillPreparing = Boolean(selectedRangeRequested && selectedRangeIncomplete);
  const overallSyncActive =
    connected &&
    accountIds.length > 0 &&
    (
      historicalArchiveCompletedDays < historicalTotalDays ||
      (queueHealth?.leasedPartitions ?? 0) > 0 ||
      (queueHealth?.queueDepth ?? 0) > 0 ||
      (queueHealth?.retryableFailedPartitions ?? 0) > 0
    );
  const shouldReportSelectedRangeProgress = Boolean(selectedRangeRequested && selectedRangeTotalDays);
  const responseProgressPercent =
    shouldReportSelectedRangeProgress && selectedRangeTotalDays
      ? Math.min(100, Math.round((selectedRangeCoreCompletedDays / selectedRangeTotalDays) * 100))
      : historicalArchiveProgressPercent;
  const responseCompletedDays = shouldReportSelectedRangeProgress
    ? selectedRangeCoreCompletedDays
    : historicalArchiveCompletedDays;
  const responseTotalDays = shouldReportSelectedRangeProgress
    ? selectedRangeTotalDays
    : historicalTotalDays;
  const responseReadyThroughDate = shouldReportSelectedRangeProgress
    ? selectedRangeCoreReadyThroughDate
    : historicalArchiveReadyThroughDate;
  const selectedRangeReportReady = Boolean(selectedRangeRequested && !selectedRangeIncomplete);
  const breakdownSupportStartDate = selectedEndDate
    ? getMetaBreakdownSupportedStart(selectedEndDate)
    : null;
  const selectedRangeBreakdownsBySurface = Object.fromEntries(
    META_BREAKDOWN_SURFACES.map((surface) => {
      const coverage = selectedRangeBreakdownCoverageByEndpoint?.get(surface.endpointName) ?? null;
      const totalDays = selectedRangeTotalDays ?? 0;
      const completedDays = selectedRangeRequested ? coverage?.completed_days ?? 0 : 0;
      const readyThroughDate = selectedRangeRequested ? coverage?.ready_through_date ?? null : null;
      const isBlocked = Boolean(selectedRangeBreakdownGuardrailBlocked);
      return [
        surface.coverageKey,
        {
          completedDays,
          totalDays,
          readyThroughDate,
          isComplete: Boolean(selectedRangeRequested) && completedDays >= totalDays,
          supportStartDate: breakdownSupportStartDate,
          isBlocked,
        },
      ];
    })
  ) as {
    age: {
      completedDays: number;
      totalDays: number;
      readyThroughDate: string | null;
      isComplete: boolean;
      supportStartDate: string | null;
      isBlocked: boolean;
    };
    location: {
      completedDays: number;
      totalDays: number;
      readyThroughDate: string | null;
      isComplete: boolean;
      supportStartDate: string | null;
      isBlocked: boolean;
    };
    placement: {
      completedDays: number;
      totalDays: number;
      readyThroughDate: string | null;
      isComplete: boolean;
      supportStartDate: string | null;
      isBlocked: boolean;
    };
  };
  const selectedRangeBreakdownCompletedDays =
    selectedRangeRequested
      ? Math.min(
          selectedRangeBreakdownsBySurface.age.completedDays,
          selectedRangeBreakdownsBySurface.location.completedDays,
          selectedRangeBreakdownsBySurface.placement.completedDays
        )
      : 0;
  const selectedRangeMode = selectedRangeIsToday
    ? "current_day_live"
    : "historical_warehouse";
  const currentDayLive =
    selectedRangeIsToday && connected && accountIds.length > 0 && selectedStartDate && selectedEndDate
      ? await getMetaCurrentDayLiveAvailability({
          businessId: businessId!,
          startDate: selectedStartDate,
          endDate: selectedEndDate,
          providerAccountIds: accountIds,
        }).catch(() => ({
          summaryAvailable: false,
          campaignsAvailable: false,
        }))
      : null;
  const summaryReady =
    !selectedRangeRequested
      ? connected && accountIds.length > 0 && (accountCoverage?.completed_days ?? 0) > 0
      : selectedRangeIsToday
      ? currentDayLive?.summaryAvailable === true
      : Boolean(selectedRangeTotalDays) &&
        (selectedRangeCoverage?.completed_days ?? 0) >= (selectedRangeTotalDays ?? 0);
  const campaignsReady =
    !selectedRangeRequested
      ? connected && accountIds.length > 0 && (campaignCoverage?.completed_days ?? 0) > 0
      : selectedRangeIsToday
      ? currentDayLive?.campaignsAvailable === true
      : Boolean(selectedRangeTotalDays) &&
        (selectedRangeCampaignCoverage?.completed_days ?? 0) >= (selectedRangeTotalDays ?? 0);
  const summarySurfaceReason = !connected
    ? "Meta integration is not connected."
    : accountIds.length === 0
      ? "No Meta ad account is assigned to this workspace."
      : summaryReady
        ? null
        : !selectedRangeRequested
          ? "Recent summary warehouse data is still being prepared for this workspace."
        : selectedRangeIsToday
          ? "Summary data for the current Meta account day is still preparing."
          : "Summary warehouse data is still being prepared for the selected range.";
  const campaignsSurfaceReason = !connected
    ? "Meta integration is not connected."
    : accountIds.length === 0
      ? "No Meta ad account is assigned to this workspace."
      : campaignsReady
        ? null
        : !selectedRangeRequested
          ? "Recent campaign warehouse data is still being prepared for this workspace."
        : selectedRangeIsToday
          ? "Campaign data for the current Meta account day is still preparing."
          : "Campaign warehouse data is still being prepared for the selected range.";
  const breakdownRequiredSurfaces = Object.fromEntries(
    META_BREAKDOWN_SURFACES.map((surface) => {
      const coverage = selectedRangeBreakdownsBySurface[surface.coverageKey];
      const ready = coverage.isComplete;
      const blockedReason =
        coverage.isBlocked && coverage.supportStartDate
          ? `${surface.label} breakdown data is only supported from ${coverage.supportStartDate} onward for the selected range.`
          : null;
      const reason = !connected
        ? "Meta integration is not connected."
        : accountIds.length === 0
          ? "No Meta ad account is assigned to this workspace."
          : blockedReason
            ? blockedReason
            : ready
              ? null
              : selectedRangeIsToday
                ? `${surface.label} breakdown data for the current Meta account day is still preparing.`
                : `${surface.label} breakdown data is still being prepared for the selected range.`;
      const state = buildPageSurfaceState({
        connected,
        hasAssignedAccounts: accountIds.length > 0,
        ready,
        activeProgress: overallSyncActive,
        blockedReason,
        syncingReason: reason ?? `${surface.label} breakdown data is still preparing.`,
        blockedFallbackReason:
          reason ?? `${surface.label} breakdown data is unavailable for the selected range.`,
      });
      return [
        surface.surfaceKey,
        {
          state,
          blocking: state !== "ready",
          countsForPageCompleteness: true,
          truthClass: selectedRangeIsToday ? "current_day_live" : "historical_warehouse",
          reason,
        },
      ];
    })
  ) as Pick<
    ReturnType<typeof rollupMetaPageReadiness>["requiredSurfaces"],
    "breakdowns.age" | "breakdowns.location" | "breakdowns.placement"
  >;
  const pageRequiredSurfaces = {
    summary: {
      state: buildPageSurfaceState({
        connected,
        hasAssignedAccounts: accountIds.length > 0,
        ready: summaryReady,
        activeProgress: overallSyncActive,
        blockedReason: null,
        syncingReason: summarySurfaceReason ?? "Summary data is still preparing.",
        blockedFallbackReason: summarySurfaceReason ?? "Summary data is unavailable.",
      }),
      blocking: !summaryReady,
      countsForPageCompleteness: true,
      truthClass: selectedRangeIsToday ? "current_day_live" : "historical_warehouse",
      reason: summarySurfaceReason,
    },
    campaigns: {
      state: buildPageSurfaceState({
        connected,
        hasAssignedAccounts: accountIds.length > 0,
        ready: campaignsReady,
        activeProgress: overallSyncActive,
        blockedReason: null,
        syncingReason: campaignsSurfaceReason ?? "Campaign data is still preparing.",
        blockedFallbackReason: campaignsSurfaceReason ?? "Campaign data is unavailable.",
      }),
      blocking: !campaignsReady,
      countsForPageCompleteness: true,
      truthClass: selectedRangeIsToday ? "current_day_live" : "historical_warehouse",
      reason: campaignsSurfaceReason,
    },
    ...breakdownRequiredSurfaces,
  } as const;
  const adsetsReady =
    selectedRangeIsToday
      ? connected && accountIds.length > 0
      : Boolean(selectedRangeTotalDays) &&
        (selectedRangeAdsetCoverage?.completed_days ?? 0) >= (selectedRangeTotalDays ?? 0);
  const pageOptionalSurfaces = {
    adsets: {
      state: !connected
        ? "not_connected"
        : adsetsReady
          ? "ready"
          : overallSyncActive
            ? "syncing"
            : "partial",
      blocking: false,
      countsForPageCompleteness: false,
      truthClass: "conditional_drilldown",
      reason: !connected
        ? "Meta integration is not connected."
        : accountIds.length === 0
          ? "No Meta ad account is assigned to this workspace."
          : adsetsReady
            ? "Ad set drilldown is available when a campaign is selected."
            : "Ad set drilldown becomes available when a campaign is selected and the selected range is prepared.",
    },
    recommendations: {
      state: !connected
        ? "not_connected"
        : pageRequiredSurfaces.summary.state === "ready" &&
            pageRequiredSurfaces.campaigns.state === "ready"
          ? "ready"
          : overallSyncActive
            ? "syncing"
            : "partial",
      blocking: false,
      countsForPageCompleteness: false,
      truthClass: "ai_exception",
      reason: !connected
        ? "Meta integration is not connected."
        : pageRequiredSurfaces.summary.state === "ready" &&
            pageRequiredSurfaces.campaigns.state === "ready"
          ? "Recommendations are available when the selected range core surfaces are ready."
          : "Recommendations remain optional while selected-range core surfaces are still preparing.",
    },
  } as const;
  const pageReadiness = rollupMetaPageReadiness({
    connected,
    hasAssignedAccounts: accountIds.length > 0,
    selectedRangeMode,
    requiredSurfaces: pageRequiredSurfaces,
    optionalSurfaces: pageOptionalSurfaces,
  });

  const state = !connected
    ? "not_connected"
    : accountIds.length === 0
      ? "connected_no_assignment"
      : (queueHealth?.deadLetterPartitions ?? 0) > 0
        ? "action_required"
        : staleLeasedQueue
          ? "stale"
        : stateMissingWhileQueued
          ? "paused"
        : historicalQueuePaused
          ? "paused"
        : selectedRangeReportReady
          ? "ready"
        : (legacyJobHealth?.staleRunningJobs ?? 0) > 0
            ? "stale"
            : (queueHealth?.retryableFailedPartitions ?? 0) > 0
              ? "stale"
            : overallSyncActive
              ? "syncing"
              : !selectedRangeIncomplete && historicalArchiveProgressPercent >= 100
                  ? "ready"
                  : "partial";
  const latestMetaActivityAt =
    queueHealth?.latestCoreActivityAt ??
    queueHealth?.latestExtendedActivityAt ??
    queueHealth?.latestMaintenanceActivityAt ??
    null;
  const metaProgressEvidence = buildProviderProgressEvidence({
    states: META_STATE_SCOPES.flatMap((scope) => relevantStates(scope)),
    checkpointUpdatedAt: checkpointHealth?.latestCheckpointUpdatedAt ?? null,
    recentActivityWindowMinutes: 20,
    aggregation: "latest",
  });
  const metaProgressState = deriveProviderProgressState({
    queueDepth: queueHealth?.queueDepth ?? 0,
    leasedPartitions: queueHealth?.leasedPartitions ?? 0,
    checkpointLagMinutes: checkpointHealth?.checkpointLagMinutes ?? null,
    latestPartitionActivityAt: latestMetaActivityAt,
    blocked: state === "action_required",
    fullyReady: state === "ready",
    hasRepairableBacklog: (queueHealth?.retryableFailedPartitions ?? 0) > 0,
    staleRunPressure: legacyJobHealth?.staleRunningJobs ?? 0,
    progressEvidence: metaProgressEvidence,
  });
  const metaBlockingReasons = compactBlockingReasons([
    (queueHealth?.deadLetterPartitions ?? 0) > 0
      ? buildBlockingReason(
          "required_dead_letter_partitions",
          `${queueHealth?.deadLetterPartitions ?? 0} Meta partition(s) are dead-lettered.`,
          { repairable: true }
        )
      : null,
    (queueHealth?.retryableFailedPartitions ?? 0) > 0
      ? buildBlockingReason(
          "retryable_failed_partitions",
          `${queueHealth?.retryableFailedPartitions ?? 0} Meta partition(s) are waiting for retry.`,
          { repairable: true }
        )
      : null,
    operationsBlockReason
      ? buildBlockingReason(
          `operations_${operationsBlockReason}`,
          `Meta sync operations are currently limited by ${operationsBlockReason}.`,
        )
      : null,
  ]);
  const metaRepairableActions = compactRepairableActions([
    buildRepairableAction(
      "refresh_queue",
      "Run targeted queue repair and re-plan missing Meta partitions.",
      { available: (queueHealth?.queueDepth ?? 0) > 0 || (queueHealth?.leasedPartitions ?? 0) > 0 }
    ),
    (queueHealth?.deadLetterPartitions ?? 0) > 0
      ? buildRepairableAction(
          "replay_dead_letters",
          "Replay Meta dead-letter partitions back into the queue."
        )
      : null,
    (queueHealth?.retryableFailedPartitions ?? 0) > 0
      ? buildRepairableAction(
          "requeue_failed",
          "Requeue retryable Meta failed partitions."
        )
      : null,
  ]);
  const metaRequiredCoverage = buildRequiredCoverage({
    completedDays: historicalArchiveCompletedDays,
    totalDays: historicalTotalDays,
    readyThroughDate: historicalArchiveReadyThroughDate,
  });
  const metaStallFingerprints = deriveProviderStallFingerprints({
    queueDepth: queueHealth?.queueDepth ?? 0,
    leasedPartitions: queueHealth?.leasedPartitions ?? 0,
    checkpointLagMinutes: checkpointHealth?.checkpointLagMinutes ?? null,
    latestPartitionActivityAt: latestMetaActivityAt,
    blocked: state === "action_required",
    hasRepairableBacklog: (queueHealth?.retryableFailedPartitions ?? 0) > 0,
    staleRunPressure: legacyJobHealth?.staleRunningJobs ?? 0,
    progressEvidence: metaProgressEvidence,
    blockedReasonCodes: metaBlockingReasons.map((reason) => reason.code),
    historicalBacklogDepth:
      (queueHealth?.historicalCoreQueueDepth ?? 0) +
      (queueHealth?.historicalCoreLeasedPartitions ?? 0) +
      (queueHealth?.extendedHistoricalQueueDepth ?? 0) +
      (queueHealth?.extendedHistoricalLeasedPartitions ?? 0),
  });
  const providerState = buildProviderStateContract({
    credentialState: connected ? "connected" : "not_connected",
    hasAssignedAccounts: accountIds.length > 0,
    warehouseRowCount: Number(accountStats?.row_count ?? 0),
    warehousePartial: selectedRangeRequested
      ? Boolean(selectedRangeIncomplete)
      : historicalArchiveCompletedDays < historicalTotalDays,
    syncState: state,
    selectedCurrentDay: selectedRangeIsToday,
    notReadyReason: phaseLabel === "Ready" ? null : phaseLabel,
  });

  const accountSurfaceReady = (accountCoverage?.completed_days ?? 0) >= historicalTotalDays;
  const campaignSurfaceReady = (campaignCoverage?.completed_days ?? 0) >= historicalTotalDays;
  const availableSurfaces = [
    currentCoreUsable ? "account_daily" : null,
    currentCoreUsable ? "campaign_daily" : null,
    (adsetCoverage?.completed_days ?? 0) >= effectiveHistoricalTotalDays ? "adset_daily" : null,
    (adDailyCoverage?.completed_days ?? 0) >= effectiveHistoricalTotalDays ? "ad_daily" : null,
    breakdownCoverageDays >= Math.min(historicalTotalDays, META_BREAKDOWN_MAX_HISTORY_DAYS) ? "breakdowns" : null,
  ].filter((value): value is string => Boolean(value));
  const surfaces = buildProviderSurfaces({
    required: [...META_CORE_REQUIRED_SURFACES, ...META_SECONDARY_SURFACES, ...META_DEEP_SURFACES],
    available: availableSurfaces,
  });
  const readinessLevel: "usable" | "partial" | "ready" =
    selectedRangeReportReady
      ? "ready"
      : accountSurfaceReady && campaignSurfaceReady
      ? "ready"
      : currentCoreUsable
        ? "usable"
        : "partial";
  const domainReadiness = buildMetaDomainReadiness({
    availableSurfaces,
    missingSurfaces: surfaces.missing,
  });

  const rangeCompletionBySurface = {
    account_daily: {
      recentCompletedDays: Math.min(recentWindowTotalDays, recentAccountCoverage?.completed_days ?? 0),
      recentTotalDays: recentWindowTotalDays,
      historicalCompletedDays: Math.min(historicalTotalDays, accountCoverage?.completed_days ?? 0),
      historicalTotalDays,
      readyThroughDate: accountCoverage?.ready_through_date ?? null,
    },
    campaign_daily: {
      recentCompletedDays: Math.min(recentWindowTotalDays, recentCampaignCoverage?.completed_days ?? 0),
      recentTotalDays: recentWindowTotalDays,
      historicalCompletedDays: Math.min(historicalTotalDays, campaignCoverage?.completed_days ?? 0),
      historicalTotalDays,
      readyThroughDate: campaignCoverage?.ready_through_date ?? null,
    },
    adset_daily: {
      recentCompletedDays: Math.min(recentWindowTotalDays, recentAdsetCoverage?.completed_days ?? 0),
      recentTotalDays: recentWindowTotalDays,
      historicalCompletedDays: Math.min(historicalTotalDays, adsetCoverage?.completed_days ?? 0),
      historicalTotalDays,
      readyThroughDate: adsetCoverage?.ready_through_date ?? null,
    },
    creative_daily: {
      recentCompletedDays: Math.min(recentWindowTotalDays, recentCreativeCoverage?.completed_days ?? 0),
      recentTotalDays: recentWindowTotalDays,
      historicalCompletedDays: Math.min(historicalTotalDays, creativeCoverage?.completed_days ?? 0),
      historicalTotalDays,
      readyThroughDate: creativeCoverage?.ready_through_date ?? null,
    },
    ad_daily: {
      recentCompletedDays: Math.min(recentWindowTotalDays, recentAdCoverage?.completed_days ?? 0),
      recentTotalDays: recentWindowTotalDays,
      historicalCompletedDays: Math.min(historicalTotalDays, adDailyCoverage?.completed_days ?? 0),
      historicalTotalDays,
      readyThroughDate: adDailyCoverage?.ready_through_date ?? null,
    },
  } as const;

  const recentExtendedReady =
    rangeCompletionBySurface.creative_daily.recentCompletedDays >= recentWindowTotalDays &&
    rangeCompletionBySurface.ad_daily.recentCompletedDays >= recentWindowTotalDays;
  const historicalExtendedReady =
    rangeCompletionBySurface.creative_daily.historicalCompletedDays >= historicalTotalDays &&
    rangeCompletionBySurface.ad_daily.historicalCompletedDays >= historicalTotalDays;
  const extendedRecoveryState =
    !recentExtendedReady
      ? "core_only"
      : historicalExtendedReady
        ? "extended_normal"
        : "extended_recovery";

  return NextResponse.json(
    {
      state,
      credentialState: providerState.credentialState,
      assignmentState: providerState.assignmentState,
      warehouseState: providerState.warehouseState,
      syncState: providerState.syncState,
      servingMode: providerState.servingMode,
      isPartial: providerState.isPartial,
      notReadyReason: providerState.notReadyReason,
      readinessLevel,
      surfaces,
      checkpointHealth,
      domainReadiness,
      connected,
      assignedAccountIds: accountIds,
      primaryAccountTimezone,
      currentDateInTimezone,
      currentCoreProgressPercent,
      historicalArchiveProgressPercent,
      currentCoreUsable,
      historicalArchiveComplete,
      needsBootstrap:
        connected && accountIds.length > 0 && historicalArchiveCompletedDays < historicalTotalDays,
      warehouse: {
        rowCount: accountStats?.row_count ?? 0,
        firstDate: accountStats?.first_date ?? null,
        lastDate: accountStats?.last_date ?? null,
        coverage: {
          historical: {
            completedDays: historicalArchiveCompletedDays,
            totalDays: historicalTotalDays,
            readyThroughDate: historicalArchiveReadyThroughDate,
          },
          selectedRange:
            selectedStartDate && selectedEndDate && selectedRangeTotalDays
              ? {
                  startDate: selectedStartDate,
                  endDate: selectedEndDate,
                  completedDays: selectedRangeCoreCompletedDays,
                  totalDays: selectedRangeTotalDays,
                  readyThroughDate: selectedRangeCoreReadyThroughDate,
                  isComplete: !selectedRangeIncomplete,
                }
              : null,
          scopes: scopeSummaries,
          accountDaily: {
            completedDays: accountCoverage?.completed_days ?? 0,
            totalDays: historicalTotalDays,
            readyThroughDate: accountCoverage?.ready_through_date ?? null,
          },
          campaignDaily: {
            completedDays: campaignCoverage?.completed_days ?? 0,
            totalDays: historicalTotalDays,
            readyThroughDate: campaignCoverage?.ready_through_date ?? null,
          },
          adsetDaily: {
            completedDays: adsetCoverage?.completed_days ?? 0,
            totalDays: historicalTotalDays,
            readyThroughDate: adsetCoverage?.ready_through_date ?? null,
          },
          breakdowns: {
            completedDays: breakdownCoverageDays,
            totalDays: Math.min(historicalTotalDays, META_BREAKDOWN_MAX_HISTORY_DAYS),
            readyThroughDate: breakdownReadyThroughDate,
          },
          breakdownsBySurface: selectedRangeRequested
            ? selectedRangeBreakdownsBySurface
            : null,
          creatives: {
            completedDays: creativeCoverage?.completed_days ?? 0,
            totalDays: historicalTotalDays,
            readyThroughDate: creativeCoverage?.ready_through_date ?? null,
            previewReadyRows: creativePreviewCoverage?.preview_ready_rows ?? 0,
            totalRows: creativePreviewCoverage?.total_rows ?? 0,
            previewReadyPercent:
              (creativePreviewCoverage?.total_rows ?? 0) > 0
                ? Math.round(
                    ((creativePreviewCoverage?.preview_ready_rows ?? 0) /
                      (creativePreviewCoverage?.total_rows ?? 1)) *
                      100
                  )
                : 0,
          },
          pendingSurfaces: scopeSummaries
            .filter((summary) => summary.completedDays < summary.totalDays)
            .map((summary) => summary.scope),
        },
      },
      jobHealth: {
        runningJobs: legacyJobHealth?.runningJobs ?? 0,
        staleRunningJobs: legacyJobHealth?.staleRunningJobs ?? 0,
        queueDepth: queueHealth?.queueDepth ?? 0,
        leasedPartitions: queueHealth?.leasedPartitions ?? 0,
        retryableFailedPartitions: queueHealth?.retryableFailedPartitions ?? 0,
        deadLetterPartitions: queueHealth?.deadLetterPartitions ?? 0,
        oldestQueuedPartition: queueHealth?.oldestQueuedPartition ?? null,
        latestCoreActivityAt: queueHealth?.latestCoreActivityAt ?? null,
        latestExtendedActivityAt: queueHealth?.latestExtendedActivityAt ?? null,
        latestMaintenanceActivityAt: queueHealth?.latestMaintenanceActivityAt ?? null,
        historicalCoreQueueDepth: queueHealth?.historicalCoreQueueDepth ?? 0,
        historicalCoreLeasedPartitions: queueHealth?.historicalCoreLeasedPartitions ?? 0,
        extendedRecentQueueDepth: queueHealth?.extendedRecentQueueDepth ?? 0,
        extendedRecentLeasedPartitions: queueHealth?.extendedRecentLeasedPartitions ?? 0,
        extendedHistoricalQueueDepth: queueHealth?.extendedHistoricalQueueDepth ?? 0,
        extendedHistoricalLeasedPartitions: queueHealth?.extendedHistoricalLeasedPartitions ?? 0,
      },
      operations: workerHealth
        ? {
            workerHealthy: workerHealth.workerHealthy,
            heartbeatAgeMs: workerHealth.heartbeatAgeMs,
            runnerLeaseActive: workerHealth.runnerLeaseActive,
            ownerWorkerId: workerHealth.ownerWorkerId,
            consumeStage: workerHealth.consumeStage,
            blockReason: operationsBlockReason,
            progressState: metaProgressState,
            blockingReasons: metaBlockingReasons,
            repairableActions: metaRepairableActions,
            requiredCoverage: metaRequiredCoverage,
            stallFingerprints: metaStallFingerprints,
            secondaryReadiness: [
              {
                key: "creatives_preview",
                state:
                  (creativeCoverage?.completed_days ?? 0) < historicalTotalDays
                    ? "building"
                    : ((creativePreviewCoverage?.total_rows ?? 0) === 0) ||
                        ((creativePreviewCoverage?.preview_ready_rows ?? 0) >=
                          (creativePreviewCoverage?.total_rows ?? 0))
                      ? "ready"
                      : "building",
                detail:
                  (creativeCoverage?.completed_days ?? 0) < historicalTotalDays
                    ? "Creative daily history is still backfilling."
                    : `Creative previews ready: ${creativePreviewCoverage?.preview_ready_rows ?? 0}/${creativePreviewCoverage?.total_rows ?? 0}.`,
              },
            ],
            queueSummary: queueComposition?.summary ?? null,
          }
        : null,
      extendedRecoveryState,
      recentExtendedReady,
      historicalExtendedReady,
      recentExtendedUsable: recentExtendedReady,
      rangeCompletionBySurface,
      currentDayLive,
      pageReadiness,
      priorityWindow:
        selectedStartDate && selectedEndDate && selectedRangeTotalDays
          ? {
              startDate: selectedStartDate,
              endDate: selectedEndDate,
              completedDays: selectedRangeCoreCompletedDays,
              totalDays: selectedRangeTotalDays,
              isActive: Boolean(selectedRangeIncomplete) && (queueHealth?.leasedPartitions ?? 0) > 0,
            }
          : null,
      latestSync: latestSync
        ? {
            id: latestSync.id ? String(latestSync.id) : null,
            status: latestSync.status ? String(latestSync.status) : undefined,
            syncType: latestSync.sync_type ? String(latestSync.sync_type) : null,
            scope: latestSync.scope ? String(latestSync.scope) : null,
            startDate: latestSync.start_date ? String(latestSync.start_date).slice(0, 10) : null,
            endDate: latestSync.end_date ? String(latestSync.end_date).slice(0, 10) : null,
            triggerSource: latestSync.trigger_source ? String(latestSync.trigger_source) : null,
            triggeredAt: latestSync.triggered_at ? String(latestSync.triggered_at) : null,
            startedAt: latestSync.started_at ? String(latestSync.started_at) : null,
            finishedAt: latestSync.finished_at ? String(latestSync.finished_at) : null,
            lastError: latestSync.last_error ? String(latestSync.last_error) : null,
            progressPercent: responseProgressPercent,
            completedDays: responseCompletedDays,
            totalDays: responseTotalDays,
            readyThroughDate: responseReadyThroughDate,
            phaseLabel: phaseLabel === "Ready" ? null : phaseLabel,
          }
        : {
            progressPercent: responseProgressPercent,
            completedDays: responseCompletedDays,
            totalDays: responseTotalDays,
            readyThroughDate: responseReadyThroughDate,
            phaseLabel: phaseLabel === "Ready" ? null : phaseLabel,
          },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
