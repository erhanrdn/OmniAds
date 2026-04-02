import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getDb } from "@/lib/db";
import { getIntegrationMetadata } from "@/lib/integrations";
import { readProviderAccountSnapshot } from "@/lib/provider-account-snapshots";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import {
  GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS,
  addDaysToIsoDate,
  dayCountInclusive,
  getHistoricalWindowStart,
} from "@/lib/google-ads/history";
import { buildGoogleAdsCoreReadiness } from "@/lib/google-ads/core-readiness";
import {
  getGoogleAdsCheckpointHealth,
  getGoogleAdsCoveredDates,
  getGoogleAdsDailyCoverage,
  getGoogleAdsAdvisorQueueHealth,
  getGoogleAdsQueueHealth,
  getGoogleAdsSyncState,
  getLatestGoogleAdsSyncHealth,
} from "@/lib/google-ads/warehouse";
import {
  decideGoogleAdsAdvisorReadiness,
  decideGoogleAdsFullSyncPriority,
  decideGoogleAdsStatusState,
} from "@/lib/google-ads/status-machine";
import { countInclusiveDays } from "@/lib/google-ads/advisor-windows";
import {
  getLatestGoogleAdsAdvisorSnapshot,
  isGoogleAdsAdvisorSnapshotFresh,
} from "@/lib/google-ads/advisor-snapshots";
import { buildGoogleAdsAdvisorProgress } from "@/lib/google-ads/advisor-progress";
import { runMigrations } from "@/lib/migrations";
import {
  buildProviderStateContract,
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
  getGoogleAdsWorkerSchedulingState,
  isGoogleAdsExtendedCanaryBusiness,
  isGoogleAdsIncidentSafeModeEnabled,
} from "@/lib/sync/google-ads-sync";
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

async function readGoogleAdsStatusCoverage(input: {
  businessId: string;
  scope: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
  timeoutMs?: number;
}) {
  const queryStartedAt = Date.now();
  try {
    return await getGoogleAdsDailyCoverage({
      scope: input.scope as Parameters<typeof getGoogleAdsDailyCoverage>[0]["scope"],
      businessId: input.businessId,
      providerAccountId: input.providerAccountId ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      timeoutMs: input.timeoutMs,
    });
  } catch (error) {
    const primaryMessage = error instanceof Error ? error.message : String(error);
    console.warn("[google-ads-status] coverage-primary-failed", {
      scope: input.scope,
      startDate: input.startDate,
      endDate: input.endDate,
      durationMs: Date.now() - queryStartedAt,
      error: primaryMessage,
    });

    const fallbackStartedAt = Date.now();
    try {
      const dates = await getGoogleAdsCoveredDates({
        scope: input.scope as Parameters<typeof getGoogleAdsCoveredDates>[0]["scope"],
        businessId: input.businessId,
        providerAccountId: input.providerAccountId ?? null,
        startDate: input.startDate,
        endDate: input.endDate,
        timeoutMs: input.timeoutMs,
      });
      const lastReadyDate = [...dates].sort((a, b) => a.localeCompare(b)).at(-1) ?? null;
      console.warn("[google-ads-status] coverage-fallback-succeeded", {
        scope: input.scope,
        startDate: input.startDate,
        endDate: input.endDate,
        durationMs: Date.now() - fallbackStartedAt,
        completedDays: dates.length,
        primaryError: primaryMessage,
      });
      return {
        completed_days: dates.length,
        ready_through_date: lastReadyDate,
        latest_updated_at: null,
        total_rows: 0,
      };
    } catch (fallbackError) {
      console.warn("[google-ads-status] coverage-fallback-failed", {
        scope: input.scope,
        startDate: input.startDate,
        endDate: input.endDate,
        durationMs: Date.now() - fallbackStartedAt,
        primaryError: primaryMessage,
        fallbackError:
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      return null;
    }
  }
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

function getCurrentRuntimeBuildId() {
  return (
    process.env.APP_BUILD_ID?.trim() ||
    process.env.NEXT_BUILD_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
    process.env.RENDER_GIT_COMMIT?.trim() ||
    "dev-build"
  );
}

function summarizeStatusDegradedReason(reasons: string[]) {
  if (reasons.length === 0) return null;
  if (reasons.length === 1) return `Analysis status is degraded: ${reasons[0]}.`;
  return `Analysis status is degraded: ${reasons.slice(0, 2).join("; ")}.`;
}

function buildAdvisorBlockingMessage(input: {
  connected: boolean;
  assignedAccountCount: number;
  advisorRelevantDeadLetterPartitions: number;
  advisorRelevantFailedPartitions: number;
  advisorRelevantUnhealthyLeases: number;
  recent90MissingSurfaces: string[];
  snapshotAvailable: boolean;
  snapshotFresh: boolean;
}) {
  if (!input.connected) return "Connect a Google Ads account to enable advisor analysis.";
  if (input.assignedAccountCount === 0) return "Assign a Google Ads account to prepare advisor inputs.";
  if (input.snapshotAvailable) {
    return input.snapshotFresh
      ? "Advisor snapshot is ready."
      : "Advisor snapshot is available but waiting for its next backend refresh.";
  }
  if (
    input.advisorRelevantDeadLetterPartitions > 0 ||
    input.advisorRelevantFailedPartitions > 0
  ) {
    return "Resolve Google Ads dead-letter partitions before generating the advisor snapshot.";
  }
  if (input.advisorRelevantUnhealthyLeases > 0) {
    return "Recent Google Ads recovery work is still active. Analysis will unlock automatically once it settles.";
  }
  if (input.recent90MissingSurfaces.length > 0) {
    return `Waiting for recent 90-day coverage in ${input.recent90MissingSurfaces.join(", ")} before generating the advisor snapshot.`;
  }
  return "Advisor snapshot can be generated as soon as you request a refresh.";
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
  const statusDegradedReasons: string[] = [];
  const captureOptional = async <T,>(
    label: string,
    promise: Promise<T>,
    fallback: T
  ): Promise<T> => {
    try {
      return await promise;
    } catch (error) {
      statusDegradedReasons.push(
        `${label}: ${error instanceof Error ? error.message : String(error)}`
      );
      return fallback;
    }
  };

  const staleRunPressurePromise = sql`
    SELECT COUNT(*)::int AS stale_run_pressure
    FROM google_ads_sync_runs run
    WHERE run.business_id = ${businessId!}
      AND run.error_class = 'stale_run'
      AND run.updated_at > now() - interval '24 hours'
  ` as Promise<Array<{ stale_run_pressure?: number | string | null }>>;
  const recentRepairRowsPromise = sql`
    SELECT
      scope,
      COUNT(*) FILTER (WHERE status = 'queued')::int AS queued_count,
      COUNT(*) FILTER (WHERE status = 'leased')::int AS leased_count,
      COUNT(*) FILTER (WHERE status = 'running')::int AS running_count,
      COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded_count,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
      MAX(updated_at)::text AS latest_attempt_at
    FROM google_ads_sync_partitions
    WHERE business_id = ${businessId!}
      AND lane = 'extended'
      AND source = 'recent_recovery'
      AND scope IN ('search_term_daily', 'product_daily', 'asset_daily')
    GROUP BY scope
  ` as Promise<Array<{
    scope?: string | null;
    queued_count?: number | string | null;
    leased_count?: number | string | null;
    running_count?: number | string | null;
    succeeded_count?: number | string | null;
    failed_count?: number | string | null;
    cancelled_count?: number | string | null;
    latest_attempt_at?: string | null;
  }>>;
  const recentRepairAttemptRowsPromise = sql`
    SELECT DISTINCT ON (scope)
      scope,
      trigger_source,
      status,
      error_message,
      finished_at,
      updated_at
    FROM google_ads_sync_runs
    WHERE business_id = ${businessId!}
      AND trigger_source LIKE 'auto_recent_repair:%'
      AND scope IN ('search_term_daily', 'product_daily', 'asset_daily')
    ORDER BY scope, updated_at DESC
  ` as Promise<Array<{
    scope?: string | null;
    trigger_source?: string | null;
    status?: string | null;
    error_message?: string | null;
    finished_at?: string | null;
    updated_at?: string | null;
  }>>;

  const [integration, assignments, latestSync, checkpointHealth, workerSchedulingState, staleRunRows, recentRepairRows, recentRepairAttemptRows] =
    await Promise.all([
    captureOptional("integration", getIntegrationMetadata(businessId!, "google"), null),
    captureOptional(
      "provider_account_assignments",
      getProviderAccountAssignments(businessId!, "google"),
      null
    ),
    captureOptional(
      "latest_sync_health",
      getLatestGoogleAdsSyncHealth({ businessId: businessId!, providerAccountId: null }),
      null
    ),
    captureOptional(
      "checkpoint_health",
      getGoogleAdsCheckpointHealth({ businessId: businessId!, providerAccountId: null }),
      null
    ),
    captureOptional(
      "worker_scheduling_state",
      getGoogleAdsWorkerSchedulingState({ businessId: businessId! }),
      null
    ),
    staleRunPressurePromise.catch(() => []),
    recentRepairRowsPromise.catch(() => []),
    recentRepairAttemptRowsPromise.catch(() => []),
  ]);
  const currentMode = decidePanelRecoveryMode();
  const canaryEligible = isGoogleAdsExtendedCanaryBusiness(businessId!);
  const effectiveLatestSync = latestSync;
  const lastTargetedRepair =
    effectiveLatestSync?.trigger_source &&
    String(effectiveLatestSync.trigger_source).startsWith("manual_targeted_repair:")
      ? {
          scope: effectiveLatestSync.scope ? String(effectiveLatestSync.scope) : null,
          triggerSource: String(effectiveLatestSync.trigger_source),
          finishedAt: effectiveLatestSync.finished_at ? String(effectiveLatestSync.finished_at) : null,
          status: effectiveLatestSync.status ? String(effectiveLatestSync.status) : null,
          lastError: effectiveLatestSync.last_error ? String(effectiveLatestSync.last_error) : null,
        }
      : null;
  const lastAutoRepair =
    effectiveLatestSync?.trigger_source &&
    String(effectiveLatestSync.trigger_source).startsWith("auto_recent_repair:")
      ? {
          scope: effectiveLatestSync.scope ? String(effectiveLatestSync.scope) : null,
          triggerSource: String(effectiveLatestSync.trigger_source),
          finishedAt: effectiveLatestSync.finished_at ? String(effectiveLatestSync.finished_at) : null,
          status: effectiveLatestSync.status ? String(effectiveLatestSync.status) : null,
          lastError: effectiveLatestSync.last_error ? String(effectiveLatestSync.last_error) : null,
        }
      : null;
  const currentRuntimeBuildId = getCurrentRuntimeBuildId();
  const workerBuildId =
    workerSchedulingState?.workerMeta?.workerBuildId != null
      ? String(workerSchedulingState.workerMeta.workerBuildId)
      : null;
  const workerStartedAt =
    workerSchedulingState?.workerMeta?.workerStartedAt != null
      ? String(workerSchedulingState.workerMeta.workerStartedAt)
      : null;
  const workerFreshnessState = workerSchedulingState?.workerFreshnessState ?? null;
  const currentWorkerBusinessId = workerSchedulingState?.currentBusinessId ?? null;
  const workerBatchBusinessIds = Array.isArray(workerSchedulingState?.batchBusinessIds)
    ? workerSchedulingState.batchBusinessIds.map((value) => String(value))
    : [];
  const currentConsumeStage = workerSchedulingState?.consumeStage ?? null;
  const lastConsumedBusinessId = workerSchedulingState?.lastConsumedBusinessId ?? null;
  const runtimeMismatchDetected =
    workerBuildId != null && workerBuildId !== currentRuntimeBuildId;
  const lastConsumeAttemptAt =
    workerSchedulingState?.workerMeta?.consumeStartedAt != null
      ? String(workerSchedulingState.workerMeta.consumeStartedAt)
      : null;
  const lastConsumeOutcome =
    workerSchedulingState?.workerMeta?.consumeOutcome != null
      ? String(workerSchedulingState.workerMeta.consumeOutcome)
      : null;
  const lastLeaseAcquiredAt =
    workerSchedulingState?.workerMeta?.lastLeaseAcquiredAt != null
      ? String(workerSchedulingState.workerMeta.lastLeaseAcquiredAt)
      : null;
  const lastProgressAt =
    workerSchedulingState?.workerMeta?.consumeFinishedAt != null
      ? String(workerSchedulingState.workerMeta.consumeFinishedAt)
      : null;
  const lastConsumeFinishedAt = lastProgressAt;
  const lastFailureReason =
    workerSchedulingState?.workerMeta?.consumeReason != null
      ? String(workerSchedulingState.workerMeta.consumeReason)
      : null;

  const accountIds = assignments?.account_ids ?? [];
  const connected = Boolean(integration?.status === "connected");

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
  const warehouseStats = warehouseStatsRows[0] as
    | {
        row_count?: string | number | null;
        first_date?: string | null;
        last_date?: string | null;
        primary_account_timezone?: string | null;
      }
    | undefined;
  const snapshot = await captureOptional(
    "provider_account_snapshot",
    readProviderAccountSnapshot({
      businessId: businessId!,
      provider: "google",
    }),
    null
  );
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
      await Promise.all([
          readGoogleAdsStatusCoverage({
            scope: "account_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: initialBackfillStart,
            endDate: initialBackfillEnd,
            timeoutMs: 30_000,
          }),
          readGoogleAdsStatusCoverage({
            scope: "campaign_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: initialBackfillStart,
            endDate: initialBackfillEnd,
            timeoutMs: 30_000,
          }),
        ]);
  const [
    selectedSearchTermCoverage,
    selectedProductCoverage,
    selectedAssetCoverage,
    selectedAssetGroupCoverage,
    selectedGeoCoverage,
    selectedDeviceCoverage,
    selectedAudienceCoverage,
  ] =
    selectedStartDate && selectedEndDate
      ? await Promise.all([
          readGoogleAdsStatusCoverage({
            scope: "search_term_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
            timeoutMs: 30_000,
          }),
          readGoogleAdsStatusCoverage({
            scope: "product_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
            timeoutMs: 30_000,
          }),
          readGoogleAdsStatusCoverage({
            scope: "asset_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
            timeoutMs: 30_000,
          }),
          readGoogleAdsStatusCoverage({
            scope: "asset_group_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
            timeoutMs: 30_000,
          }),
          readGoogleAdsStatusCoverage({
            scope: "geo_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
            timeoutMs: 30_000,
          }),
          readGoogleAdsStatusCoverage({
            scope: "device_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
            timeoutMs: 30_000,
          }),
          readGoogleAdsStatusCoverage({
            scope: "audience_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: selectedStartDate,
            endDate: selectedEndDate,
            timeoutMs: 30_000,
          }),
        ])
      : [null, null, null, null, null, null, null];
  const [recentSearchTermCoverage, recentProductCoverage, recentAssetCoverage] =
      await Promise.all([
          readGoogleAdsStatusCoverage({
            scope: "search_term_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: recentExtendedStart,
            endDate: initialBackfillEnd,
            timeoutMs: 30_000,
          }),
          readGoogleAdsStatusCoverage({
            scope: "product_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: recentExtendedStart,
            endDate: initialBackfillEnd,
            timeoutMs: 30_000,
          }),
          readGoogleAdsStatusCoverage({
            scope: "asset_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: recentExtendedStart,
            endDate: initialBackfillEnd,
            timeoutMs: 30_000,
          }),
        ]);
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
      await Promise.all([
          captureOptional(
            "queue_health",
            getGoogleAdsQueueHealth({ businessId: businessId! }),
            null
          ),
          ...allStateScopes.map((scope) =>
            captureOptional(
              `sync_state:${scope}`,
              getGoogleAdsSyncState({
                businessId: businessId!,
                scope,
              }),
              []
            )
          ),
        ]);
  const [quotaBudgetState, breakerState] = await Promise.all([
    captureOptional(
      "quota_budget_state",
      getProviderQuotaBudgetState({
        provider: "google",
        businessId: businessId!,
      }),
      null
    ),
    captureOptional(
      "circuit_breaker_state",
      getProviderCircuitBreakerRecoveryState({
        provider: "google",
        businessId: businessId!,
      }),
      "closed" as const
    ),
  ]);
  const statesByScope = Object.fromEntries(
    allStateScopes.map((scope, index) => [scope, scopeStates[index] ?? []])
  ) as Record<
    typeof allStateScopes[number],
    Awaited<ReturnType<typeof getGoogleAdsSyncState>>
  >;
  const extendedStateScopes = allStateScopes.filter(
    (scope) => scope !== "account_daily" && scope !== "campaign_daily"
  );
  const extendedCoverageRows =
      await Promise.all(
          extendedStateScopes.map(async (scope) => ({
            scope,
            coverage: await readGoogleAdsStatusCoverage({
              scope,
              businessId: businessId!,
              providerAccountId: null,
              startDate: initialBackfillStart,
              endDate: initialBackfillEnd,
              timeoutMs: 30_000,
            }),
          }))
        );
  const extendedCoverageByScope = new Map(
    extendedCoverageRows.map((entry) => [entry.scope, entry.coverage] as const)
  );
  const selectedRangeCoverage =
    selectedStartDate && selectedEndDate
      ? await readGoogleAdsStatusCoverage({
          scope: "campaign_daily",
          businessId: businessId!,
          providerAccountId: null,
          startDate: selectedStartDate,
          endDate: selectedEndDate,
          timeoutMs: 30_000,
        })
      : null;

  const accountCoverageDays = accountCoverage?.completed_days ?? 0;
  const campaignCoverageDays = campaignCoverage?.completed_days ?? 0;
  const relevantAccountStates = statesByScope.account_daily.filter((row) =>
    accountIds.length === 0 ? true : accountIds.includes(row.providerAccountId)
  );
  const coreReadiness = buildGoogleAdsCoreReadiness({
    connected,
    assignedAccountCount: accountIds.length,
    totalDays,
    accountCoverageDays,
    campaignCoverageDays,
    campaignReadyThroughDate: campaignCoverage?.ready_through_date ?? null,
  });
  const effectiveHistoricalTotalDays = coreReadiness.effectiveHistoricalTotalDays;
  const overallCompletedDays = coreReadiness.overallCompletedDays;
  const overallAccountCompletedDays = coreReadiness.overallAccountCompletedDays;
  const historicalReadyThroughDate = coreReadiness.historicalReadyThroughDate;
  const extendedScopeSummaries = allStateScopes
    .filter((scope) => scope !== "account_daily" && scope !== "campaign_daily")
    .map((scope) => {
      const relevantStates = statesByScope[scope].filter((row) =>
        accountIds.length === 0 ? true : accountIds.includes(row.providerAccountId)
      );
      const warehouseCoverage = extendedCoverageByScope.get(scope);
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
        completedDays: Number(
          warehouseCoverage?.completed_days ??
            (relevantStates.length > 0
              ? Math.min(...relevantStates.map((row) => row.completedDays))
              : 0)
        ),
        totalDays: totalDaysForScope,
        readyThroughDate: warehouseCoverage?.ready_through_date
          ? String(warehouseCoverage.ready_through_date).slice(0, 10)
          : relevantStates
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
  const productPendingSurfaces = coreReadiness.productPendingSurfaces;
  const needsBootstrap = coreReadiness.needsBootstrap;
  const historicalProgressPercent = coreReadiness.historicalProgressPercent;
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
  const phaseLabel = historicalQueuePaused
      ? "Historical sync is paused"
    : overallCompletedDays < effectiveHistoricalTotalDays
      ? "Backfilling historical data"
      : effectiveLatestSync?.sync_type === "incremental_recent" ||
          effectiveLatestSync?.sync_type === "today_refresh"
        ? "Syncing recent history"
        : "Ready";
  const latestError = effectiveLatestSync?.last_error ? String(effectiveLatestSync.last_error) : null;

  const recent90Start = addDaysToIsoDate(initialBackfillEnd, -89);
  const [recent90CampaignCoverage, recent90SearchTermCoverage, recent90ProductCoverage, latestAdvisorSnapshot, advisorQueueHealth] =
      await Promise.all([
          readGoogleAdsStatusCoverage({
            scope: "campaign_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: recent90Start,
            endDate: initialBackfillEnd,
            timeoutMs: 30_000,
          }),
          readGoogleAdsStatusCoverage({
            scope: "search_term_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: recent90Start,
            endDate: initialBackfillEnd,
            timeoutMs: 30_000,
          }),
          readGoogleAdsStatusCoverage({
            scope: "product_daily",
            businessId: businessId!,
            providerAccountId: null,
            startDate: recent90Start,
            endDate: initialBackfillEnd,
            timeoutMs: 30_000,
          }),
          captureOptional(
            "latest_advisor_snapshot",
            getLatestGoogleAdsAdvisorSnapshot({
              businessId: businessId!,
              accountId: accountIds.length === 1 ? accountIds[0] : null,
            }),
            null
          ),
          captureOptional(
            "advisor_queue_health",
            getGoogleAdsAdvisorQueueHealth({
              businessId: businessId!,
              startDate: recent90Start,
              endDate: initialBackfillEnd,
            }),
            null
          ),
        ]);
  const advisorRequiredSurfaces = [
    {
      name: "campaign_daily",
      coverage: recent90CampaignCoverage,
    },
    {
      name: "search_term_daily",
      coverage: recent90SearchTermCoverage,
    },
    {
      name: "product_daily",
      coverage: recent90ProductCoverage,
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
        (entry.coverage?.completed_days ?? 0) >= 90
    )
    .map((entry) => entry.name);
  const advisorMissingSurfaces = advisorRequiredSurfaces
    .filter(
      (entry) =>
        (entry.coverage?.completed_days ?? 0) < 90
    )
    .map((entry) => entry.name);
  const advisorCoverageUnavailableCount = advisorRequiredSurfaces.filter(
    (entry) => entry.coverage == null
  ).length;
  const snapshotAvailable = Boolean(latestAdvisorSnapshot);
  const snapshotFresh = isGoogleAdsAdvisorSnapshotFresh(latestAdvisorSnapshot);
  const advisorRelevantDeadLetterPartitions =
    advisorQueueHealth?.advisorRelevantDeadLetterPartitions ?? 0;
  const advisorRelevantFailedPartitions =
    advisorQueueHealth?.advisorRelevantFailedPartitions ?? 0;
  const advisorRelevantLeasedPartitions =
    advisorQueueHealth?.advisorRelevantLeasedPartitions ?? 0;
  const historicalDeadLetterPartitions =
    advisorQueueHealth?.historicalDeadLetterPartitions ??
    Math.max(
      0,
      (queueHealth?.deadLetterPartitions ?? 0) - advisorRelevantDeadLetterPartitions
    );
  const advisorRelevantUnhealthyLeases =
    (workerSchedulingState?.healthy ?? false) ? 0 : advisorRelevantLeasedPartitions;
  const advisorDecision = decideGoogleAdsAdvisorReadiness({
    connected,
    assignedAccountCount: accountIds.length,
    deadLetterPartitions: queueHealth?.deadLetterPartitions ?? 0,
    recent90Ready:
      advisorMissingSurfaces.length === 0 && advisorCoverageUnavailableCount === 0,
    snapshotAvailable,
  });
  const advisorReady = advisorDecision.ready;
  const advisorNotReady = advisorDecision.notReady;
  const advisorSnapshotBlockedReason =
    snapshotAvailable
      ? null
      : advisorMissingSurfaces.length > 0
        ? "missing_recent_required_surfaces"
        : advisorRelevantDeadLetterPartitions > 0
          ? "recent_required_dead_letter_partitions"
          : advisorRelevantFailedPartitions > 0
            ? "recent_required_failed_partitions"
            : advisorRelevantUnhealthyLeases > 0
              ? "recent_required_unhealthy_leases"
              : null;
  const googleBlockingReasons = compactBlockingReasons([
    advisorMissingSurfaces.length > 0
      ? buildBlockingReason(
          "missing_required_recent_surfaces",
          `Recent required surfaces are still missing: ${advisorMissingSurfaces.join(", ")}.`,
        )
      : null,
    advisorRelevantDeadLetterPartitions > 0
      ? buildBlockingReason(
          "recent_required_dead_letter_partitions",
          `${advisorRelevantDeadLetterPartitions} required recent Google Ads partition(s) are dead-lettered.`,
          { repairable: true }
        )
      : null,
    advisorRelevantFailedPartitions > 0
      ? buildBlockingReason(
          "recent_required_failed_partitions",
          `${advisorRelevantFailedPartitions} required recent Google Ads partition(s) are waiting for retry or replay.`,
          { repairable: true }
        )
      : null,
    advisorRelevantUnhealthyLeases > 0
      ? buildBlockingReason(
          "recent_required_unhealthy_leases",
          `${advisorRelevantUnhealthyLeases} required recent Google Ads partition lease(s) look unhealthy.`,
          { repairable: true }
        )
      : null,
  ]);
  const googleRepairableActions = compactRepairableActions([
    buildRepairableAction(
      "refresh_queue",
      "Run targeted queue repair and re-plan missing required Google Ads partitions.",
      { available: (queueHealth?.queueDepth ?? 0) > 0 || (queueHealth?.leasedPartitions ?? 0) > 0 }
    ),
    advisorRelevantDeadLetterPartitions > 0
      ? buildRepairableAction(
          "replay_dead_letters",
          "Replay required recent dead-letter partitions into the queue."
        )
      : null,
    advisorRelevantFailedPartitions > 0
      ? buildRepairableAction(
          "requeue_failed",
          "Requeue retryable required recent failed partitions."
        )
      : null,
  ]);
  const googleRequiredCoverage = buildRequiredCoverage({
    completedDays: Math.min(
      Number(recent90CampaignCoverage?.completed_days ?? 0),
      Number(recent90SearchTermCoverage?.completed_days ?? 0),
      Number(recent90ProductCoverage?.completed_days ?? 0)
    ),
    totalDays: 90,
    readyThroughDate: [
      recent90CampaignCoverage?.ready_through_date ?? null,
      recent90SearchTermCoverage?.ready_through_date ?? null,
      recent90ProductCoverage?.ready_through_date ?? null,
    ]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right))[0] ?? null,
  });
  console.info("[google-ads-status] advisor-snapshot-gate", {
    businessId: businessId!,
    advisorWindowStart: recent90Start,
    advisorWindowEnd: initialBackfillEnd,
    recent90MissingSurfaces: advisorMissingSurfaces,
    advisorRelevantDeadLetterPartitions,
    advisorRelevantFailedPartitions,
    advisorRelevantUnhealthyLeases,
    historicalDeadLetterPartitions,
    snapshotAvailable,
    snapshotBlockedReason: advisorSnapshotBlockedReason,
  });
  const fullSyncPriority = decideGoogleAdsFullSyncPriority({
    advisorReady,
    advisorMissingSurfaces,
  });
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
  const coreUsable = coreReadiness.coreUsable;
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
  const recentGapCountByScope = Object.fromEntries(
    Object.entries(rangeCompletionBySurface).map(([scope, surface]) => [
      scope,
      Math.max(0, surface.recent.totalDays - surface.recent.completedDays),
    ])
  );
  const recentRepairRowsByScope = new Map(
    recentRepairRows.map((row) => [String(row.scope ?? ""), row] as const)
  );
  const recentGapRepairingByScope = Object.fromEntries(
    Object.keys(rangeCompletionBySurface).map((scope) => [
      scope,
      Number(recentRepairRowsByScope.get(scope)?.queued_count ?? 0) > 0 ||
        Number(recentRepairRowsByScope.get(scope)?.leased_count ?? 0) > 0 ||
        Number(recentRepairRowsByScope.get(scope)?.running_count ?? 0) > 0,
    ])
  );
  const recentGapLastAttemptAtByScope = Object.fromEntries(
    Object.keys(rangeCompletionBySurface).map((scope) => [
      scope,
      recentRepairRowsByScope.get(scope)?.latest_attempt_at
        ? String(recentRepairRowsByScope.get(scope)?.latest_attempt_at)
        : null,
    ])
  );
  const recentGapQueuedByScope = Object.fromEntries(
    Object.keys(rangeCompletionBySurface).map((scope) => [
      scope,
      Number(recentRepairRowsByScope.get(scope)?.queued_count ?? 0),
    ])
  );
  const recentGapLeasedByScope = Object.fromEntries(
    Object.keys(rangeCompletionBySurface).map((scope) => [
      scope,
      Number(recentRepairRowsByScope.get(scope)?.leased_count ?? 0) +
        Number(recentRepairRowsByScope.get(scope)?.running_count ?? 0),
    ])
  );
  const recentGapSucceededByScope = Object.fromEntries(
    Object.keys(rangeCompletionBySurface).map((scope) => [
      scope,
      Number(recentRepairRowsByScope.get(scope)?.succeeded_count ?? 0),
    ])
  );
  const recentGapFailedByScope = Object.fromEntries(
    Object.keys(rangeCompletionBySurface).map((scope) => [
      scope,
      Number(recentRepairRowsByScope.get(scope)?.failed_count ?? 0) +
        Number(recentRepairRowsByScope.get(scope)?.cancelled_count ?? 0),
    ])
  );
  const hasRecentGap = Object.values(recentGapCountByScope).some((count) => Number(count) > 0);
  const hasRecentRepairQueued = Object.values(recentGapQueuedByScope).some(
    (count) => Number(count) > 0
  );
  const hasRecentRepairLeased = Object.values(recentGapLeasedByScope).some(
    (count) => Number(count) > 0
  );
  const hasRecentRepairSucceeded = Object.values(recentGapSucceededByScope).some(
    (count) => Number(count) > 0
  );
  const hasRecentRepairFailed = Object.values(recentGapFailedByScope).some(
    (count) => Number(count) > 0
  );
  const recentRepairAttemptsByScope = new Map(
    recentRepairAttemptRows.map((row) => [String(row.scope ?? ""), row] as const)
  );
  const lastAutoRepairAttemptByScope = Object.fromEntries(
    Object.keys(rangeCompletionBySurface).map((scope) => [
      scope,
      recentRepairAttemptsByScope.get(scope)?.updated_at
        ? String(recentRepairAttemptsByScope.get(scope)?.updated_at)
        : null,
    ])
  );
  const recentExtendedReady = Object.values(rangeCompletionBySurface).every(
    (surface) => surface.recent.ready
  );
  const historicalExtendedReady = Object.values(rangeCompletionBySurface).every(
    (surface) => surface.historical.ready
  );
  const averageHistoricalCompletionRatio =
    Object.values(rangeCompletionBySurface).reduce((sum, surface) => {
      const ratio =
        surface.historical.totalDays > 0
          ? surface.historical.completedDays / surface.historical.totalDays
          : 0;
      return sum + Math.min(1, ratio);
    }, 0) / Math.max(1, Object.values(rangeCompletionBySurface).length);
  const advisorProgress = buildGoogleAdsAdvisorProgress({
    connected,
    assignedAccountCount: accountIds.length,
    coreUsable,
    advisorReady,
    coverages: advisorRequiredSurfaces.map((surface) => ({
      completedDays: surface.coverage?.completed_days ?? null,
    })),
    coverageUnavailableCount: advisorCoverageUnavailableCount,
  });
  const historicalBackfillPercent = historicalExtendedReady
    ? 100
    : Math.max(0, Math.min(99, Math.round(averageHistoricalCompletionRatio * 100)));
  const historicalProgressSummary = "Historical sync continues in the background.";
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
  const staleRunPressure = Number(staleRunRows[0]?.stale_run_pressure ?? 0);
  const autoRepairExecutionStage = (() => {
    if (runtimeMismatchDetected && hasRecentGap) return "runtime_waiting" as const;
    if (!hasRecentGap && !hasRecentRepairQueued && !hasRecentRepairLeased) {
      return hasRecentRepairSucceeded ? ("completed" as const) : null;
    }
    const hasAttempt = Object.values(lastAutoRepairAttemptByScope).some(Boolean);
    if (hasRecentRepairFailed && !hasRecentRepairQueued && !hasRecentRepairLeased && hasRecentGap) {
      return "failed" as const;
    }
    if (hasRecentGap && !hasAttempt && !hasRecentRepairQueued && !hasRecentRepairLeased) {
      return "not_planned" as const;
    }
    if (hasRecentRepairQueued && !hasRecentRepairLeased) return "planned_not_leased" as const;
    if (hasRecentRepairLeased) return "leased_not_completed" as const;
    if (hasRecentRepairSucceeded && hasRecentGap) return "completed_state_stale" as const;
    if (hasRecentRepairSucceeded) return "completed" as const;
    return null;
  })();
  const lastAutoRepairOutcome =
    autoRepairExecutionStage === "completed"
      ? "completed"
      : autoRepairExecutionStage === "failed"
        ? "failed"
        : autoRepairExecutionStage === "leased_not_completed"
          ? "running"
          : autoRepairExecutionStage === "planned_not_leased"
            ? "queued"
            : autoRepairExecutionStage === "completed_state_stale"
              ? "completed"
              : "unknown";
  const extendedSuppressionDecisionTrace =
    extendedRecoveryBlockReason === "worker_unhealthy"
      ? {
          decisionCaller: "compactGoogleAdsIncidentBacklog",
          providerScopeSeen: "google_ads",
          heartbeatAgeMs: workerSchedulingState?.heartbeatAgeMs ?? null,
          runnerLeaseSeen: workerSchedulingState?.runnerLeaseActive ?? false,
          breakerState,
          recoveryMode: breakerState,
          canaryEligible,
          quotaPressure: quotaBudgetState?.pressure ?? 0,
          queueDepthSnapshot: queueHealth?.queueDepth ?? 0,
          extendedQueueDepthSnapshot: queueHealth?.extendedQueueDepth ?? 0,
        }
      : null;

  const overallState = decideGoogleAdsStatusState({
      connected,
      assignedAccountCount: accountIds.length,
      historicalQueuePaused,
      deadLetterPartitions: queueHealth?.deadLetterPartitions ?? 0,
      advisorRelevantDeadLetterPartitions,
      advisorRelevantFailedPartitions,
      advisorRelevantUnhealthyLeases,
      latestSyncStatus: effectiveLatestSync?.status ? String(effectiveLatestSync.status) : null,
      runningJobs,
      staleRunningJobs,
      selectedRangeIncomplete,
      historicalProgressPercent,
      needsBootstrap,
      productPendingSurfaces,
      selectedRangeTotalDays,
      advisorMissingSurfaces,
      advisorNotReady,
    });
  const latestGoogleActivityAt =
    queueHealth?.latestCoreActivityAt ??
    queueHealth?.latestExtendedActivityAt ??
    queueHealth?.latestMaintenanceActivityAt ??
    null;
  const googleProgressEvidence = buildProviderProgressEvidence({
    states: allStateScopes.flatMap((scope) =>
      statesByScope[scope].filter((row) =>
        accountIds.length === 0 ? true : accountIds.includes(row.providerAccountId)
      )
    ),
    checkpointUpdatedAt: checkpointHealth?.latestCheckpointUpdatedAt ?? null,
    recentActivityWindowMinutes: 20,
    aggregation: "latest",
  });
  const googleProgressState = deriveProviderProgressState({
    queueDepth: queueHealth?.queueDepth ?? 0,
    leasedPartitions: queueHealth?.leasedPartitions ?? 0,
    checkpointLagMinutes: checkpointHealth?.checkpointLagMinutes ?? null,
    latestPartitionActivityAt: latestGoogleActivityAt,
    blocked: overallState === "action_required",
    fullyReady: overallState === "ready",
    staleRunPressure,
    progressEvidence: googleProgressEvidence,
  });
  const googleStallFingerprints = deriveProviderStallFingerprints({
    queueDepth: queueHealth?.queueDepth ?? 0,
    leasedPartitions: queueHealth?.leasedPartitions ?? 0,
    checkpointLagMinutes: checkpointHealth?.checkpointLagMinutes ?? null,
    latestPartitionActivityAt: latestGoogleActivityAt,
    blocked: overallState === "action_required",
    staleRunPressure,
    progressEvidence: googleProgressEvidence,
    blockedReasonCodes: googleBlockingReasons.map((reason) => reason.code),
    historicalBacklogDepth:
      (queueHealth?.extendedHistoricalQueueDepth ?? 0) +
      (queueHealth?.extendedHistoricalLeasedPartitions ?? 0),
  });
  const providerState = buildProviderStateContract({
    credentialState: connected ? "connected" : "not_connected",
    hasAssignedAccounts: accountIds.length > 0,
    warehouseRowCount: Number(warehouseStats?.row_count ?? 0),
    warehousePartial:
      selectedRangeTotalDays != null
        ? Boolean(selectedRangeIncomplete)
        : overallCompletedDays < effectiveHistoricalTotalDays,
    syncState: overallState,
    selectedCurrentDay: false,
    notReadyReason: summarizeStatusDegradedReason(statusDegradedReasons),
  });

  return NextResponse.json({
    state: overallState,
    credentialState: providerState.credentialState,
    assignmentState: providerState.assignmentState,
    warehouseState: providerState.warehouseState,
    syncState: providerState.syncState,
    servingMode: providerState.servingMode,
    isPartial: providerState.isPartial,
    notReadyReason: providerState.notReadyReason,
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
      snapshotReady: snapshotAvailable,
      snapshotAsOfDate: latestAdvisorSnapshot?.asOfDate ?? null,
      snapshotFresh,
      snapshotBlockedReason: advisorSnapshotBlockedReason,
      requiredSurfaces: advisorRequiredSurfaces.map((entry) => entry.name),
      availableSurfaces: advisorAvailableSurfaces,
      missingSurfaces: advisorMissingSurfaces,
      readyRangeStart: advisorReady ? recent90Start : null,
      readyRangeEnd: advisorReady ? initialBackfillEnd : null,
      blockingMessage:
        fullSyncPriority.reason ??
        buildAdvisorBlockingMessage({
          connected,
          assignedAccountCount: accountIds.length,
          advisorRelevantDeadLetterPartitions,
          advisorRelevantFailedPartitions,
          advisorRelevantUnhealthyLeases,
          recent90MissingSurfaces: advisorMissingSurfaces,
          snapshotAvailable,
          snapshotFresh,
        }),
      selectedWindow:
        selectedStartDate && selectedEndDate
          ? {
              label: `selected ${countInclusiveDays(selectedStartDate, selectedEndDate)}d`,
              ready:
                selectedRangeTotalDays != null &&
                [
                  selectedRangeCoverage,
                  selectedSearchTermCoverage,
                  selectedProductCoverage,
                ].every(
                  (coverage) => Number(coverage?.completed_days ?? 0) >= selectedRangeTotalDays
                ),
              startDate: selectedStartDate,
              endDate: selectedEndDate,
              totalDays: countInclusiveDays(selectedStartDate, selectedEndDate),
              missingSurfaces:
                selectedRangeTotalDays != null
                  ? [
                      { name: "campaign_daily", coverage: selectedRangeCoverage },
                      { name: "search_term_daily", coverage: selectedSearchTermCoverage },
                      { name: "product_daily", coverage: selectedProductCoverage },
                    ]
                      .filter((entry) => Number(entry.coverage?.completed_days ?? 0) < selectedRangeTotalDays)
                      .map((entry) => entry.name)
                  : [],
            }
          : null,
      supportWindows: null,
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
      advisorRelevantDeadLetterPartitions,
      historicalDeadLetterPartitions,
      advisorRelevantFailedPartitions,
      advisorRelevantLeasedPartitions,
      oldestQueuedPartition: queueHealth?.oldestQueuedPartition ?? null,
    },
    priorityWindow,
    operations: {
      currentMode,
      canaryEligible,
      quotaPressure: quotaBudgetState?.pressure ?? 0,
      breakerState,
      statusDegraded: statusDegradedReasons.length > 0,
      statusDegradedReason: summarizeStatusDegradedReason(statusDegradedReasons),
      extendedRecoveryBlockReason,
      googleWorkerHealthy: workerSchedulingState?.healthy ?? false,
      googleHeartbeatAgeMs: workerSchedulingState?.heartbeatAgeMs ?? null,
      googleRunnerLeaseActive: workerSchedulingState?.runnerLeaseActive ?? false,
      fullSyncPriorityRequired: fullSyncPriority.required,
      fullSyncPriorityReason: fullSyncPriority.reason,
      advisorSnapshotReady: snapshotAvailable,
      advisorSnapshotAsOfDate: latestAdvisorSnapshot?.asOfDate ?? null,
      advisorSnapshotFresh: snapshotFresh,
      advisorSnapshotBlockedReason,
      blockingReasons: googleBlockingReasons,
      repairableActions: googleRepairableActions,
      requiredCoverage: googleRequiredCoverage,
      stallFingerprints: googleStallFingerprints,
      secondaryReadiness: [
        {
          key: "analysis",
          state: snapshotAvailable ? "ready" : advisorSnapshotBlockedReason ? "blocked" : "building",
          detail: snapshotAvailable
            ? "Google Ads analysis snapshot is ready."
            : advisorSnapshotBlockedReason
              ? `Google Ads analysis is blocked by ${advisorSnapshotBlockedReason}.`
              : "Google Ads analysis snapshot is still building after required coverage completed.",
        },
      ],
      workerBuildId,
      workerStartedAt,
      lastWorkerHeartbeatAt: workerSchedulingState?.lastHeartbeatAt ?? null,
      workerFreshnessState,
      currentWorkerBusinessId,
      workerBatchBusinessIds,
      currentConsumeStage,
      lastConsumedBusinessId,
      runtimeMismatchDetected,
      lastConsumeAttemptAt,
      lastConsumeOutcome,
      lastLeaseAcquiredAt,
      lastProgressAt,
      lastConsumeFinishedAt,
      lastFailureReason,
      staleRunPressure,
      progressState: googleProgressState,
      extendedSuppressionDecisionTrace,
      lastTargetedRepair,
      lastAutoRepair,
      lastAutoRepairOutcome,
      lastAutoRepairTriggerSource: lastAutoRepair?.triggerSource ?? null,
      recentGapCountByScope,
      recentGapRepairingByScope,
      recentGapLastAttemptAtByScope,
      recentGapQueuedByScope,
      recentGapLeasedByScope,
      recentGapSucceededByScope,
      recentGapFailedByScope,
      lastAutoRepairAttemptByScope,
      autoRepairExecutionStage,
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
    advisorProgress,
    historicalProgress: {
      percent: historicalBackfillPercent,
      visible:
        connected &&
        accountIds.length > 0 &&
        advisorMissingSurfaces.length === 0 &&
        !historicalExtendedReady,
      summary: historicalProgressSummary,
    },
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
          progressPercent: historicalProgressPercent,
          completedDays: overallCompletedDays,
          totalDays: effectiveHistoricalTotalDays,
          readyThroughDate: historicalReadyThroughDate,
          phaseLabel: phaseLabel === "Ready" ? null : phaseLabel,
        }
      : {
          progressPercent: historicalProgressPercent,
          completedDays: overallCompletedDays,
          totalDays: effectiveHistoricalTotalDays,
          readyThroughDate: historicalReadyThroughDate,
          phaseLabel: phaseLabel === "Ready" ? null : phaseLabel,
        },
  });
}
