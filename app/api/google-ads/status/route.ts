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
  getGoogleAdsCheckpointHealth,
  getGoogleAdsDailyCoverage,
  getGoogleAdsQueueHealth,
  getGoogleAdsSyncState,
  getLatestGoogleAdsSyncHealth,
} from "@/lib/google-ads/warehouse";
import {
  decideGoogleAdsAdvisorReadiness,
  decideGoogleAdsStatusState,
} from "@/lib/google-ads/status-machine";
import {
  buildGoogleAdsAdvisorWindows,
  countInclusiveDays,
} from "@/lib/google-ads/advisor-windows";
import { runMigrations } from "@/lib/migrations";
import {
  buildProviderSurfaces,
  decideProviderReadinessLevel,
} from "@/lib/provider-readiness";
import {
  getProviderCircuitBreakerRecoveryState,
  getProviderQuotaBudgetState,
} from "@/lib/provider-request-governance";
import {
  buildGoogleAdsLaneAdmissionPolicy,
  getGoogleAdsExtendedRecoveryBlockReason,
  isGoogleAdsExtendedCanaryBusiness,
  isGoogleAdsIncidentSafeModeEnabled,
} from "@/lib/sync/google-ads-sync";
import type {
  GoogleAdsExtendedRangeCompletion,
  GoogleAdsPanelRecoveryMode,
  GoogleAdsPanelSurfaceState,
} from "@/lib/google-ads/status-types";

function isGeneralReopenEnabled() {
  const raw = process.env.GOOGLE_ADS_EXTENDED_GENERAL_REOPEN?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

function decidePanelRecoveryMode(): GoogleAdsPanelRecoveryMode {
  if (isGoogleAdsIncidentSafeModeEnabled()) return "safe_mode";
  if (isGeneralReopenEnabled()) return "general_reopen";
  return "canary_reopen";
}

function buildPanelSurfaceState(input: {
  scope: string;
  label: string;
  completedDays: number;
  totalDays: number;
  readyThroughDate: string | null;
  latestBackgroundActivityAt: string | null;
  currentMode: GoogleAdsPanelRecoveryMode;
  canaryEligible: boolean;
}): GoogleAdsPanelSurfaceState {
  const totalDays = Math.max(1, input.totalDays);
  const completedDays = Math.max(0, Math.min(input.completedDays, totalDays));
  if (completedDays >= totalDays) {
    return {
      scope: input.scope,
      label: input.label,
      state: "ready",
      completedDays,
      totalDays,
      readyThroughDate: input.readyThroughDate,
      latestBackgroundActivityAt: input.latestBackgroundActivityAt,
      message: `${input.label} is fully available for this range.`,
    };
  }

  const base = {
    scope: input.scope,
    label: input.label,
    completedDays,
    totalDays,
    readyThroughDate: input.readyThroughDate,
    latestBackgroundActivityAt: input.latestBackgroundActivityAt,
  };
  const coverageLabel = `${completedDays}/${totalDays} days`;
  if (
    input.currentMode === "safe_mode" ||
    (input.currentMode === "canary_reopen" && !input.canaryEligible)
  ) {
    return {
      ...base,
      state: "extended_limited",
      message:
        input.currentMode === "safe_mode"
          ? `${input.label} is limited while safe mode protects core metrics. Coverage: ${coverageLabel}.`
          : `${input.label} is reopening gradually. This business is waiting for controlled extended rollout. Coverage: ${coverageLabel}.`,
    };
  }

  return {
    ...base,
    state: "extended_backfilling",
    message: input.readyThroughDate
      ? `${input.label} is backfilling in the background. Ready through ${input.readyThroughDate}. Coverage: ${coverageLabel}.`
      : `${input.label} is backfilling in the background. Coverage: ${coverageLabel}.`,
  };
}

function toRangeCompletion(input: {
  completedDays: number;
  totalDays: number;
  readyThroughDate: string | null;
}): GoogleAdsExtendedRangeCompletion {
  const totalDays = Math.max(0, input.totalDays);
  const completedDays = Math.max(0, Math.min(input.completedDays, totalDays));
  return {
    completedDays,
    totalDays,
    readyThroughDate: input.readyThroughDate,
    ready: totalDays > 0 && completedDays >= totalDays,
  };
}

function buildGoogleDomainReadiness(input: {
  availableSurfaces: string[];
  missingSurfaces: string[];
  advisorMissingSurfaces: string[];
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
      : deepSurfacesPending.length > 0 || input.advisorMissingSurfaces.length > 0
        ? "Core spend and campaign summary are ready. Advisor and deeper coverage are still syncing."
        : "Google Ads core and deep reporting surfaces are ready.";
  return {
    coreSurfacesReady,
    deepSurfacesPending,
    blockingSurfaces,
    summary,
  };
}

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

function buildAdvisorBlockingMessage(input: {
  connected: boolean;
  assignedAccountCount: number;
  deadLetterPartitions: number;
  selectedWindowMissingSurfaces: string[];
  firstSupportWindowWithMissingSurfaces:
    | {
        label: string;
        missingSurfaces: string[];
      }
    | undefined;
}) {
  if (!input.connected) return "Connect a Google Ads account to enable advisor analysis.";
  if (input.assignedAccountCount === 0) return "Assign a Google Ads account to prepare advisor inputs.";
  if (input.deadLetterPartitions > 0) return "Resolve Google Ads dead-letter partitions before running advisor analysis.";
  if (input.selectedWindowMissingSurfaces.length > 0) {
    return `Waiting for ${input.selectedWindowMissingSurfaces.join(", ")} history for the selected range.`;
  }
  if (input.firstSupportWindowWithMissingSurfaces) {
    return `Waiting for ${input.firstSupportWindowWithMissingSurfaces.label} advisor support: ${input.firstSupportWindowWithMissingSurfaces.missingSurfaces.join(", ")}.`;
  }
  return "Advisor analysis is available on demand for this date range.";
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

  const [integration, assignments, latestSync, checkpointHealth] = await Promise.all([
    getIntegration(businessId!, "google").catch(() => null),
    getProviderAccountAssignments(businessId!, "google").catch(() => null),
    getLatestGoogleAdsSyncHealth({ businessId: businessId!, providerAccountId: null }).catch(() => null),
    getGoogleAdsCheckpointHealth({ businessId: businessId!, providerAccountId: null }).catch(() => null),
  ]);
  const currentMode = decidePanelRecoveryMode();
  const canaryEligible = isGoogleAdsExtendedCanaryBusiness(businessId!);

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
  const recentExtendedStart = addDaysToIsoDate(initialBackfillEnd, -13);
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
  const [recentSearchTermCoverage, recentProductCoverage, recentAssetCoverage] =
    connected && accountIds.length > 0
      ? await Promise.all([
          getGoogleAdsDailyCoverage({
            scope: "search_term_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: recentExtendedStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getGoogleAdsDailyCoverage({
            scope: "product_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: recentExtendedStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getGoogleAdsDailyCoverage({
            scope: "asset_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: recentExtendedStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
        ])
      : [null, null, null];
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
  const [quotaBudgetState, breakerState] = await Promise.all([
    getProviderQuotaBudgetState({
      provider: "google",
      businessId: businessId!,
    }).catch(() => null),
    getProviderCircuitBreakerRecoveryState({
      provider: "google",
      businessId: businessId!,
    }).catch(() => "closed" as const),
  ]);
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
  const advisorWindowSet =
    selectedStartDate && selectedEndDate
      ? buildGoogleAdsAdvisorWindows({
          dateRange: "custom",
          customStart: selectedStartDate,
          customEnd: selectedEndDate,
        })
      : null;
  const supportWindowCoverages =
    connected && accountIds.length > 0 && advisorWindowSet
      ? await Promise.all(
          advisorWindowSet.supportWindows.map(async (window) => {
            const [campaignCoverage, searchCoverage, productCoverage] = await Promise.all([
              getGoogleAdsDailyCoverage({
                scope: "campaign_daily",
                businessId: businessId!,
                providerAccountId: null,
                startDate: window.customStart,
                endDate: window.customEnd,
              }).catch(() => null),
              getGoogleAdsDailyCoverage({
                scope: "search_term_daily",
                businessId: businessId!,
                providerAccountId: null,
                startDate: window.customStart,
                endDate: window.customEnd,
              }).catch(() => null),
              getGoogleAdsDailyCoverage({
                scope: "product_daily",
                businessId: businessId!,
                providerAccountId: null,
                startDate: window.customStart,
                endDate: window.customEnd,
              }).catch(() => null),
            ]);

            const surfaceCoverages = [
              { name: "campaign_daily", completedDays: campaignCoverage?.completed_days ?? 0 },
              { name: "search_term_daily", completedDays: searchCoverage?.completed_days ?? 0 },
              { name: "product_daily", completedDays: productCoverage?.completed_days ?? 0 },
            ];
            const missingSurfaces = surfaceCoverages
              .filter((surface) => surface.completedDays < window.days)
              .map((surface) => surface.name);

            return {
              key: window.key,
              label: window.label,
              ready: missingSurfaces.length === 0,
              startDate: window.customStart,
              endDate: window.customEnd,
              totalDays: window.days,
              missingSurfaces,
            };
          })
        )
      : [];
  const supportWindowMissingCount = supportWindowCoverages.filter((window) => !window.ready).length;
  const firstSupportWindowWithMissingSurfaces = supportWindowCoverages.find(
    (window) => window.missingSurfaces.length > 0
  );
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
  const advisorDecision = decideGoogleAdsAdvisorReadiness({
    connected,
    assignedAccountCount: accountIds.length,
    selectedRangeTotalDays,
    advisorMissingSurfaces,
    supportWindowMissingCount,
    deadLetterPartitions: queueHealth?.deadLetterPartitions ?? 0,
    historicalProgressPercent,
    selectedRangeIncomplete,
  });
  const advisorReady = advisorDecision.ready;
  const advisorNotReady = advisorDecision.notReady;
  const availableSurfaces = [
    overallAccountCompletedDays >= effectiveHistoricalTotalDays ? "account_daily" : null,
    overallCompletedDays >= effectiveHistoricalTotalDays ? "campaign_daily" : null,
    ...extendedScopeSummaries
      .filter((summary) => summary.completedDays >= summary.totalDays)
      .map((summary) => summary.scope),
  ].filter((value): value is string => Boolean(value));
  const surfaces = buildProviderSurfaces({
    required: [
      "account_daily",
      "campaign_daily",
      "search_term_daily",
      "product_daily",
      "asset_daily",
      "asset_group_daily",
      "geo_daily",
      "device_daily",
      "audience_daily",
    ],
    available: availableSurfaces,
  });
  const readinessLevel = decideProviderReadinessLevel({
    required: surfaces.required,
    available: surfaces.available,
    usable: ["account_daily", "campaign_daily"],
  });
  const domainReadiness = buildGoogleDomainReadiness({
    availableSurfaces,
    missingSurfaces: surfaces.missing,
    advisorMissingSurfaces,
  });
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
  const coreUsable =
    connected &&
    accountIds.length > 0 &&
    overallAccountCompletedDays > 0 &&
    overallCompletedDays > 0;
  const rangeCompletionBySurface = {
    search_term_daily: {
      recent: toRangeCompletion({
        completedDays: recentSearchTermCoverage?.completed_days ?? 0,
        totalDays: dayCountInclusive(recentExtendedStart, initialBackfillEnd),
        readyThroughDate: recentSearchTermCoverage?.ready_through_date ?? null,
      }),
      historical: toRangeCompletion({
        completedDays:
          extendedScopeSummaries.find((summary) => summary.scope === "search_term_daily")
            ?.completedDays ?? 0,
        totalDays:
          extendedScopeSummaries.find((summary) => summary.scope === "search_term_daily")
            ?.totalDays ?? effectiveHistoricalTotalDays,
        readyThroughDate:
          extendedScopeSummaries.find((summary) => summary.scope === "search_term_daily")
            ?.readyThroughDate ?? null,
      }),
    },
    product_daily: {
      recent: toRangeCompletion({
        completedDays: recentProductCoverage?.completed_days ?? 0,
        totalDays: dayCountInclusive(recentExtendedStart, initialBackfillEnd),
        readyThroughDate: recentProductCoverage?.ready_through_date ?? null,
      }),
      historical: toRangeCompletion({
        completedDays:
          extendedScopeSummaries.find((summary) => summary.scope === "product_daily")
            ?.completedDays ?? 0,
        totalDays:
          extendedScopeSummaries.find((summary) => summary.scope === "product_daily")
            ?.totalDays ?? effectiveHistoricalTotalDays,
        readyThroughDate:
          extendedScopeSummaries.find((summary) => summary.scope === "product_daily")
            ?.readyThroughDate ?? null,
      }),
    },
    asset_daily: {
      recent: toRangeCompletion({
        completedDays: recentAssetCoverage?.completed_days ?? 0,
        totalDays: dayCountInclusive(recentExtendedStart, initialBackfillEnd),
        readyThroughDate: recentAssetCoverage?.ready_through_date ?? null,
      }),
      historical: toRangeCompletion({
        completedDays:
          extendedScopeSummaries.find((summary) => summary.scope === "asset_daily")
            ?.completedDays ?? 0,
        totalDays:
          extendedScopeSummaries.find((summary) => summary.scope === "asset_daily")
            ?.totalDays ?? effectiveHistoricalTotalDays,
        readyThroughDate:
          extendedScopeSummaries.find((summary) => summary.scope === "asset_daily")
            ?.readyThroughDate ?? null,
      }),
    },
  } as const;
  const recentExtendedReady = Object.values(rangeCompletionBySurface).every(
    (surface) => surface.recent.ready
  );
  const historicalExtendedReady = Object.values(rangeCompletionBySurface).every(
    (surface) => surface.historical.ready
  );
  const averageRecentCompletionRatio =
    Object.values(rangeCompletionBySurface).reduce((sum, surface) => {
      const ratio =
        surface.recent.totalDays > 0
          ? surface.recent.completedDays / surface.recent.totalDays
          : 0;
      return sum + Math.min(1, ratio);
    }, 0) / Math.max(1, Object.values(rangeCompletionBySurface).length);
  const averageHistoricalCompletionRatio =
    Object.values(rangeCompletionBySurface).reduce((sum, surface) => {
      const ratio =
        surface.historical.totalDays > 0
          ? surface.historical.completedDays / surface.historical.totalDays
          : 0;
      return sum + Math.min(1, ratio);
    }, 0) / Math.max(1, Object.values(rangeCompletionBySurface).length);
  const stagedRecoveryProgressPercent = coreUsable
    ? Math.min(
        99,
        Math.round(60 + averageRecentCompletionRatio * 25 + averageHistoricalCompletionRatio * 15)
      )
    : effectiveProgressPercent;
  const displayProgressPercent =
    selectedRangeIncomplete
      ? progressPercent
      : advisorNotReady
        ? stagedRecoveryProgressPercent
        : effectiveProgressPercent;
  const majorSurfaceStates = [
    buildPanelSurfaceState({
      scope: "search_term_daily",
      label: "Search intelligence",
      completedDays: selectedSearchTermCoverage?.completed_days ?? extendedScopeSummaries.find((summary) => summary.scope === "search_term_daily")?.completedDays ?? 0,
      totalDays: selectedRangeTotalDays ?? extendedScopeSummaries.find((summary) => summary.scope === "search_term_daily")?.totalDays ?? effectiveHistoricalTotalDays,
      readyThroughDate: selectedSearchTermCoverage?.ready_through_date ?? extendedScopeSummaries.find((summary) => summary.scope === "search_term_daily")?.readyThroughDate ?? null,
      latestBackgroundActivityAt: extendedScopeSummaries.find((summary) => summary.scope === "search_term_daily")?.latestBackgroundActivityAt ?? null,
      currentMode,
      canaryEligible,
    }),
    buildPanelSurfaceState({
      scope: "product_daily",
      label: "Product performance",
      completedDays: selectedProductCoverage?.completed_days ?? extendedScopeSummaries.find((summary) => summary.scope === "product_daily")?.completedDays ?? 0,
      totalDays: selectedRangeTotalDays ?? extendedScopeSummaries.find((summary) => summary.scope === "product_daily")?.totalDays ?? effectiveHistoricalTotalDays,
      readyThroughDate: selectedProductCoverage?.ready_through_date ?? extendedScopeSummaries.find((summary) => summary.scope === "product_daily")?.readyThroughDate ?? null,
      latestBackgroundActivityAt: extendedScopeSummaries.find((summary) => summary.scope === "product_daily")?.latestBackgroundActivityAt ?? null,
      currentMode,
      canaryEligible,
    }),
    buildPanelSurfaceState({
      scope: "asset_daily",
      label: "Asset performance",
      completedDays: selectedAssetCoverage?.completed_days ?? extendedScopeSummaries.find((summary) => summary.scope === "asset_daily")?.completedDays ?? 0,
      totalDays: selectedRangeTotalDays ?? extendedScopeSummaries.find((summary) => summary.scope === "asset_daily")?.totalDays ?? effectiveHistoricalTotalDays,
      readyThroughDate: selectedAssetCoverage?.ready_through_date ?? extendedScopeSummaries.find((summary) => summary.scope === "asset_daily")?.readyThroughDate ?? null,
      latestBackgroundActivityAt: extendedScopeSummaries.find((summary) => summary.scope === "asset_daily")?.latestBackgroundActivityAt ?? null,
      currentMode,
      canaryEligible,
    }),
  ];
  const extendedLimited = majorSurfaceStates.some((surface) => surface.state !== "ready");
  const panelHeadline =
    coreUsable && extendedLimited
      ? "Core metrics are live. Extended intelligence is backfilling."
      : coreUsable
        ? "Google Ads core metrics are live."
        : connected
          ? "Google Ads core metrics are still preparing."
          : "Connect Google Ads to start loading panel data.";
  const panelDetail =
    coreUsable && extendedLimited
      ? "Search, product, and asset insights may be partial while recovery is in progress."
      : coreUsable
        ? "Campaign and advisor surfaces are ready to use."
        : "Core spend and campaign coverage must be ready before the full panel feels complete.";
  const extendedRecoveryState =
    currentMode === "safe_mode" || breakerState === "open"
      ? "core_only"
      : historicalExtendedReady
        ? "extended_normal"
        : "extended_recovery";
  const extendedRecentReadyThroughDate = Object.values(rangeCompletionBySurface)
    .map((surface) => surface.recent.readyThroughDate)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b))[0] ?? null;
  const extendedRecoveryBlockReason = getGoogleAdsExtendedRecoveryBlockReason({
    policy: buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: currentMode === "safe_mode",
      workerHealthy:
        runningJobs > 0 ||
        (queueHealth?.leasedPartitions ?? 0) > 0 ||
        (queueHealth?.extendedRecentLeasedPartitions ?? 0) > 0,
      workerCapacityAvailable: true,
      breakerOpen: breakerState === "open",
      queueDepth: queueHealth?.queueDepth ?? 0,
      extendedQueueDepth: queueHealth?.extendedQueueDepth ?? 0,
      maintenanceQueueDepth: queueHealth?.maintenanceQueueDepth ?? 0,
      quotaPressure: quotaBudgetState?.pressure ?? 0,
      maintenanceBudgetAllowed: quotaBudgetState?.maintenanceAllowed ?? true,
      extendedBudgetAllowed: quotaBudgetState?.extendedAllowed ?? false,
      extendedCanaryEligible: canaryEligible || currentMode === "general_reopen",
      recoveryMode: breakerState,
    }),
    queueHealth,
  });

  return NextResponse.json({
    state: decideGoogleAdsStatusState({
      connected,
      assignedAccountCount: accountIds.length,
      historicalQueuePaused,
      deadLetterPartitions: queueHealth?.deadLetterPartitions ?? 0,
      latestSyncStatus: effectiveLatestSync?.status ? String(effectiveLatestSync.status) : null,
      runningJobs,
      staleRunningJobs,
      selectedRangeIncomplete,
      historicalProgressPercent,
      needsBootstrap,
      productPendingSurfaces,
      selectedRangeTotalDays,
      advisorMissingSurfaces,
      supportWindowMissingCount,
      advisorNotReady,
    }),
    connected,
    readinessLevel,
    surfaces,
    checkpointHealth: checkpointHealth ?? null,
    domainReadiness,
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
      blockingMessage: buildAdvisorBlockingMessage({
        connected,
        assignedAccountCount: accountIds.length,
        deadLetterPartitions: queueHealth?.deadLetterPartitions ?? 0,
        selectedWindowMissingSurfaces: advisorMissingSurfaces,
        firstSupportWindowWithMissingSurfaces,
      }),
      selectedWindow:
        advisorWindowSet && selectedStartDate && selectedEndDate
          ? {
              label: advisorWindowSet.selectedWindow.label,
              ready: advisorMissingSurfaces.length === 0,
              startDate: selectedStartDate,
              endDate: selectedEndDate,
              totalDays: countInclusiveDays(selectedStartDate, selectedEndDate),
              missingSurfaces: advisorMissingSurfaces,
            }
          : null,
      supportWindows: supportWindowCoverages,
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
      extendedRecentQueueDepth: queueHealth?.extendedRecentQueueDepth ?? 0,
      extendedRecentLeasedPartitions: queueHealth?.extendedRecentLeasedPartitions ?? 0,
      extendedHistoricalQueueDepth: queueHealth?.extendedHistoricalQueueDepth ?? 0,
      extendedHistoricalLeasedPartitions: queueHealth?.extendedHistoricalLeasedPartitions ?? 0,
      maintenanceQueueDepth: queueHealth?.maintenanceQueueDepth ?? 0,
      maintenanceLeasedPartitions: queueHealth?.maintenanceLeasedPartitions ?? 0,
      deadLetterPartitions: queueHealth?.deadLetterPartitions ?? 0,
      oldestQueuedPartition: queueHealth?.oldestQueuedPartition ?? null,
    },
    priorityWindow,
    operations: {
      currentMode,
      canaryEligible,
      quotaPressure: quotaBudgetState?.pressure ?? 0,
      breakerState,
      extendedRecoveryBlockReason,
    },
    panel: {
      coreUsable,
      extendedLimited,
      recentExtendedUsable: recentExtendedReady,
      headline: panelHeadline,
      detail: panelDetail,
      surfaceStates: majorSurfaceStates,
    },
    extendedRecoveryState,
    recentExtendedReady,
    historicalExtendedReady,
    extendedRecentReadyThroughDate,
    rangeCompletionBySurface,
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
          progressPercent: displayProgressPercent,
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
          progressPercent: displayProgressPercent,
          completedDays: effectiveCompletedDays,
          totalDays: effectiveTotalDays,
          readyThroughDate: effectiveReadyThroughDate,
          phaseLabel: advisorNotReady ? "Preparing advisor support" : phaseLabel,
        },
  });
}
