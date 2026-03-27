import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getDb } from "@/lib/db";
import { getIntegration } from "@/lib/integrations";
import { readProviderAccountSnapshot } from "@/lib/provider-account-snapshots";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import {
  GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS,
  addDaysToIsoDate,
  dayCountInclusive,
  getHistoricalWindowStart,
} from "@/lib/google-ads/history";
import {
  getGoogleAdsDailyCoverage,
  getGoogleAdsQueueHealth,
  getGoogleAdsSyncState,
  getLatestGoogleAdsSyncHealth,
} from "@/lib/google-ads/warehouse";
import { runMigrations } from "@/lib/migrations";

function getTodayIsoForTimeZoneServer(timeZone: string) {
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

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const businessId = url.searchParams.get("businessId");
  const selectedStartDate = url.searchParams.get("startDate");
  const selectedEndDate = url.searchParams.get("endDate");

  const access = await requireBusinessAccess({ request, businessId });
  if ("error" in access) return access.error;

  await runMigrations();
  const sql = getDb();

  const [integration, assignments, latestSync] = await Promise.all([
    getIntegration(businessId!, "google").catch(() => null),
    getProviderAccountAssignments(businessId!, "google").catch(() => null),
    getLatestGoogleAdsSyncHealth({ businessId: businessId!, providerAccountId: null }).catch(() => null),
  ]);

  const accountIds = assignments?.account_ids ?? [];
  const connected = Boolean(integration?.status === "connected" && integration?.access_token);

  const [warehouseStatsRows] = (await Promise.all([
    sql`
      SELECT
        COUNT(*) AS row_count,
        MIN(date) AS first_date,
        MAX(date) AS last_date,
        COALESCE(MAX(account_timezone), 'UTC') AS primary_account_timezone
      FROM google_ads_account_daily
      WHERE business_id = ${businessId!}
        AND (${accountIds.length > 0 ? accountIds : null}::text[] IS NULL OR provider_account_id = ANY(${accountIds.length > 0 ? accountIds : null}::text[]))
    `,
  ])) as [Array<Record<string, unknown>>];
  const effectiveLatestSync = latestSync;
  const warehouseStats = warehouseStatsRows[0] as
    | {
        row_count?: string | number | null;
        first_date?: string | null;
        last_date?: string | null;
        primary_account_timezone?: string | null;
      }
    | undefined;
  const snapshot = await readProviderAccountSnapshot({
    businessId: businessId!,
    provider: "google",
  }).catch(() => null);
  const primaryAccountTimezone =
    snapshot?.accounts.find((account) => account.id === accountIds[0])?.timezone ??
    warehouseStats?.primary_account_timezone ??
    "UTC";
  const currentDateInTimezone = getTodayIsoForTimeZoneServer(primaryAccountTimezone);
  const initialBackfillEnd = addDaysToIsoDate(currentDateInTimezone, -1);
  const initialBackfillStart = getHistoricalWindowStart(
    initialBackfillEnd,
    GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS
  );
  const totalDays = dayCountInclusive(initialBackfillStart, initialBackfillEnd);

  const [accountCoverage, campaignCoverage] =
    connected && accountIds.length > 0
      ? await Promise.all([
          getGoogleAdsDailyCoverage({
            scope: "account_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: initialBackfillStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getGoogleAdsDailyCoverage({
            scope: "campaign_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: initialBackfillStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
        ])
      : [null, null];
  const [
    selectedSearchTermCoverage,
    selectedProductCoverage,
    selectedAssetCoverage,
    selectedAssetGroupCoverage,
    selectedGeoCoverage,
    selectedDeviceCoverage,
    selectedAudienceCoverage,
  ] =
    connected && accountIds.length > 0 && selectedStartDate && selectedEndDate
      ? await Promise.all([
          getGoogleAdsDailyCoverage({
            scope: "search_term_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
          }).catch(() => null),
          getGoogleAdsDailyCoverage({
            scope: "product_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
          }).catch(() => null),
          getGoogleAdsDailyCoverage({
            scope: "asset_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
          }).catch(() => null),
          getGoogleAdsDailyCoverage({
            scope: "asset_group_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
          }).catch(() => null),
          getGoogleAdsDailyCoverage({
            scope: "geo_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
          }).catch(() => null),
          getGoogleAdsDailyCoverage({
            scope: "device_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
          }).catch(() => null),
          getGoogleAdsDailyCoverage({
            scope: "audience_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
          }).catch(() => null),
        ])
      : [null, null, null, null, null, null, null];
  const allStateScopes = [
    "account_daily",
    "campaign_daily",
    "search_term_daily",
    "product_daily",
    "asset_group_daily",
    "asset_daily",
    "geo_daily",
    "device_daily",
    "audience_daily",
  ] as const;
  const [queueHealth, ...scopeStates] =
    connected && accountIds.length > 0
      ? await Promise.all([
          getGoogleAdsQueueHealth({ businessId: businessId! }).catch(() => null),
          ...allStateScopes.map((scope) =>
            getGoogleAdsSyncState({
              businessId: businessId!,
              scope,
            }).catch(() => [])
          ),
        ])
      : [null, ...allStateScopes.map(() => [])];
  const statesByScope = Object.fromEntries(
    allStateScopes.map((scope, index) => [scope, scopeStates[index] ?? []])
  ) as Record<
    typeof allStateScopes[number],
    Awaited<ReturnType<typeof getGoogleAdsSyncState>>
  >;
  const selectedRangeCoverage =
    connected && accountIds.length > 0 && selectedStartDate && selectedEndDate
      ? await getGoogleAdsDailyCoverage({
          scope: "campaign_daily",
          businessId: businessId!,
          providerAccountId: null,
          startDate: selectedStartDate,
          endDate: selectedEndDate,
        }).catch(() => null)
      : null;

  const accountCoverageDays = accountCoverage?.completed_days ?? 0;
  const campaignCoverageDays = campaignCoverage?.completed_days ?? 0;
  const relevantCampaignStates = statesByScope.campaign_daily.filter((row) =>
    accountIds.length === 0 ? true : accountIds.includes(row.providerAccountId)
  );
  const relevantAccountStates = statesByScope.account_daily.filter((row) =>
    accountIds.length === 0 ? true : accountIds.includes(row.providerAccountId)
  );
  const effectiveHistoricalTotalDays =
    relevantCampaignStates.length > 0
      ? Math.max(
          1,
          Math.min(
            ...relevantCampaignStates.map((row) =>
              dayCountInclusive(row.effectiveTargetStart, row.effectiveTargetEnd)
            )
          )
        )
      : totalDays;
  const overallCompletedDays =
    relevantCampaignStates.length > 0
      ? Math.min(...relevantCampaignStates.map((row) => row.completedDays))
      : campaignCoverageDays;
  const overallAccountCompletedDays =
    relevantAccountStates.length > 0
      ? Math.min(...relevantAccountStates.map((row) => row.completedDays))
      : accountCoverageDays;
  const historicalReadyThroughDate =
    relevantCampaignStates.length > 0
      ? relevantCampaignStates
          .map((row) => row.readyThroughDate)
          .filter((value): value is string => Boolean(value))
          .sort((a, b) => a.localeCompare(b))[0] ?? campaignCoverage?.ready_through_date ?? null
      : campaignCoverage?.ready_through_date ?? null;
  const extendedScopeSummaries = allStateScopes
    .filter((scope) => scope !== "account_daily" && scope !== "campaign_daily")
    .map((scope) => {
      const relevantStates = statesByScope[scope].filter((row) =>
        accountIds.length === 0 ? true : accountIds.includes(row.providerAccountId)
      );
      const totalDaysForScope =
        relevantStates.length > 0
          ? Math.max(
              1,
              Math.min(
                ...relevantStates.map((row) =>
                  dayCountInclusive(row.effectiveTargetStart, row.effectiveTargetEnd)
                )
              )
            )
          : effectiveHistoricalTotalDays;
      return {
        scope,
        completedDays:
          relevantStates.length > 0
            ? Math.min(...relevantStates.map((row) => row.completedDays))
            : 0,
        totalDays: totalDaysForScope,
        readyThroughDate:
          relevantStates
            .map((row) => row.readyThroughDate)
            .filter((value): value is string => Boolean(value))
            .sort((a, b) => a.localeCompare(b))[0] ?? null,
        latestBackgroundActivityAt:
          relevantStates
            .map((row) => row.latestBackgroundActivityAt)
            .filter((value): value is string => Boolean(value))
            .sort((a, b) => b.localeCompare(a))[0] ?? null,
        deadLetterCount:
          relevantStates.length > 0
            ? Math.max(...relevantStates.map((row) => row.deadLetterCount))
            : 0,
      };
    });
  const extendedPendingSurfaces = extendedScopeSummaries
    .filter((summary) => summary.completedDays < summary.totalDays)
    .map((summary) => summary.scope);
  const productPendingSurfaces = [
    overallAccountCompletedDays < effectiveHistoricalTotalDays ? "account_daily" : null,
    overallCompletedDays < effectiveHistoricalTotalDays ? "campaign_daily" : null,
  ].filter((value): value is string => Boolean(value));
  const needsBootstrap =
    connected &&
    accountIds.length > 0 &&
    overallCompletedDays < effectiveHistoricalTotalDays;
  const historicalProgressPercent =
    effectiveHistoricalTotalDays > 0
      ? Math.min(100, Math.round((overallCompletedDays / effectiveHistoricalTotalDays) * 100))
      : 0;
  const selectedRangeTotalDays =
    selectedStartDate && selectedEndDate
      ? dayCountInclusive(selectedStartDate, selectedEndDate)
      : null;
  const selectedRangeCompletedDays = selectedRangeCoverage?.completed_days ?? 0;
  const selectedRangeProgressPercent =
    selectedRangeTotalDays && selectedRangeTotalDays > 0
      ? Math.min(100, Math.round((selectedRangeCompletedDays / selectedRangeTotalDays) * 100))
      : null;
  const selectedRangeIncomplete =
    Boolean(selectedRangeTotalDays) &&
    selectedRangeCompletedDays < (selectedRangeTotalDays ?? 0);
  const backgroundRunningJobs = Number(queueHealth?.leasedPartitions ?? 0);
  const priorityRunningJobs = 0;
  const staleBackgroundJobs = 0;
  const stalePriorityJobs = 0;
  const legacyRuntimeJobs = 0;
  const latestBackgroundActivityAt = queueHealth?.latestCoreActivityAt ?? null;
  const latestPriorityActivityAt = null;
  const runningJobs = backgroundRunningJobs;
  const staleRunningJobs = 0;
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
    overallCompletedDays < effectiveHistoricalTotalDays &&
    backgroundRunningJobs === 0 &&
    !backgroundRecentlyActive;
  const priorityWindow =
    selectedStartDate && selectedEndDate && selectedRangeTotalDays
      ? {
          startDate: selectedStartDate,
          endDate: selectedEndDate,
          completedDays: selectedRangeCompletedDays,
          totalDays: selectedRangeTotalDays,
          isActive:
            selectedRangeIncomplete &&
            (priorityRunningJobs > 0 ||
              (latestPriorityActivityAt != null &&
                Date.now() - new Date(String(latestPriorityActivityAt)).getTime() < 10 * 60 * 1000)),
        }
      : null;
  const phaseLabel = selectedRangeIncomplete
    ? "Preparing selected dates"
    : historicalQueuePaused
      ? "Historical sync is paused"
    : overallCompletedDays < effectiveHistoricalTotalDays
      ? "Backfilling historical data"
      : effectiveLatestSync?.sync_type === "incremental_recent" ||
          effectiveLatestSync?.sync_type === "today_refresh"
        ? "Syncing recent history"
        : "Ready";
  const progressPercent = selectedRangeIncomplete
    ? selectedRangeProgressPercent ?? historicalProgressPercent
    : historicalProgressPercent;
  const latestError = effectiveLatestSync?.last_error ? String(effectiveLatestSync.last_error) : null;

  const advisorRequiredSurfaces = [
    {
      name: "campaign_daily",
      coverage: selectedRangeCoverage,
    },
    {
      name: "search_term_daily",
      coverage: selectedSearchTermCoverage,
    },
    {
      name: "product_daily",
      coverage: selectedProductCoverage,
    },
  ];
  const advisorOptionalSurfaces = [
    {
      name: "asset_daily",
      coverage: selectedAssetCoverage,
    },
    {
      name: "asset_group_daily",
      coverage: selectedAssetGroupCoverage,
    },
    {
      name: "geo_daily",
      coverage: selectedGeoCoverage,
    },
    {
      name: "device_daily",
      coverage: selectedDeviceCoverage,
    },
    {
      name: "audience_daily",
      coverage: selectedAudienceCoverage,
    },
  ];
  const advisorAvailableSurfaces = [
    ...advisorRequiredSurfaces,
    ...advisorOptionalSurfaces,
  ]
    .filter(
      (entry) =>
        selectedRangeTotalDays != null &&
        (entry.coverage?.completed_days ?? 0) >= selectedRangeTotalDays
    )
    .map((entry) => entry.name);
  const advisorMissingSurfaces = advisorRequiredSurfaces
    .filter(
      (entry) =>
        selectedRangeTotalDays != null &&
        (entry.coverage?.completed_days ?? 0) < selectedRangeTotalDays
    )
    .map((entry) => entry.name);
  const advisorCompletedDays =
    selectedRangeTotalDays != null
      ? Math.min(
          ...advisorRequiredSurfaces.map((entry) => entry.coverage?.completed_days ?? 0)
        )
      : null;
  const advisorReadyThroughDate =
    advisorRequiredSurfaces
      .map((entry) => entry.coverage?.ready_through_date)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => a.localeCompare(b))[0] ?? null;
  const advisorReady =
    connected &&
    accountIds.length > 0 &&
    selectedRangeTotalDays != null &&
    advisorMissingSurfaces.length === 0;
  const advisorNotReady =
    connected &&
    accountIds.length > 0 &&
    selectedRangeTotalDays != null &&
    !selectedRangeIncomplete &&
    historicalProgressPercent >= 100 &&
    !advisorReady;
  const effectiveCompletedDays = selectedRangeIncomplete
    ? selectedRangeCompletedDays
    : advisorNotReady
      ? advisorCompletedDays ?? overallCompletedDays
      : overallCompletedDays;
  const effectiveTotalDays = selectedRangeIncomplete
    ? selectedRangeTotalDays ?? effectiveHistoricalTotalDays
    : advisorNotReady
      ? selectedRangeTotalDays ?? effectiveHistoricalTotalDays
      : effectiveHistoricalTotalDays;
  const effectiveReadyThroughDate = selectedRangeIncomplete
    ? selectedRangeCoverage?.ready_through_date ?? null
    : advisorNotReady
      ? advisorReadyThroughDate
      : historicalReadyThroughDate;
  const effectiveProgressPercent =
    effectiveTotalDays > 0
      ? Math.min(100, Math.round(((effectiveCompletedDays ?? 0) / effectiveTotalDays) * 100))
      : progressPercent;

  return NextResponse.json({
    state:
      !connected
        ? "not_connected"
        : accountIds.length === 0
          ? "connected_no_assignment"
          : historicalQueuePaused
            ? "paused"
            : (queueHealth?.deadLetterPartitions ?? 0) > 0
              ? "action_required"
              : effectiveLatestSync?.status === "failed" && !runningJobs
                ? "action_required"
                : staleRunningJobs > 0
                  ? "stale"
                  : advisorNotReady
                    ? "advisor_not_ready"
                    : !selectedRangeIncomplete && historicalProgressPercent >= 100
                      ? "ready"
                      : effectiveLatestSync?.status === "running" ||
                            runningJobs > 0 ||
                            needsBootstrap ||
                            selectedRangeIncomplete
                        ? "syncing"
                        : productPendingSurfaces.length > 0
                          ? "partial"
                          : "ready",
    connected,
    assignedAccountIds: accountIds,
    primaryAccountTimezone,
    currentDateInTimezone,
    needsBootstrap,
    warehouse: {
      rowCount: Number(warehouseStats?.row_count ?? 0),
      firstDate: warehouseStats?.first_date ?? null,
      lastDate: warehouseStats?.last_date ?? null,
      coverage: {
        historical: {
          completedDays: overallCompletedDays,
          totalDays: effectiveHistoricalTotalDays,
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
        accountDaily: {
          completedDays: overallAccountCompletedDays,
          totalDays: effectiveHistoricalTotalDays,
          readyThroughDate:
            relevantAccountStates
              .map((row) => row.readyThroughDate)
              .filter((value): value is string => Boolean(value))
              .sort((a, b) => a.localeCompare(b))[0] ?? accountCoverage?.ready_through_date ?? null,
        },
        campaignDaily: {
          completedDays: overallCompletedDays,
          totalDays: effectiveHistoricalTotalDays,
          readyThroughDate: historicalReadyThroughDate,
        },
        scopes: extendedScopeSummaries,
        pendingSurfaces: productPendingSurfaces,
      },
    },
    advisor: {
      ready: advisorReady,
      requiredSurfaces: advisorRequiredSurfaces.map((entry) => entry.name),
      availableSurfaces: advisorAvailableSurfaces,
      missingSurfaces: advisorMissingSurfaces,
      readyRangeStart: advisorReady ? selectedStartDate : null,
      readyRangeEnd: advisorReady ? selectedEndDate : null,
    },
    jobHealth: {
      runningJobs,
      staleRunningJobs,
      backgroundRunningJobs,
      priorityRunningJobs,
      legacyRuntimeJobs,
      queueDepth: queueHealth?.queueDepth ?? 0,
      leasedPartitions: queueHealth?.leasedPartitions ?? 0,
      coreQueueDepth: queueHealth?.coreQueueDepth ?? 0,
      coreLeasedPartitions: queueHealth?.coreLeasedPartitions ?? 0,
      extendedQueueDepth: queueHealth?.extendedQueueDepth ?? 0,
      extendedLeasedPartitions: queueHealth?.extendedLeasedPartitions ?? 0,
      maintenanceQueueDepth: queueHealth?.maintenanceQueueDepth ?? 0,
      maintenanceLeasedPartitions: queueHealth?.maintenanceLeasedPartitions ?? 0,
      deadLetterPartitions: queueHealth?.deadLetterPartitions ?? 0,
      oldestQueuedPartition: queueHealth?.oldestQueuedPartition ?? null,
    },
    priorityWindow,
    latestSync: effectiveLatestSync
      ? {
          id: effectiveLatestSync.id ? String(effectiveLatestSync.id) : null,
          status: effectiveLatestSync.status ? String(effectiveLatestSync.status) : undefined,
          syncType: effectiveLatestSync.sync_type ? String(effectiveLatestSync.sync_type) : null,
          scope: effectiveLatestSync.scope ? String(effectiveLatestSync.scope) : null,
          startDate: effectiveLatestSync.start_date ? String(effectiveLatestSync.start_date).slice(0, 10) : null,
          endDate: effectiveLatestSync.end_date ? String(effectiveLatestSync.end_date).slice(0, 10) : null,
          triggerSource: effectiveLatestSync.trigger_source ? String(effectiveLatestSync.trigger_source) : null,
          triggeredAt: effectiveLatestSync.triggered_at ? String(effectiveLatestSync.triggered_at) : null,
          startedAt: effectiveLatestSync.started_at ? String(effectiveLatestSync.started_at) : null,
          finishedAt: effectiveLatestSync.finished_at ? String(effectiveLatestSync.finished_at) : null,
          lastError: latestError,
          progressPercent: effectiveProgressPercent,
          completedDays: effectiveCompletedDays,
          totalDays: effectiveTotalDays,
          readyThroughDate: effectiveReadyThroughDate,
          phaseLabel:
            advisorNotReady
              ? "Preparing advisor support"
              : phaseLabel === "Ready"
              ? null
              : selectedRangeIncomplete
                ? phaseLabel
                : phaseLabel,
        }
      : {
          progressPercent: effectiveProgressPercent,
          completedDays: effectiveCompletedDays,
          totalDays: effectiveTotalDays,
          readyThroughDate: effectiveReadyThroughDate,
          phaseLabel: advisorNotReady ? "Preparing advisor support" : phaseLabel,
        },
  });
}
