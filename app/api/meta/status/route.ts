import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import {
  getMetaCreativeDailyCoverage,
  getMetaAdSetDailyCoverage,
  getLatestMetaSyncHealth,
  getMetaAccountDailyCoverage,
  getMetaAccountDailyStats,
  getMetaRawSnapshotCoverageByEndpoint,
} from "@/lib/meta/warehouse";
import { resolveMetaCredentials } from "@/lib/api/meta";

const META_WAREHOUSE_HISTORY_DAYS = 365;
const META_BREAKDOWN_ENDPOINTS = [
  "breakdown_age",
  "breakdown_country",
  "breakdown_publisher_platform,platform_position,impression_device",
] as const;

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

function dayCountInclusive(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildPhaseLabel(syncType?: string | null) {
  switch (syncType) {
    case "initial_backfill":
      return "Historical backfill";
    case "incremental_recent":
      return "Recent window refresh";
    case "today_refresh":
      return "Today refresh";
    case "repair_window":
      return "Repairing missing dates";
    case "reconnect_backfill":
      return "Reconnect backfill";
    default:
      return "Preparing historical data";
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const businessId = url.searchParams.get("businessId");

  const access = await requireBusinessAccess({ request, businessId });
  if ("error" in access) return access.error;

  const [integration, assignments, latestSync, accountStats, credentials] = await Promise.all([
    getIntegration(businessId!, "meta").catch(() => null),
    getProviderAccountAssignments(businessId!, "meta").catch(() => null),
    getLatestMetaSyncHealth({ businessId: businessId!, providerAccountId: null }).catch(() => null),
    getMetaAccountDailyStats({ businessId: businessId!, providerAccountId: null }).catch(() => null),
    resolveMetaCredentials(businessId!).catch(() => null),
  ]);

  const accountIds = assignments?.account_ids ?? [];
  const connected = Boolean(integration?.status === "connected" && integration?.access_token);
  const primaryAccountId = accountIds[0] ?? null;
  const primaryAccountTimezone =
    primaryAccountId && credentials?.accountProfiles?.[primaryAccountId]?.timezone
      ? credentials.accountProfiles[primaryAccountId].timezone
      : null;
  const currentDateInTimezone = primaryAccountTimezone
    ? getTodayIsoForTimeZoneServer(primaryAccountTimezone)
    : null;
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
  const [initialCoverage, adsetCoverage, creativeCoverage, breakdownCoverageByEndpoint] =
    connected && accountIds.length > 0
      ? await Promise.all([
          getMetaAccountDailyCoverage({
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
          getMetaCreativeDailyCoverage({
            businessId: businessId!,
            providerAccountId: null,
            startDate: initialBackfillStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
          getMetaRawSnapshotCoverageByEndpoint({
            businessId: businessId!,
            providerAccountId: null,
            endpointNames: [...META_BREAKDOWN_ENDPOINTS],
            startDate: initialBackfillStart,
            endDate: initialBackfillEnd,
          }).catch(() => null),
        ])
      : [null, null, null, null];

  const initialCoverageDays = initialCoverage?.completed_days ?? 0;
  const initialTotalDays = dayCountInclusive(initialBackfillStart, initialBackfillEnd);
  const adsetCoverageDays = adsetCoverage?.completed_days ?? 0;
  const adsetReadyThroughDate = adsetCoverage?.ready_through_date ?? null;
  const creativeCoverageDays = creativeCoverage?.completed_days ?? 0;
  const creativeReadyThroughDate = creativeCoverage?.ready_through_date ?? null;
  const breakdownEndpointCoverage = META_BREAKDOWN_ENDPOINTS.map((endpointName) =>
    breakdownCoverageByEndpoint?.get(endpointName) ?? { completed_days: 0, ready_through_date: null }
  );
  const breakdownCoverageDays =
    breakdownEndpointCoverage.length > 0
      ? Math.min(...breakdownEndpointCoverage.map((row) => row.completed_days))
      : 0;
  const breakdownReadyThroughDate =
    breakdownEndpointCoverage
      .map((row) => row.ready_through_date)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
  const overallCompletedDays = Math.min(
    initialCoverageDays,
    adsetCoverageDays,
    breakdownCoverageDays
  );
  const pendingSurfaces = [
    initialCoverageDays < initialTotalDays ? "account_daily" : null,
    adsetCoverageDays < initialTotalDays ? "adset_daily" : null,
    breakdownCoverageDays < initialTotalDays ? "breakdowns" : null,
  ].filter((value): value is string => Boolean(value));
  const needsBootstrap =
    connected &&
    accountIds.length > 0 &&
    overallCompletedDays < initialTotalDays &&
    latestSync?.status !== "running";

  const latestSyncCoverage =
    latestSync?.start_date && latestSync?.end_date
      ? await getMetaAccountDailyCoverage({
          businessId: businessId!,
          providerAccountId: null,
          startDate: latestSync.start_date,
          endDate: latestSync.end_date,
        }).catch(() => null)
      : null;

  const historicalProgressPercent = Math.min(
    100,
    Math.round((overallCompletedDays / initialTotalDays) * 100)
  );

  const state = !connected
    ? "not_connected"
    : accountIds.length === 0
      ? "connected_no_assignment"
      : latestSync?.status === "failed"
        ? "action_required"
        : historicalProgressPercent >= 100
          ? "ready"
        : latestSync?.status === "running" || needsBootstrap
        ? "syncing"
        : latestSync?.status === "partial"
          ? "partial"
          : pendingSurfaces.length > 0
            ? "partial"
            : "ready";

  return NextResponse.json(
    {
      state,
      connected,
      assignedAccountIds: accountIds,
      primaryAccountTimezone,
      currentDateInTimezone,
      needsBootstrap,
      warehouse: {
        rowCount: accountStats?.row_count ?? 0,
        firstDate: accountStats?.first_date ?? null,
        lastDate: accountStats?.last_date ?? null,
        coverage: {
          accountDaily: {
            completedDays: initialCoverageDays,
            totalDays: initialTotalDays,
            readyThroughDate: initialCoverage?.ready_through_date ?? null,
          },
          adsetDaily: {
            completedDays: adsetCoverageDays,
            totalDays: initialTotalDays,
            readyThroughDate: adsetReadyThroughDate,
          },
          breakdowns: {
            completedDays: breakdownCoverageDays,
            totalDays: initialTotalDays,
            readyThroughDate: breakdownReadyThroughDate,
          },
          creatives: {
            completedDays: creativeCoverageDays,
            totalDays: initialTotalDays,
            readyThroughDate: creativeReadyThroughDate,
          },
          pendingSurfaces,
        },
      },
      latestSync: latestSync
        ? {
            id: latestSync.id,
            status: latestSync.status,
            syncType: latestSync.sync_type,
            scope: latestSync.scope,
            startDate: latestSync.start_date,
            endDate: latestSync.end_date,
            triggerSource: latestSync.trigger_source,
            triggeredAt: latestSync.triggered_at,
            startedAt: latestSync.started_at,
            finishedAt: latestSync.finished_at,
            lastError: latestSync.last_error,
            progressPercent: historicalProgressPercent,
            completedDays: overallCompletedDays,
            totalDays: initialTotalDays,
            readyThroughDate:
              [
                initialCoverage?.ready_through_date ?? null,
                adsetReadyThroughDate,
                breakdownReadyThroughDate,
              ].filter((value): value is string => Boolean(value)).sort()[0] ?? accountStats?.last_date ?? null,
            phaseLabel:
              needsBootstrap || latestSync.sync_type === "initial_backfill"
                ? buildPhaseLabel("initial_backfill")
                : buildPhaseLabel(latestSync.sync_type),
          }
        : needsBootstrap
          ? {
              status: "pending",
              syncType: "initial_backfill",
              scope: "account_daily",
              startDate: initialBackfillStart,
              endDate: initialBackfillEnd,
              triggerSource: "initial_connect",
              triggeredAt: null,
              startedAt: null,
              finishedAt: null,
              lastError: null,
              progressPercent: historicalProgressPercent,
              completedDays: overallCompletedDays,
              totalDays: initialTotalDays,
              readyThroughDate:
                [
                  initialCoverage?.ready_through_date ?? null,
                  adsetReadyThroughDate,
                  breakdownReadyThroughDate,
                ].filter((value): value is string => Boolean(value)).sort()[0] ?? accountStats?.last_date ?? null,
              phaseLabel: buildPhaseLabel("initial_backfill"),
            }
          : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
