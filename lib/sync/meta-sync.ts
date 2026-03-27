import {
  getAdSets,
  getAgeBreakdown,
  getCampaigns,
  getLocationBreakdown,
  getPlacementBreakdown,
  resolveMetaCredentials,
} from "@/lib/api/meta";
import { syncMetaCreativesWarehouseDay } from "@/lib/meta/creatives-warehouse";
import {
  createMetaSyncJob,
  expireStaleMetaSyncJobs,
  getMetaAdDailyCoverage,
  getMetaAdDailyPreviewCoverage,
  getMetaAdSetDailyCoverage,
  getMetaAccountDailyCoverage,
  getLatestMetaSyncHealth,
  getMetaRawSnapshotCoverageByEndpoint,
  updateMetaSyncJob,
} from "@/lib/meta/warehouse";
import type { MetaSyncType } from "@/lib/meta/warehouse-types";
import {
  getCreativeMediaRetentionStart,
  META_WAREHOUSE_HISTORY_DAYS,
  dayCountInclusive,
} from "@/lib/meta/history";
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

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function enumerateDays(startDate: string, endDate: string, recentFirst = false) {
  const rows: string[] = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    rows.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return recentFirst ? rows.reverse() : rows;
}

function getMetaReferenceToday(credentials: Awaited<ReturnType<typeof resolveMetaCredentials>>) {
  const primaryAccountId = credentials?.accountIds[0] ?? null;
  const primaryTimeZone =
    primaryAccountId && credentials?.accountProfiles?.[primaryAccountId]?.timezone
      ? credentials.accountProfiles[primaryAccountId].timezone
      : null;
  return primaryTimeZone ? getTodayIsoForTimeZoneServer(primaryTimeZone) : toIsoDate(new Date());
}

function getMetaHistoricalWindow(credentials: Awaited<ReturnType<typeof resolveMetaCredentials>>) {
  const today = getMetaReferenceToday(credentials);
  const historicalEnd = addDays(new Date(`${today}T00:00:00Z`), -1);
  const historicalStart = addDays(historicalEnd, -(META_WAREHOUSE_HISTORY_DAYS - 1));
  return {
    startDate: toIsoDate(historicalStart),
    endDate: toIsoDate(historicalEnd),
    today,
  };
}

export interface MetaSyncResult {
  businessId: string;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
}

async function getMetaWarehouseWindowCompletion(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const totalDays = dayCountInclusive(input.startDate, input.endDate);
  const [accountCoverage, adsetCoverage, breakdownCoverageByEndpoint] = await Promise.all([
    getMetaAccountDailyCoverage({
      businessId: input.businessId,
      providerAccountId: null,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null),
    getMetaAdSetDailyCoverage({
      businessId: input.businessId,
      providerAccountId: null,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null),
    getMetaRawSnapshotCoverageByEndpoint({
      businessId: input.businessId,
      providerAccountId: null,
      endpointNames: [...META_BREAKDOWN_ENDPOINTS],
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null),
  ]);

  const accountCompletedDays = accountCoverage?.completed_days ?? 0;
  const adsetCompletedDays = adsetCoverage?.completed_days ?? 0;
  const breakdownCompletedDays = Math.min(
    ...META_BREAKDOWN_ENDPOINTS.map(
      (endpointName) => breakdownCoverageByEndpoint?.get(endpointName)?.completed_days ?? 0
    )
  );
  const completedDays = Math.min(
    accountCompletedDays,
    adsetCompletedDays,
    breakdownCompletedDays
  );

  return {
    totalDays,
    completedDays,
    complete: completedDays >= totalDays,
  };
}

async function getMetaDailyCoverageState(input: {
  businessId: string;
  day: string;
}) {
  const [
    accountCoverage,
    adsetCoverage,
    creativeCoverage,
    creativePreviewCoverage,
    breakdownCoverageByEndpoint,
  ] =
    await Promise.all([
      getMetaAccountDailyCoverage({
        businessId: input.businessId,
        providerAccountId: null,
        startDate: input.day,
        endDate: input.day,
      }).catch(() => null),
      getMetaAdSetDailyCoverage({
        businessId: input.businessId,
        providerAccountId: null,
        startDate: input.day,
        endDate: input.day,
      }).catch(() => null),
      getMetaAdDailyCoverage({
        businessId: input.businessId,
        providerAccountId: null,
        startDate: input.day,
        endDate: input.day,
      }).catch(() => null),
      getMetaAdDailyPreviewCoverage({
        businessId: input.businessId,
        providerAccountId: null,
        startDate: input.day,
        endDate: input.day,
      }).catch(() => null),
      getMetaRawSnapshotCoverageByEndpoint({
        businessId: input.businessId,
        providerAccountId: null,
        endpointNames: [...META_BREAKDOWN_ENDPOINTS],
        startDate: input.day,
        endDate: input.day,
      }).catch(() => null),
    ]);

  const reportingComplete =
    (accountCoverage?.completed_days ?? 0) >= 1 &&
    (adsetCoverage?.completed_days ?? 0) >= 1 &&
    META_BREAKDOWN_ENDPOINTS.every(
      (endpointName) => (breakdownCoverageByEndpoint?.get(endpointName)?.completed_days ?? 0) >= 1
    );
  const creativesComplete = (creativeCoverage?.completed_days ?? 0) >= 1;
  const creativesMediaReady =
    (creativePreviewCoverage?.total_rows ?? 0) === 0 ||
    (creativePreviewCoverage?.preview_ready_rows ?? 0) >=
      (creativePreviewCoverage?.total_rows ?? 0);

  return {
    reportingComplete,
    creativesComplete,
    creativesMediaReady,
  };
}

function getMetaInitialBackfillState() {
  const globalState = globalThis as typeof globalThis & {
    __adsecuteMetaInitialBackfillBusinesses?: Set<string>;
  };
  if (!globalState.__adsecuteMetaInitialBackfillBusinesses) {
    globalState.__adsecuteMetaInitialBackfillBusinesses = new Set<string>();
  }
  return globalState.__adsecuteMetaInitialBackfillBusinesses;
}

function startMetaInitialBackfillInBackground(businessId: string) {
  const state = getMetaInitialBackfillState();
  if (state.has(businessId)) return false;
  state.add(businessId);
  void syncMetaInitial(businessId)
    .catch((error) => {
      console.warn("[meta-sync] background_initial_failed", {
        businessId,
        message: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      state.delete(businessId);
    });
  return true;
}

async function resumeMetaBootstrapIfNeeded(businessId: string) {
  await expireStaleMetaSyncJobs({ businessId }).catch(() => null);
  const credentials = await resolveMetaCredentials(businessId).catch(() => null);
  if (!credentials?.accountIds?.length) return false;
  const { startDate, endDate } = getMetaHistoricalWindow(credentials);
  const [completion, latestSync] = await Promise.all([
    getMetaWarehouseWindowCompletion({
      businessId,
      startDate,
      endDate,
    }).catch(() => null),
    getLatestMetaSyncHealth({
      businessId,
      providerAccountId: null,
    }).catch(() => null),
  ]);
  if (completion?.complete) return false;
  if (latestSync?.status === "running") return false;
  return startMetaInitialBackfillInBackground(businessId);
}

export async function backfillMetaRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  triggerSource?: string;
  syncType?: MetaSyncType;
  recentFirst?: boolean;
}): Promise<MetaSyncResult> {
  const credentials = await resolveMetaCredentials(input.businessId);
  if (!credentials) {
    return {
      businessId: input.businessId,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: true,
    };
  }

  let succeeded = 0;
  let failed = 0;
  const days = enumerateDays(input.startDate, input.endDate, input.recentFirst ?? false);
  const primaryAccountId = credentials.accountIds[0] ?? "workspace";
  const assignedAccountIds = credentials.accountIds;
  const creativeMediaRetentionStart = getCreativeMediaRetentionStart(
    getMetaReferenceToday(credentials)
  );
  const syncJobId = await createMetaSyncJob({
    businessId: input.businessId,
    providerAccountId: primaryAccountId,
    syncType:
      input.syncType ??
      (days.length > 30 ? "initial_backfill" : days.length === 1 ? "today_refresh" : "incremental_recent"),
    scope: "account_daily",
    startDate: input.startDate,
    endDate: input.endDate,
    status: "running",
    progressPercent: 0,
    triggerSource: input.triggerSource ?? "system_backfill",
    retryCount: 0,
    lastError: null,
    startedAt: new Date().toISOString(),
  });

  for (let index = 0; index < days.length; index += 1) {
    const day = days[index];
    try {
      const coverageState = await getMetaDailyCoverageState({
        businessId: input.businessId,
        day,
      });

      if (!coverageState.reportingComplete) {
        const campaignRows = await getCampaigns(credentials, day, day);
        const campaignIds = Array.from(
          new Set(campaignRows.map((row) => row.id).filter(Boolean))
        );
        for (const campaignId of campaignIds) {
          await getAdSets(credentials, campaignId, day, day, input.businessId, false);
        }
        await Promise.all([
          getAgeBreakdown(credentials, day, day),
          getLocationBreakdown(credentials, day, day),
          getPlacementBreakdown(credentials, day, day),
        ]);
      }

      if (!coverageState.creativesComplete) {
        const shouldRetainCreativeMedia = day >= creativeMediaRetentionStart;
        await syncMetaCreativesWarehouseDay({
          businessId: input.businessId,
          day,
          accessToken: credentials.accessToken,
          assignedAccountIds,
          mediaMode: shouldRetainCreativeMedia ? "full" : "metadata",
        });
      } else if (day >= creativeMediaRetentionStart && !coverageState.creativesMediaReady) {
        await syncMetaCreativesWarehouseDay({
          businessId: input.businessId,
          day,
          accessToken: credentials.accessToken,
          assignedAccountIds,
          mediaMode: "full",
        });
      }
      succeeded += 1;
    } catch (error) {
      failed += 1;
      console.warn("[meta-sync] day_failed", {
        businessId: input.businessId,
        day,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (syncJobId) {
      const processed = index + 1;
      const progressPercent =
        processed >= days.length ? 100 : Math.max(1, Math.min(99, Math.round((processed / days.length) * 100)));
      await updateMetaSyncJob({
        id: syncJobId,
        status: "running",
        progressPercent,
        lastError: failed > 0 ? `Failed ${failed} day(s) so far.` : undefined,
      });
    }
  }

  if (syncJobId) {
    const finalStatus =
      succeeded === 0 && failed > 0 ? "failed" : failed > 0 ? "partial" : "succeeded";
    await updateMetaSyncJob({
      id: syncJobId,
      status: finalStatus,
      progressPercent: 100,
      lastError:
        failed > 0
          ? `Completed with ${failed} failed day(s) out of ${days.length}.`
          : null,
      finishedAt: new Date().toISOString(),
    });
  }

  return {
    businessId: input.businessId,
    attempted: days.length,
    succeeded,
    failed,
    skipped: false,
  };
}

export async function syncMetaRecent(businessId: string): Promise<MetaSyncResult> {
  const credentials = await resolveMetaCredentials(businessId);
  if (!credentials) {
    return {
      businessId,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: true,
    };
  }
  const { endDate } = getMetaHistoricalWindow(credentials);
  const start = addDays(new Date(`${endDate}T00:00:00Z`), -6);
  return backfillMetaRange({
    businessId,
    startDate: toIsoDate(start),
    endDate,
    triggerSource: "manual_refresh",
    syncType: "incremental_recent",
    recentFirst: true,
  });
}

export async function syncMetaToday(businessId: string): Promise<MetaSyncResult> {
  const credentials = await resolveMetaCredentials(businessId);
  if (!credentials) {
    return {
      businessId,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: true,
    };
  }
  const today = getMetaReferenceToday(credentials);
  return backfillMetaRange({
    businessId,
    startDate: today,
    endDate: today,
    triggerSource: "manual_refresh",
    syncType: "today_refresh",
    recentFirst: true,
  });
}

export async function syncMetaRepairRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<MetaSyncResult> {
  return backfillMetaRange({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    triggerSource: "priority_window",
    syncType: "repair_window",
    recentFirst: true,
  });
}

export async function syncMetaInitial(businessId: string): Promise<MetaSyncResult> {
  const credentials = await resolveMetaCredentials(businessId);
  if (!credentials) {
    return {
      businessId,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: true,
    };
  }
  const { startDate, endDate } = getMetaHistoricalWindow(credentials);
  return backfillMetaRange({
    businessId,
    startDate,
    endDate,
    triggerSource: "initial_connect",
    syncType: "initial_backfill",
    recentFirst: true,
  });
}

export async function ensureMetaWarehouseRangeFilled(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<MetaSyncResult | null> {
  const completion = await getMetaWarehouseWindowCompletion({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  }).catch(() => null);
  if (completion?.complete) {
    void resumeMetaBootstrapIfNeeded(input.businessId);
    return null;
  }

  const result = await syncMetaRepairRange({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  void resumeMetaBootstrapIfNeeded(input.businessId);
  return result;
}

export async function runMetaMaintenanceSync(businessId: string) {
  const staleExpired = await expireStaleMetaSyncJobs({ businessId }).catch(() => 0);
  const [recent, today, bootstrapResumed] = await Promise.all([
    syncMetaRecent(businessId).catch((error) => ({
      businessId,
      attempted: 0,
      succeeded: 0,
      failed: 1,
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
    })),
    syncMetaToday(businessId).catch((error) => ({
      businessId,
      attempted: 0,
      succeeded: 0,
      failed: 1,
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
    })),
    resumeMetaBootstrapIfNeeded(businessId).catch(() => false),
  ]);

  return {
    businessId,
    staleExpired,
    bootstrapResumed,
    recent,
    today,
  };
}
