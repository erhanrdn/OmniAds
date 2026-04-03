import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getIntegrationMetadata } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { readProviderAccountSnapshot } from "@/lib/provider-account-snapshots";
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

function buildMetaDomainReadiness(input: {
  availableSurfaces: string[];
  missingSurfaces: string[];
}) {
  const coreSurfacesReady = ["account_daily", "campaign_daily"].filter((surface) =>
    input.availableSurfaces.includes(surface)
  );
  const deepSurfacesPending = Array.from(
    new Set(
      input.missingSurfaces.filter((surface) => !["account_daily", "campaign_daily"].includes(surface))
    )
  );
  const blockingSurfaces = ["account_daily", "campaign_daily"].filter((surface) =>
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

const META_STATE_SCOPES = ["account_daily", "adset_daily", "creative_daily", "ad_daily"] as const;
const META_CORE_REQUIRED_SURFACES = ["account_daily", "campaign_daily"] as const;
const META_SECONDARY_SURFACES = ["adset_daily", "ad_daily"] as const;
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

  const overallCompletedDays = minCompletedDays(
    [
      accountDailyStates.length > 0
        ? Math.min(...accountDailyStates.map((row) => row.completedDays))
        : accountCoverage?.completed_days ?? 0,
      campaignCoverage?.completed_days ?? 0,
    ],
    historicalTotalDays
  );
  const historicalReadyThroughDate = earliestReadyThroughDate([
    accountDailyStates.length > 0
      ? earliestReadyThroughDate(accountDailyStates.map((row) => row.readyThroughDate))
      : accountCoverage?.ready_through_date ?? null,
    campaignCoverage?.ready_through_date ?? null,
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
  const selectedRangeTotalDays =
    selectedStartDate && selectedEndDate ? dayCountInclusive(selectedStartDate, selectedEndDate) : null;
  const selectedRangeCompletedDays = selectedRangeCoverage?.completed_days ?? 0;
  const selectedRangeRequested = Boolean(selectedStartDate && selectedEndDate && selectedRangeTotalDays);
  const selectedRangeCoreCompletedDays = minCompletedDays(
    [selectedRangeCoverage?.completed_days ?? 0, selectedRangeCampaignCoverage?.completed_days ?? 0],
    selectedRangeTotalDays
  );
  const selectedRangeIncomplete =
    Boolean(selectedRangeTotalDays) && selectedRangeCoreCompletedDays < (selectedRangeTotalDays ?? 0);
  const selectedRangeCampaignIncomplete =
    Boolean(selectedRangeTotalDays) &&
    (selectedRangeCampaignCoverage?.completed_days ?? 0) < (selectedRangeTotalDays ?? 0);
  const selectedRangeCoreReadyThroughDate = earliestReadyThroughDate([
    selectedRangeCoverage?.ready_through_date ?? null,
    selectedRangeCampaignCoverage?.ready_through_date ?? null,
  ]);
  const selectedRangeIsToday =
    Boolean(selectedStartDate && selectedEndDate && currentDateInTimezone) &&
    selectedStartDate === selectedEndDate &&
    selectedStartDate === currentDateInTimezone;
  const scopeSummaries = [
    {
      scope: "account_daily",
      states: accountDailyStates,
      fallbackCompletedDays: accountCoverage?.completed_days ?? 0,
      fallbackReadyThroughDate: accountCoverage?.ready_through_date ?? null,
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

  const historicalProgressPercent =
    historicalTotalDays > 0
      ? Math.min(100, Math.round((overallCompletedDays / historicalTotalDays) * 100))
      : 0;

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
    overallCompletedDays < historicalTotalDays &&
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
    overallCompletedDays,
    totalDays: historicalTotalDays,
    latestSyncType: latestSync?.sync_type ? String(latestSync.sync_type) : null,
  });

  const selectedRangeStillPreparing = Boolean(selectedRangeRequested && selectedRangeIncomplete);
  const overallSyncActive =
    connected &&
    accountIds.length > 0 &&
    (
      overallCompletedDays < historicalTotalDays ||
      (queueHealth?.leasedPartitions ?? 0) > 0 ||
      (queueHealth?.queueDepth ?? 0) > 0 ||
      (queueHealth?.retryableFailedPartitions ?? 0) > 0
    );
  const shouldReportSelectedRangeProgress = selectedRangeStillPreparing;
  const responseProgressPercent =
    shouldReportSelectedRangeProgress && selectedRangeTotalDays
      ? Math.min(100, Math.round((selectedRangeCoreCompletedDays / selectedRangeTotalDays) * 100))
      : historicalProgressPercent;
  const responseCompletedDays = shouldReportSelectedRangeProgress
    ? selectedRangeCoreCompletedDays
    : overallCompletedDays;
  const responseTotalDays = shouldReportSelectedRangeProgress
    ? selectedRangeTotalDays
    : historicalTotalDays;
  const responseReadyThroughDate = shouldReportSelectedRangeProgress
    ? selectedRangeCoreReadyThroughDate
    : historicalReadyThroughDate;

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
          : (legacyJobHealth?.staleRunningJobs ?? 0) > 0
            ? "stale"
            : (queueHealth?.retryableFailedPartitions ?? 0) > 0
              ? "stale"
            : overallSyncActive
              ? "syncing"
              : selectedRangeRequested && !selectedRangeIncomplete
                ? "ready"
                : !selectedRangeIncomplete && historicalProgressPercent >= 100
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
    completedDays: overallCompletedDays,
    totalDays: historicalTotalDays,
    readyThroughDate:
      [
        accountCoverage?.ready_through_date ?? null,
        campaignCoverage?.ready_through_date ?? null,
      ]
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => left.localeCompare(right))[0] ?? null,
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
      ? Boolean(selectedRangeIncomplete || selectedRangeCampaignIncomplete)
      : overallCompletedDays < historicalTotalDays,
    syncState: state,
    selectedCurrentDay: selectedRangeIsToday,
    notReadyReason: phaseLabel === "Ready" ? null : phaseLabel,
  });

  const accountSurfaceReady =
    (accountCoverage?.completed_days ?? 0) >= historicalTotalDays;
  const campaignSurfaceReady =
    (campaignCoverage?.completed_days ?? 0) >= historicalTotalDays;
  const currentAccountSurfaceUsable = selectedRangeRequested
    ? Boolean(selectedRangeTotalDays) && selectedRangeCompletedDays >= (selectedRangeTotalDays ?? 0)
    : (recentAccountCoverage?.completed_days ?? 0) >= recentWindowTotalDays;
  const currentCampaignSurfaceUsable = selectedRangeRequested
    ? Boolean(selectedRangeTotalDays) &&
      (selectedRangeCampaignCoverage?.completed_days ?? 0) >= (selectedRangeTotalDays ?? 0)
    : (recentCampaignCoverage?.completed_days ?? 0) >= recentWindowTotalDays;
  const availableSurfaces = [
    currentAccountSurfaceUsable ? "account_daily" : null,
    currentCampaignSurfaceUsable ? "campaign_daily" : null,
    (adsetCoverage?.completed_days ?? 0) >= effectiveHistoricalTotalDays ? "adset_daily" : null,
    (adDailyCoverage?.completed_days ?? 0) >= effectiveHistoricalTotalDays ? "ad_daily" : null,
    breakdownCoverageDays >= Math.min(historicalTotalDays, META_BREAKDOWN_MAX_HISTORY_DAYS) ? "breakdowns" : null,
  ].filter((value): value is string => Boolean(value));
  const surfaces = buildProviderSurfaces({
    required: [...META_CORE_REQUIRED_SURFACES, ...META_SECONDARY_SURFACES, ...META_DEEP_SURFACES],
    available: availableSurfaces,
  });
  const readinessLevel: "usable" | "partial" | "ready" =
    accountSurfaceReady && campaignSurfaceReady
      ? "ready"
      : currentAccountSurfaceUsable && currentCampaignSurfaceUsable
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
      needsBootstrap: connected && accountIds.length > 0 && overallCompletedDays < historicalTotalDays,
      warehouse: {
        rowCount: accountStats?.row_count ?? 0,
        firstDate: accountStats?.first_date ?? null,
        lastDate: accountStats?.last_date ?? null,
        coverage: {
          historical: {
            completedDays: overallCompletedDays,
            totalDays: historicalTotalDays,
            readyThroughDate: historicalReadyThroughDate,
          },
          selectedRange:
            selectedStartDate && selectedEndDate && selectedRangeTotalDays
              ? {
                  startDate: selectedStartDate,
                  endDate: selectedEndDate,
                  completedDays: selectedRangeCompletedDays,
                  totalDays: selectedRangeTotalDays,
                  readyThroughDate: selectedRangeCoverage?.ready_through_date ?? null,
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
      priorityWindow:
        selectedStartDate && selectedEndDate && selectedRangeTotalDays
          ? {
              startDate: selectedStartDate,
              endDate: selectedEndDate,
              completedDays: selectedRangeCompletedDays,
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
