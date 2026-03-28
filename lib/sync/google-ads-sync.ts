import {
  getGoogleAdsAdsReport,
  getGoogleAdsAssetGroupsReport,
  getGoogleAdsAssetsReport,
  getGoogleAdsAudiencesReport,
  getGoogleAdsCampaignsReport,
  getGoogleAdsDevicesReport,
  getGoogleAdsGeoReport,
  getGoogleAdsKeywordsReport,
  getGoogleAdsProductsReport,
  getGoogleAdsSearchIntelligenceReport,
} from "@/lib/google-ads/reporting";
import { readProviderAccountSnapshot } from "@/lib/provider-account-snapshots";
import { getAssignedGoogleAccounts } from "@/lib/google-ads-gaql";
import {
  acquireGoogleAdsRunnerLease,
  buildGoogleAdsRawSnapshotHash,
  cleanupGoogleAdsObsoleteSyncJobs,
  cleanupGoogleAdsPartitionOrchestration,
  completeGoogleAdsPartition,
  createGoogleAdsSyncJob,
  createGoogleAdsSyncRun,
  expireStaleGoogleAdsSyncJobs,
  getGoogleAdsCoveredDates,
  getGoogleAdsDailyCoverage,
  getGoogleAdsPartitionHealth,
  getGoogleAdsPartitionDates,
  getGoogleAdsQueueHealth,
  leaseGoogleAdsSyncPartitions,
  persistGoogleAdsRawSnapshot,
  queueGoogleAdsSyncPartition,
  releaseGoogleAdsRunnerLease,
  upsertGoogleAdsSyncState,
  updateGoogleAdsSyncRun,
  updateGoogleAdsSyncJob,
  upsertGoogleAdsDailyRows,
  markGoogleAdsPartitionRunning,
} from "@/lib/google-ads/warehouse";
import {
  GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS,
  addDaysToIsoDate,
  enumerateDays,
  getHistoricalWindowStart,
} from "@/lib/google-ads/history";
import type {
  GoogleAdsSyncLane,
  GoogleAdsSyncType,
  GoogleAdsWarehouseDailyRow,
  GoogleAdsWarehouseScope,
} from "@/lib/google-ads/warehouse-types";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";

type GenericRow = Record<string, unknown>;

const runtimeSyncStore = globalThis as typeof globalThis & {
  __googleAdsBackgroundSyncKeys?: Set<string>;
  __googleAdsBackgroundWorkerTimers?: Map<string, ReturnType<typeof setTimeout>>;
};

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getBackgroundSyncKeys() {
  if (!runtimeSyncStore.__googleAdsBackgroundSyncKeys) {
    runtimeSyncStore.__googleAdsBackgroundSyncKeys = new Set<string>();
  }
  return runtimeSyncStore.__googleAdsBackgroundSyncKeys;
}

function getBackgroundWorkerTimers() {
  if (!runtimeSyncStore.__googleAdsBackgroundWorkerTimers) {
    runtimeSyncStore.__googleAdsBackgroundWorkerTimers = new Map();
  }
  return runtimeSyncStore.__googleAdsBackgroundWorkerTimers;
}

const GOOGLE_ADS_BOOTSTRAP_BATCH_DAYS = 4;
const GOOGLE_ADS_RECENT_MAINTENANCE_DAYS = 7;
const GOOGLE_ADS_BACKGROUND_LOOP_DELAY_MS = envNumber("GOOGLE_ADS_BACKGROUND_LOOP_DELAY_MS", 5_000);
const GOOGLE_ADS_CORE_WORKER_LIMIT = envNumber("GOOGLE_ADS_CORE_WORKER_LIMIT", 4);
const GOOGLE_ADS_MAINTENANCE_WORKER_LIMIT = envNumber("GOOGLE_ADS_MAINTENANCE_WORKER_LIMIT", 2);
const GOOGLE_ADS_EXTENDED_WORKER_LIMIT = envNumber("GOOGLE_ADS_EXTENDED_WORKER_LIMIT", 4);
const GOOGLE_ADS_EXTENDED_BURST_WORKER_LIMIT = envNumber(
  "GOOGLE_ADS_EXTENDED_BURST_WORKER_LIMIT",
  3
);
const GOOGLE_ADS_EXTENDED_CORE_BACKLOG_THRESHOLD = envNumber(
  "GOOGLE_ADS_EXTENDED_CORE_BACKLOG_THRESHOLD",
  2
);
const GOOGLE_ADS_PARTITION_LEASE_MINUTES = envNumber("GOOGLE_ADS_PARTITION_LEASE_MINUTES", 5);
const GOOGLE_ADS_TRANSIENT_RETRY_BASE_MINUTES = envNumber(
  "GOOGLE_ADS_TRANSIENT_RETRY_BASE_MINUTES",
  2
);
const GOOGLE_ADS_QUOTA_RETRY_BASE_MINUTES = envNumber(
  "GOOGLE_ADS_QUOTA_RETRY_BASE_MINUTES",
  8
);
const GOOGLE_ADS_PARTITION_MAX_ATTEMPTS = 6;

function canUseInProcessBackgroundScheduling() {
  return process.env.SYNC_WORKER_MODE !== "1";
}

const GOOGLE_ADS_EXTENDED_SCOPES: GoogleAdsWarehouseScope[] = [
  "search_term_daily",
  "product_daily",
  "asset_group_daily",
  "asset_daily",
  "geo_daily",
  "device_daily",
  "audience_daily",
  "ad_group_daily",
  "ad_daily",
  "keyword_daily",
];

const GOOGLE_ADS_STATE_SCOPES: GoogleAdsWarehouseScope[] = [
  "account_daily",
  "campaign_daily",
  "search_term_daily",
  "product_daily",
  "asset_group_daily",
  "asset_daily",
  "geo_daily",
  "device_daily",
  "audience_daily",
];

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullIfEmpty(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function computeDerivedMetrics(input: {
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  conversionRate?: number | null;
  interactionRate?: number | null;
}) {
  return {
    ctr:
      input.impressions > 0 ? Number(((input.clicks / input.impressions) * 100).toFixed(2)) : null,
    cpc: input.clicks > 0 ? Number((input.spend / input.clicks).toFixed(2)) : null,
    cpa:
      input.conversions > 0 ? Number((input.spend / input.conversions).toFixed(2)) : null,
    roas: input.spend > 0 ? Number((input.revenue / input.spend).toFixed(2)) : 0,
    conversionRate:
      input.conversionRate ??
      (input.clicks > 0 ? Number(((input.conversions / input.clicks) * 100).toFixed(2)) : null),
    interactionRate: input.interactionRate ?? null,
  };
}

function buildWarehouseRow(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  accountTimezone: string;
  accountCurrency: string;
  entityKey: string;
  entityLabel?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  adGroupId?: string | null;
  adGroupName?: string | null;
  status?: string | null;
  channel?: string | null;
  classification?: string | null;
  spend?: number;
  revenue?: number;
  conversions?: number;
  impressions?: number;
  clicks?: number;
  conversionRate?: number | null;
  interactionRate?: number | null;
  payloadJson?: unknown;
  sourceSnapshotId: string | null;
}): GoogleAdsWarehouseDailyRow {
  const spend = input.spend ?? 0;
  const revenue = input.revenue ?? 0;
  const conversions = input.conversions ?? 0;
  const impressions = input.impressions ?? 0;
  const clicks = input.clicks ?? 0;
  const derived = computeDerivedMetrics({
    spend,
    revenue,
    conversions,
    impressions,
    clicks,
    conversionRate: input.conversionRate,
    interactionRate: input.interactionRate,
  });
  return {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    accountTimezone: input.accountTimezone,
    accountCurrency: input.accountCurrency,
    entityKey: input.entityKey,
    entityLabel: input.entityLabel ?? null,
    campaignId: input.campaignId ?? null,
    campaignName: input.campaignName ?? null,
    adGroupId: input.adGroupId ?? null,
    adGroupName: input.adGroupName ?? null,
    status: input.status ?? null,
    channel: input.channel ?? null,
    classification: input.classification ?? null,
    payloadJson: input.payloadJson ?? {},
    spend,
    revenue,
    conversions,
    impressions,
    clicks,
    ctr: derived.ctr,
    cpc: derived.cpc,
    cpa: derived.cpa,
    roas: derived.roas,
    conversionRate: derived.conversionRate,
    interactionRate: derived.interactionRate,
    sourceSnapshotId: input.sourceSnapshotId,
  };
}

async function createScopeSyncJob(input: {
  businessId: string;
  providerAccountId: string;
  startDate: string;
  endDate: string;
  scope: GoogleAdsWarehouseScope;
  syncType: GoogleAdsSyncType;
  triggerSource: string;
}) {
  return createGoogleAdsSyncJob({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    scope: input.scope,
    syncType: input.syncType,
    startDate: input.startDate,
    endDate: input.endDate,
    status: "running",
    progressPercent: 0,
    triggerSource: input.triggerSource,
    retryCount: 0,
    lastError: null,
    startedAt: new Date().toISOString(),
  });
}

function getScopeProfile(
  snapshot: Awaited<ReturnType<typeof readProviderAccountSnapshot>>,
  accountId: string
) {
  const account = snapshot?.accounts.find((item) => item.id === accountId);
  return {
    timezone: account?.timezone ?? "UTC",
    currency: account?.currency ?? "USD",
  };
}

async function persistScopeRows(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  accountTimezone: string;
  accountCurrency: string;
  endpointName: string;
  scope: GoogleAdsWarehouseScope;
  rows: GenericRow[];
  requestContext: Record<string, unknown>;
  mapRow: (row: GenericRow, snapshotId: string | null) => GoogleAdsWarehouseDailyRow | null;
}) {
  const snapshotId = await persistGoogleAdsRawSnapshot({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    endpointName: input.endpointName,
    entityScope: input.scope,
    startDate: input.date,
    endDate: input.date,
    accountTimezone: input.accountTimezone,
    accountCurrency: input.accountCurrency,
    payloadJson: input.rows,
    payloadHash: buildGoogleAdsRawSnapshotHash({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      endpointName: input.endpointName,
      startDate: input.date,
      endDate: input.date,
      payload: input.rows,
    }),
    requestContext: input.requestContext,
    providerHttpStatus: 200,
    status: "fetched",
  });

  const warehouseRows = input.rows
    .map((row) => input.mapRow(row, snapshotId))
    .filter((row): row is GoogleAdsWarehouseDailyRow => Boolean(row));
  await upsertGoogleAdsDailyRows(input.scope, warehouseRows);
  return { snapshotId, rowCount: warehouseRows.length };
}

function aggregateAdGroupRows(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  accountTimezone: string;
  accountCurrency: string;
  sourceSnapshotId: string | null;
  rows: GenericRow[];
}): GoogleAdsWarehouseDailyRow[] {
  const byKey = new Map<string, GenericRow>();
  for (const row of input.rows) {
    const adGroupId = nullIfEmpty(row.adGroupId);
    const adGroupName = nullIfEmpty(row.adGroupName) ?? nullIfEmpty(row.adGroup);
    const key = adGroupId ?? adGroupName;
    if (!key) continue;
    const current = byKey.get(key) ?? {
      adGroupId,
      adGroupName,
      campaignId: nullIfEmpty(row.campaignId),
      campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
      status: nullIfEmpty(row.status),
      channel: nullIfEmpty(row.channel),
      spend: 0,
      revenue: 0,
      conversions: 0,
      impressions: 0,
      clicks: 0,
    };
    current.spend = toNumber(current.spend) + toNumber(row.spend);
    current.revenue = toNumber(current.revenue) + toNumber(row.revenue);
    current.conversions = toNumber(current.conversions) + toNumber(row.conversions);
    current.impressions = toNumber(current.impressions) + toNumber(row.impressions);
    current.clicks = toNumber(current.clicks) + toNumber(row.clicks);
    byKey.set(key, current);
  }

  return Array.from(byKey.entries()).map(([key, row]) =>
    buildWarehouseRow({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: input.accountTimezone,
      accountCurrency: input.accountCurrency,
      entityKey: key,
      entityLabel: nullIfEmpty(row.adGroupName),
      campaignId: nullIfEmpty(row.campaignId),
      campaignName: nullIfEmpty(row.campaignName),
      adGroupId: nullIfEmpty(row.adGroupId),
      adGroupName: nullIfEmpty(row.adGroupName),
      status: nullIfEmpty(row.status),
      channel: nullIfEmpty(row.channel),
      spend: toNumber(row.spend),
      revenue: toNumber(row.revenue),
      conversions: toNumber(row.conversions),
      impressions: toNumber(row.impressions),
      clicks: toNumber(row.clicks),
      payloadJson: row,
      sourceSnapshotId: input.sourceSnapshotId,
    })
  );
}

function aggregateAccountMetrics(rows: GenericRow[]) {
  return rows.reduce<{
    spend: number;
    revenue: number;
    conversions: number;
    impressions: number;
    clicks: number;
  }>(
    (acc, row) => {
      acc.spend += toNumber(row.spend);
      acc.revenue += toNumber(row.revenue);
      acc.conversions += toNumber(row.conversions);
      acc.impressions += toNumber(row.impressions);
      acc.clicks += toNumber(row.clicks);
      return acc;
    },
    {
      spend: 0,
      revenue: 0,
      conversions: 0,
      impressions: 0,
      clicks: 0,
    }
  );
}

async function resolveGoogleAdsCurrentDate(businessId: string) {
  const [assignments, snapshot] = await Promise.all([
    getProviderAccountAssignments(businessId, "google").catch(() => null),
    readProviderAccountSnapshot({ businessId, provider: "google" }).catch(() => null),
  ]);
  const primaryAccountId = assignments?.account_ids?.[0] ?? null;
  const timeZone =
    snapshot?.accounts.find((account) => account.id === primaryAccountId)?.timezone ?? "UTC";
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

async function getMissingDatesForScope(input: {
  businessId: string;
  scope: GoogleAdsWarehouseScope;
  startDate: string;
  endDate: string;
  recentFirst?: boolean;
}) {
  const coveredDates = new Set(
    await getGoogleAdsCoveredDates({
      scope: input.scope,
      businessId: input.businessId,
      providerAccountId: null,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => [])
  );
  return enumerateDays(input.startDate, input.endDate, input.recentFirst ?? false).filter(
    (date) => !coveredDates.has(date)
  );
}

function getGoogleAdsWorkerId() {
  return `worker:${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
}

async function computeHistoricalTargets(businessId: string) {
  const today = await resolveGoogleAdsCurrentDate(businessId).catch(() =>
    new Date().toISOString().slice(0, 10)
  );
  const yesterday = addDaysToIsoDate(today, -1);
  const historicalStart = getHistoricalWindowStart(yesterday, GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS);
  return {
    today,
    yesterday,
    historicalStart,
  };
}

async function enqueueHistoricalCorePartitions(businessId: string) {
  const accountIds = await getAssignedGoogleAccounts(businessId).catch(() => []);
  if (accountIds.length === 0) return 0;
  const { historicalStart, yesterday } = await computeHistoricalTargets(businessId);
  let queued = 0;
  for (const providerAccountId of accountIds) {
    const [coveredDates, activePartitionDates] = await Promise.all([
      getGoogleAdsCoveredDates({
        scope: "campaign_daily",
        businessId,
        providerAccountId,
        startDate: historicalStart,
        endDate: yesterday,
      }).catch(() => []),
      getGoogleAdsPartitionDates({
        businessId,
        providerAccountId,
        lane: "core",
        scope: "campaign_daily",
        startDate: historicalStart,
        endDate: yesterday,
        statuses: ["queued", "leased", "running", "failed", "dead_letter"],
      }).catch(() => []),
    ]);
    const blockedDates = new Set([...coveredDates, ...activePartitionDates]);
    const dates = enumerateDays(historicalStart, yesterday, true)
      .filter((date) => !blockedDates.has(date))
      .slice(0, GOOGLE_ADS_BOOTSTRAP_BATCH_DAYS);

    for (const date of dates) {
      const row = await queueGoogleAdsSyncPartition({
        businessId,
        providerAccountId,
        lane: "core",
        scope: "campaign_daily",
        partitionDate: date,
        status: "queued",
        priority: 0,
        source: "historical",
        attemptCount: 0,
      }).catch(() => null);
      if (row?.id) queued++;
    }
  }
  return queued;
}

async function enqueueMaintenancePartitions(businessId: string) {
  const accountIds = await getAssignedGoogleAccounts(businessId).catch(() => []);
  if (accountIds.length === 0) return;
  const { today, yesterday } = await computeHistoricalTargets(businessId);
  const recentDates = enumerateDays(
    addDaysToIsoDate(yesterday, -(GOOGLE_ADS_RECENT_MAINTENANCE_DAYS - 1)),
    yesterday,
    true
  );
  for (const providerAccountId of accountIds) {
    const activeRecentDates = new Set(
      await getGoogleAdsPartitionDates({
        businessId,
        providerAccountId,
        lane: "maintenance",
        scope: "campaign_daily",
        startDate: addDaysToIsoDate(yesterday, -(GOOGLE_ADS_RECENT_MAINTENANCE_DAYS - 1)),
        endDate: today,
        statuses: ["queued", "leased", "running"],
      }).catch(() => [])
    );
    for (const date of recentDates) {
      if (activeRecentDates.has(date)) continue;
      await queueGoogleAdsSyncPartition({
        businessId,
        providerAccountId,
        lane: "maintenance",
        scope: "campaign_daily",
        partitionDate: date,
        status: "queued",
        priority: -10,
        source: "recent",
        attemptCount: 0,
      }).catch(() => null);
    }
    if (activeRecentDates.has(today)) continue;
    await queueGoogleAdsSyncPartition({
      businessId,
      providerAccountId,
      lane: "maintenance",
      scope: "campaign_daily",
      partitionDate: today,
      status: "queued",
      priority: 10,
      source: "today",
      attemptCount: 0,
    }).catch(() => null);
  }
}

export async function enqueueGoogleAdsScheduledWork(businessId: string) {
  await cleanupGoogleAdsObsoleteSyncJobs({ businessId }).catch(() => null);
  await expireStaleGoogleAdsSyncJobs({ businessId }).catch(() => null);
  const cleanup = await cleanupGoogleAdsPartitionOrchestration({ businessId }).catch(() => null);
  await refreshGoogleAdsSyncStateForBusiness({ businessId }).catch(() => null);
  const queuedCore = await enqueueHistoricalCorePartitions(businessId).catch(() => 0);
  await enqueueMaintenancePartitions(businessId).catch(() => null);
  const queueHealth = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
  return {
    businessId,
    cleanup,
    queuedCore,
    queueDepth: queueHealth?.queueDepth ?? 0,
    leasedPartitions: queueHealth?.leasedPartitions ?? 0,
  };
}

export async function refreshGoogleAdsSyncStateForBusiness(input: {
  businessId: string;
  scopes?: GoogleAdsWarehouseScope[];
}) {
  const accountIds = await getAssignedGoogleAccounts(input.businessId).catch(() => []);
  if (accountIds.length === 0) return;
  const scopes = input.scopes ?? GOOGLE_ADS_STATE_SCOPES;
  for (const providerAccountId of accountIds) {
    for (const scope of scopes) {
      try {
        await refreshGoogleAdsSyncStateForPartition({
          businessId: input.businessId,
          providerAccountId,
          scope,
        });
      } catch (error) {
        console.warn("[google-ads-sync] scope_state_refresh_failed", {
          businessId: input.businessId,
          providerAccountId,
          scope,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

async function computeContiguousReadyThroughDate(input: {
  businessId: string;
  providerAccountId: string;
  scope: GoogleAdsWarehouseScope;
  targetStart: string;
  targetEnd: string;
}) {
  const covered = new Set(
    await getGoogleAdsCoveredDates({
      scope: input.scope,
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      startDate: input.targetStart,
      endDate: input.targetEnd,
    }).catch(() => [])
  );
  const descending = enumerateDays(input.targetStart, input.targetEnd, true);
  let readyThroughDate: string | null = null;
  for (const date of descending) {
    if (!covered.has(date)) break;
    readyThroughDate = date;
  }
  return readyThroughDate;
}

async function shouldContinueGoogleAdsBackgroundSync(businessId: string) {
  const [assignments, state] = await Promise.all([
    getProviderAccountAssignments(businessId, "google").catch(() => null),
    getGoogleAdsQueueHealth({ businessId }).catch(() => null),
  ]);
  const accountIds = assignments?.account_ids ?? [];
  if (accountIds.length === 0 || !state) return false;
  return state.queueDepth > 0 || state.leasedPartitions > 0;
}

export function scheduleGoogleAdsBackgroundSync(input: {
  businessId: string;
  delayMs?: number;
}) {
  if (!canUseInProcessBackgroundScheduling()) return false;
  const timers = getBackgroundWorkerTimers();
  if (timers.has(input.businessId)) return false;

  const timer = setTimeout(async () => {
    timers.delete(input.businessId);
    try {
      await syncGoogleAdsReports(input.businessId);
      const needsAnotherRun = await shouldContinueGoogleAdsBackgroundSync(input.businessId).catch(
        () => false
      );
      if (needsAnotherRun) {
        scheduleGoogleAdsBackgroundSync({
          businessId: input.businessId,
          delayMs: GOOGLE_ADS_BACKGROUND_LOOP_DELAY_MS,
        });
      }
    } catch (error) {
      console.error("[google-ads-sync] background_loop_failed", {
        businessId: input.businessId,
        message: error instanceof Error ? error.message : String(error),
      });
      scheduleGoogleAdsBackgroundSync({
        businessId: input.businessId,
        delayMs: GOOGLE_ADS_BACKGROUND_LOOP_DELAY_MS,
      });
    }
  }, Math.max(0, input.delayMs ?? 0));

  timers.set(input.businessId, timer);
  return true;
}

async function syncGoogleAdsDates(input: {
  businessId: string;
  dates: string[];
  syncType: GoogleAdsSyncType;
  triggerSource: string;
  scopes?: GoogleAdsWarehouseScope[];
}) {
  await expireStaleGoogleAdsSyncJobs({ businessId: input.businessId }).catch(() => null);
  const accountIds = await getAssignedGoogleAccounts(input.businessId).catch(() => []);
  if (accountIds.length === 0 || input.dates.length === 0) {
    return { businessId: input.businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  for (const date of input.dates) {
    for (const providerAccountId of accountIds) {
      try {
        const synced = await syncGoogleAdsAccountDay({
          businessId: input.businessId,
          providerAccountId,
          date,
          syncType: input.syncType,
          triggerSource: input.triggerSource,
          scopes: input.scopes,
        });
        if (synced) succeeded++;
        else skipped++;
      } catch (error) {
        failed++;
        console.warn("[google-ads-sync] day_failed", {
          businessId: input.businessId,
          providerAccountId,
          date,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    businessId: input.businessId,
    attempted: input.dates.length * accountIds.length,
    succeeded,
    failed,
    skipped: skipped > 0 && succeeded === 0 && failed === 0,
  };
}

async function syncGoogleAdsAccountDay(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  syncType: GoogleAdsSyncType;
  triggerSource: string;
  scopes?: GoogleAdsWarehouseScope[];
  partitionOwned?: boolean;
}) {
  const scopes = new Set<GoogleAdsWarehouseScope>(
    input.scopes ?? [
      "account_daily",
      "campaign_daily",
      "ad_group_daily",
      "ad_daily",
      "keyword_daily",
      "search_term_daily",
      "asset_group_daily",
      "asset_daily",
      "audience_daily",
      "geo_daily",
      "device_daily",
      "product_daily",
    ]
  );
  const wants = (scope: GoogleAdsWarehouseScope) => scopes.has(scope);
  const snapshot = await readProviderAccountSnapshot({
    businessId: input.businessId,
    provider: "google",
  }).catch(() => null);
  const profile = getScopeProfile(snapshot, input.providerAccountId);
  const baseParams = {
    businessId: input.businessId,
    accountId: input.providerAccountId,
    dateRange: "custom" as const,
    customStart: input.date,
    customEnd: input.date,
    debug: false,
  };

  const primaryScope = wants("campaign_daily") ? "campaign_daily" : "account_daily";
  const shouldWriteLegacyJobs = !input.partitionOwned;
  let jobIds: string[] = [];

  if (shouldWriteLegacyJobs) {
    const primaryJob = await createScopeSyncJob({
      ...input,
      startDate: input.date,
      endDate: input.date,
      scope: primaryScope,
    });
    if (!primaryJob?.id) return false;
    if (!primaryJob.created) {
      return false;
    }

    const secondaryScopes = Array.from(scopes).filter((scope) => scope !== primaryScope);
    const secondaryJobs = await Promise.all(
      secondaryScopes.map((scope) =>
        createScopeSyncJob({ ...input, startDate: input.date, endDate: input.date, scope })
      )
    );
    const jobs = [primaryJob, ...secondaryJobs];
    jobIds = jobs.map((job) => job?.id).filter((value): value is string => Boolean(value));
  }

  try {
    const campaigns = await getGoogleAdsCampaignsReport({
      ...baseParams,
      compareMode: "none",
      source: "google_ads_warehouse_sync",
    });
    const campaignRows = campaigns.rows as GenericRow[];
    const overview = aggregateAccountMetrics(campaignRows);
    const searchIntelligence =
      wants("search_term_daily") || wants("ad_group_daily")
        ? await getGoogleAdsSearchIntelligenceReport({
            ...baseParams,
            source: "google_ads_warehouse_sync",
          })
        : null;
    const keywords =
      wants("keyword_daily") || wants("ad_group_daily")
        ? await getGoogleAdsKeywordsReport({
            ...baseParams,
            source: "google_ads_warehouse_sync",
          })
        : null;
    const ads =
      wants("ad_daily") || wants("ad_group_daily")
        ? await getGoogleAdsAdsReport({
            ...baseParams,
            source: "google_ads_warehouse_sync",
          })
        : null;
    const assets = wants("asset_daily")
      ? await getGoogleAdsAssetsReport({
          ...baseParams,
          source: "google_ads_warehouse_sync",
        })
      : null;
    const assetGroups = wants("asset_group_daily")
      ? await getGoogleAdsAssetGroupsReport({
          ...baseParams,
          source: "google_ads_warehouse_sync",
        })
      : null;
    const audiences = wants("audience_daily")
      ? await getGoogleAdsAudiencesReport({
          ...baseParams,
          source: "google_ads_warehouse_sync",
        })
      : null;
    const geo = wants("geo_daily")
      ? await getGoogleAdsGeoReport({
          ...baseParams,
          source: "google_ads_warehouse_sync",
        })
      : null;
    const devices = wants("device_daily")
      ? await getGoogleAdsDevicesReport({
          ...baseParams,
          source: "google_ads_warehouse_sync",
        })
      : null;
    const products = wants("product_daily")
      ? await getGoogleAdsProductsReport({
          ...baseParams,
          source: "google_ads_warehouse_sync",
        })
      : null;

    if (wants("account_daily")) {
      await persistScopeRows({
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        date: input.date,
        accountTimezone: profile.timezone,
        accountCurrency: profile.currency,
        endpointName: "overview",
        scope: "account_daily",
        rows: [
          {
            id: input.providerAccountId,
            name: input.providerAccountId,
            ...overview,
            convRate:
              overview.clicks > 0
                ? Number(((overview.conversions / overview.clicks) * 100).toFixed(2))
                : 0,
          },
        ],
        requestContext: { source: "sync", report: "overview" },
        mapRow: (row, snapshotId) =>
          buildWarehouseRow({
            businessId: input.businessId,
            providerAccountId: input.providerAccountId,
            date: input.date,
            accountTimezone: profile.timezone,
            accountCurrency: profile.currency,
            entityKey: input.providerAccountId,
            entityLabel: nullIfEmpty(row.name),
            spend: toNumber(row.spend),
            revenue: toNumber(row.revenue),
            conversions: toNumber(row.conversions),
            impressions: toNumber(row.impressions),
            clicks: toNumber(row.clicks),
            conversionRate:
              row.convRate == null ? null : toNumber(row.convRate),
            interactionRate:
              row.interactionRate == null ? null : toNumber(row.interactionRate),
            payloadJson: row,
            sourceSnapshotId: snapshotId,
          }),
      });
    }

    if (wants("campaign_daily")) {
      await persistScopeRows({
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        date: input.date,
        accountTimezone: profile.timezone,
        accountCurrency: profile.currency,
        endpointName: "campaigns",
        scope: "campaign_daily",
        rows: campaigns.rows as GenericRow[],
        requestContext: { source: "sync", report: "campaigns" },
        mapRow: (row, snapshotId) =>
          buildWarehouseRow({
            businessId: input.businessId,
            providerAccountId: input.providerAccountId,
            date: input.date,
            accountTimezone: profile.timezone,
            accountCurrency: profile.currency,
            entityKey: String(row.id),
            entityLabel: nullIfEmpty(row.name),
            campaignId: String(row.id),
            campaignName: nullIfEmpty(row.name),
            status: nullIfEmpty(row.status),
            channel: nullIfEmpty(row.channel),
            spend: toNumber(row.spend),
            revenue: toNumber(row.revenue),
            conversions: toNumber(row.conversions),
            impressions: toNumber(row.impressions),
            clicks: toNumber(row.clicks),
            conversionRate: row.conversionRate == null ? null : toNumber(row.conversionRate),
            payloadJson: row,
            sourceSnapshotId: snapshotId,
          }),
      });
    }

    const searchSnapshot =
      wants("search_term_daily") && searchIntelligence
        ? await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "search_intelligence",
      scope: "search_term_daily",
      rows: searchIntelligence.rows as GenericRow[],
      requestContext: { source: "sync", report: "search_intelligence" },
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: [
            nullIfEmpty(row.searchTerm),
            nullIfEmpty(row.campaignId),
            nullIfEmpty(row.adGroupId),
          ]
            .filter(Boolean)
            .join(":"),
          entityLabel: nullIfEmpty(row.searchTerm),
          campaignId: nullIfEmpty(row.campaignId),
          campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
          adGroupId: nullIfEmpty(row.adGroupId),
          adGroupName: nullIfEmpty(row.adGroupName) ?? nullIfEmpty(row.adGroup),
          classification: nullIfEmpty(row.classification) ?? nullIfEmpty(row.intentClass),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
    })
        : null;

    if (wants("keyword_daily") && keywords) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "keywords",
      scope: "keyword_daily",
      rows: keywords.rows as GenericRow[],
      requestContext: { source: "sync", report: "keywords" },
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.criterionId) ?? `${nullIfEmpty(row.keywordText)}:${nullIfEmpty(row.adGroupId)}`,
          entityLabel: nullIfEmpty(row.keywordText),
          campaignId: nullIfEmpty(row.campaignId),
          campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
          adGroupId: nullIfEmpty(row.adGroupId),
          adGroupName: nullIfEmpty(row.adGroupName) ?? nullIfEmpty(row.adGroup),
          classification: nullIfEmpty(row.keywordState),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    const adsSnapshot =
      wants("ad_daily") && ads
        ? await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "ads",
      scope: "ad_daily",
      rows: ads.rows as GenericRow[],
      requestContext: { source: "sync", report: "ads" },
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.adId) ?? nullIfEmpty(row.id) ?? "",
          entityLabel: nullIfEmpty(row.assetName) ?? nullIfEmpty(row.headline) ?? nullIfEmpty(row.id),
          campaignId: nullIfEmpty(row.campaignId),
          campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
          adGroupId: nullIfEmpty(row.adGroupId),
          adGroupName: nullIfEmpty(row.adGroupName) ?? nullIfEmpty(row.adGroup),
          status: nullIfEmpty(row.status),
          channel: nullIfEmpty(row.channel),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
    })
        : null;

    if (wants("ad_group_daily")) {
      await upsertGoogleAdsDailyRows(
        "ad_group_daily",
        aggregateAdGroupRows({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          sourceSnapshotId: adsSnapshot?.snapshotId ?? searchSnapshot?.snapshotId ?? null,
          rows: [
            ...((ads?.rows as GenericRow[] | undefined) ?? []),
            ...((keywords?.rows as GenericRow[] | undefined) ?? []),
            ...((searchIntelligence?.rows as GenericRow[] | undefined) ?? []),
          ],
        })
      );
    }

    if (wants("asset_daily") && assets) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "assets",
      scope: "asset_daily",
      rows: assets.rows as GenericRow[],
      requestContext: { source: "sync", report: "assets" },
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.assetId) ?? nullIfEmpty(row.id) ?? "",
          entityLabel: nullIfEmpty(row.assetName) ?? nullIfEmpty(row.assetText),
          campaignId: nullIfEmpty(row.campaignId),
          campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
          adGroupId: nullIfEmpty(row.assetGroupId),
          adGroupName: nullIfEmpty(row.assetGroupName) ?? nullIfEmpty(row.assetGroup),
          classification: nullIfEmpty(row.assetState),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          interactionRate: row.interactionRate == null ? null : toNumber(row.interactionRate),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    if (wants("asset_group_daily") && assetGroups) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "asset_groups",
      scope: "asset_group_daily",
      rows: assetGroups.rows as GenericRow[],
      requestContext: { source: "sync", report: "asset_groups" },
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.assetGroupId) ?? nullIfEmpty(row.id) ?? "",
          entityLabel: nullIfEmpty(row.assetGroupName) ?? nullIfEmpty(row.name),
          campaignId: nullIfEmpty(row.campaignId),
          campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
          status: nullIfEmpty(row.status),
          classification: nullIfEmpty(row.classification),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          conversionRate: row.conversionRate == null ? null : toNumber(row.conversionRate),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    if (wants("audience_daily") && audiences) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "audiences",
      scope: "audience_daily",
      rows: audiences.rows as GenericRow[],
      requestContext: { source: "sync", report: "audiences" },
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.audienceKey) ?? `${nullIfEmpty(row.audienceType)}:${nullIfEmpty(row.adGroupId)}`,
          entityLabel: nullIfEmpty(row.audienceNameBestEffort) ?? nullIfEmpty(row.type),
          campaignId: nullIfEmpty(row.campaignId),
          campaignName: nullIfEmpty(row.campaignName) ?? nullIfEmpty(row.campaign),
          adGroupId: nullIfEmpty(row.adGroupId),
          adGroupName: nullIfEmpty(row.adGroupName) ?? nullIfEmpty(row.adGroup),
          classification: nullIfEmpty(row.audienceState),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    if (wants("geo_daily") && geo) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "geo",
      scope: "geo_daily",
      rows: geo.rows as GenericRow[],
      requestContext: { source: "sync", report: "geo" },
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.geoId) ?? nullIfEmpty(row.country) ?? nullIfEmpty(row.geoName) ?? "",
          entityLabel: nullIfEmpty(row.geoName) ?? nullIfEmpty(row.country),
          classification: nullIfEmpty(row.geoState),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    if (wants("device_daily") && devices) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "devices",
      scope: "device_daily",
      rows: devices.rows as GenericRow[],
      requestContext: { source: "sync", report: "devices" },
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.device) ?? "",
          entityLabel: nullIfEmpty(row.device),
          classification: nullIfEmpty(row.deviceState),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    if (wants("product_daily") && products) {
      await persistScopeRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      date: input.date,
      accountTimezone: profile.timezone,
      accountCurrency: profile.currency,
      endpointName: "products",
      scope: "product_daily",
      rows: products.rows as GenericRow[],
      requestContext: { source: "sync", report: "products" },
      mapRow: (row, snapshotId) =>
        buildWarehouseRow({
          businessId: input.businessId,
          providerAccountId: input.providerAccountId,
          date: input.date,
          accountTimezone: profile.timezone,
          accountCurrency: profile.currency,
          entityKey: nullIfEmpty(row.productItemId) ?? nullIfEmpty(row.itemId) ?? "",
          entityLabel: nullIfEmpty(row.productTitle) ?? nullIfEmpty(row.title),
          classification: nullIfEmpty(row.scaleState) ?? nullIfEmpty(row.underperformingState),
          spend: toNumber(row.spend),
          revenue: toNumber(row.revenue),
          conversions: toNumber(row.conversions),
          impressions: toNumber(row.impressions),
          clicks: toNumber(row.clicks),
          payloadJson: row,
          sourceSnapshotId: snapshotId,
        }),
      });
    }

    await Promise.all(
      jobIds.map((id) =>
        updateGoogleAdsSyncJob({
          id,
          status: "succeeded",
          progressPercent: 100,
          finishedAt: new Date().toISOString(),
        })
      )
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await Promise.all(
      jobIds.map((id) =>
        updateGoogleAdsSyncJob({
          id,
          status: "failed",
          lastError: message,
          finishedAt: new Date().toISOString(),
        })
      )
    );
    throw error;
  }
}

function classifyGoogleAdsSyncError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/RESOURCE_EXHAUSTED|quota|rate limit|429/i.test(message)) return "quota";
  if (/timeout|ECONNRESET|ENOTFOUND|server_login_retry|partial pkt/i.test(message)) return "transient";
  return "application";
}

function computePartitionRetryDelayMinutes(attemptCount: number, errorClass: string) {
  const base =
    errorClass === "quota"
      ? GOOGLE_ADS_QUOTA_RETRY_BASE_MINUTES
      : GOOGLE_ADS_TRANSIENT_RETRY_BASE_MINUTES;
  const exp = Math.min(attemptCount, 5);
  const jitter = Math.floor(Math.random() * 3);
  return Math.min(60, base * 2 ** Math.max(0, exp - 1) + jitter);
}

async function enqueueExtendedPartitionsForDate(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
}) {
  await Promise.all(
    GOOGLE_ADS_EXTENDED_SCOPES.map((scope) =>
      queueGoogleAdsSyncPartition({
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        lane: "extended",
        scope,
        partitionDate: input.date,
        status: "queued",
        priority: -5,
        source: "core_success",
        attemptCount: 0,
      }).catch(() => null)
    )
  );
}

async function refreshGoogleAdsSyncStateForPartition(input: {
  businessId: string;
  providerAccountId: string;
  scope: GoogleAdsWarehouseScope;
}) {
  const { historicalStart, yesterday } = await computeHistoricalTargets(input.businessId);
  const laneForScope: GoogleAdsSyncLane =
    input.scope === "account_daily" || input.scope === "campaign_daily" ? "core" : "extended";
  const [coverage, partitionHealth, readyThroughDate] = await Promise.all([
    getGoogleAdsDailyCoverage({
      scope: input.scope,
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      startDate: historicalStart,
      endDate: yesterday,
    }).catch(() => null),
    getGoogleAdsPartitionHealth({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      scope: input.scope,
      lane: laneForScope,
    }).catch(() => null),
    computeContiguousReadyThroughDate({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      scope: input.scope,
      targetStart: historicalStart,
      targetEnd: yesterday,
    }).catch(() => null),
  ]);
  await upsertGoogleAdsSyncState({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    scope: input.scope,
    historicalTargetStart: historicalStart,
    historicalTargetEnd: yesterday,
    effectiveTargetStart: historicalStart,
    effectiveTargetEnd: yesterday,
    readyThroughDate,
    lastSuccessfulPartitionDate: coverage?.ready_through_date ?? null,
    latestBackgroundActivityAt: partitionHealth?.latestActivityAt ?? new Date().toISOString(),
    latestSuccessfulSyncAt: coverage?.latest_updated_at ?? new Date().toISOString(),
    completedDays: coverage?.completed_days ?? 0,
    deadLetterCount: partitionHealth?.deadLetterPartitions ?? 0,
  });
}

async function processGoogleAdsPartition(input: {
  partition: {
    id?: string;
    businessId: string;
    providerAccountId: string;
    lane: GoogleAdsSyncLane;
    scope: GoogleAdsWarehouseScope;
    partitionDate: string;
    attemptCount: number;
    source: string;
  };
  workerId: string;
}) {
  const partitionId = input.partition.id;
  if (!partitionId) return false;
  await markGoogleAdsPartitionRunning({ partitionId, workerId: input.workerId });
  const runId = await createGoogleAdsSyncRun({
    partitionId,
    businessId: input.partition.businessId,
    providerAccountId: input.partition.providerAccountId,
    lane: input.partition.lane,
    scope: input.partition.scope,
    partitionDate: input.partition.partitionDate,
    status: "running",
    workerId: input.workerId,
    attemptCount: input.partition.attemptCount + 1,
    metaJson: { source: input.partition.source },
  });

  const startedAt = Date.now();
  try {
    const scopes =
      input.partition.lane === "core" || input.partition.lane === "maintenance"
        ? (["account_daily", "campaign_daily"] as GoogleAdsWarehouseScope[])
        : ([input.partition.scope] as GoogleAdsWarehouseScope[]);

    const synced = await syncGoogleAdsAccountDay({
      businessId: input.partition.businessId,
      providerAccountId: input.partition.providerAccountId,
      date: input.partition.partitionDate,
      syncType:
        input.partition.lane === "maintenance"
          ? input.partition.partitionDate === (await resolveGoogleAdsCurrentDate(input.partition.businessId).catch(() => input.partition.partitionDate))
            ? "today_refresh"
            : "incremental_recent"
          : "initial_backfill",
      triggerSource:
        input.partition.lane === "core"
          ? "background_initial"
          : input.partition.lane === "extended"
            ? "background_repair"
            : "background_recent",
      scopes,
      partitionOwned: true,
    });

    if (!synced) {
      await completeGoogleAdsPartition({
        partitionId,
        status: "failed",
        lastError: "partition skipped because another worker already owns this date",
        retryDelayMinutes: 5,
      });
      if (runId) {
        await updateGoogleAdsSyncRun({
          id: runId,
          status: "failed",
          errorClass: "lease_conflict",
          errorMessage: "partition skipped because another worker already owns this date",
          durationMs: Date.now() - startedAt,
          finishedAt: new Date().toISOString(),
        });
      }
      return false;
    }

    if (input.partition.lane === "core" || input.partition.lane === "maintenance") {
      await refreshGoogleAdsSyncStateForPartition({
        businessId: input.partition.businessId,
        providerAccountId: input.partition.providerAccountId,
        scope: "campaign_daily",
      });
      await refreshGoogleAdsSyncStateForPartition({
        businessId: input.partition.businessId,
        providerAccountId: input.partition.providerAccountId,
        scope: "account_daily",
      });
    } else {
      await refreshGoogleAdsSyncStateForPartition({
        businessId: input.partition.businessId,
        providerAccountId: input.partition.providerAccountId,
        scope: input.partition.scope,
      });
    }

    if (input.partition.lane === "core") {
      await enqueueExtendedPartitionsForDate({
        businessId: input.partition.businessId,
        providerAccountId: input.partition.providerAccountId,
        date: input.partition.partitionDate,
      });
    }

    await completeGoogleAdsPartition({
      partitionId,
      status: "succeeded",
      lastError: null,
    });
    if (runId) {
      await updateGoogleAdsSyncRun({
        id: runId,
        status: "succeeded",
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
      });
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorClass = classifyGoogleAdsSyncError(error);
    const nextAttempt = input.partition.attemptCount + 1;
    const status = nextAttempt >= GOOGLE_ADS_PARTITION_MAX_ATTEMPTS ? "dead_letter" : "failed";
    await completeGoogleAdsPartition({
      partitionId,
      status,
      lastError: message,
      retryDelayMinutes: computePartitionRetryDelayMinutes(nextAttempt, errorClass),
    });
    if (runId) {
      await updateGoogleAdsSyncRun({
        id: runId,
        status: "failed",
        errorClass,
        errorMessage: message,
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
      });
    }
    return false;
  }
}

export interface GoogleAdsSyncResult {
  businessId: string;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
}

export async function syncGoogleAdsRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  syncType?: GoogleAdsSyncType;
  triggerSource?: string;
}): Promise<GoogleAdsSyncResult> {
  const days = enumerateDays(input.startDate, input.endDate, input.syncType !== "initial_backfill");
  return syncGoogleAdsDates({
    businessId: input.businessId,
    dates: days,
    syncType: input.syncType ?? "incremental_recent",
    triggerSource: input.triggerSource ?? "system",
  });
}

export async function syncGoogleAdsRecent(businessId: string) {
  const today = await resolveGoogleAdsCurrentDate(businessId).catch(() =>
    new Date().toISOString().slice(0, 10)
  );
  const endDate = addDaysToIsoDate(today, -1);
  const dates = enumerateDays(
    addDaysToIsoDate(endDate, -(GOOGLE_ADS_RECENT_MAINTENANCE_DAYS - 1)),
    endDate,
    true
  );
  return syncGoogleAdsDates({
    businessId,
    dates,
    syncType: "incremental_recent",
    triggerSource: "background_recent",
  });
}

export async function syncGoogleAdsToday(businessId: string) {
  const today = await resolveGoogleAdsCurrentDate(businessId).catch(() =>
    new Date().toISOString().slice(0, 10)
  );
  return syncGoogleAdsDates({
    businessId,
    dates: [today],
    syncType: "today_refresh",
    triggerSource: "background_today",
  });
}

export async function syncGoogleAdsInitial(businessId: string) {
  const today = await resolveGoogleAdsCurrentDate(businessId).catch(() =>
    new Date().toISOString().slice(0, 10)
  );
  const yesterday = addDaysToIsoDate(today, -1);
  const dates = enumerateDays(
    getHistoricalWindowStart(yesterday, GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS),
    yesterday,
    true
  ).slice(0, GOOGLE_ADS_BOOTSTRAP_BATCH_DAYS);
  return syncGoogleAdsDates({
    businessId,
    dates,
    syncType: "initial_backfill",
    triggerSource: "background_initial",
    scopes: ["account_daily", "campaign_daily"],
  });
}

export async function syncGoogleAdsRepairRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  return syncGoogleAdsRange({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    syncType: "repair_window",
    triggerSource: "background_repair",
  });
}

export async function ensureGoogleAdsWarehouseRangeFilled(input: {
  businessId: string;
  scope?: GoogleAdsWarehouseScope;
  startDate: string;
  endDate: string;
}) {
  // Non-blocking legacy compatibility helper: keep background sync moving, but do not create
  // request-time selected-range queue storms.
  scheduleGoogleAdsBackgroundSync({ businessId: input.businessId, delayMs: 0 });
}

export async function syncGoogleAdsReports(businessId: string): Promise<GoogleAdsSyncResult> {
  await cleanupGoogleAdsObsoleteSyncJobs({ businessId }).catch(() => null);
  await expireStaleGoogleAdsSyncJobs({ businessId }).catch(() => null);
  await cleanupGoogleAdsPartitionOrchestration({ businessId }).catch(() => null);

  const backgroundSyncKeys = getBackgroundSyncKeys();
  const lockKey = `background:${businessId}`;
  if (backgroundSyncKeys.has(lockKey)) {
    return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
  }

  backgroundSyncKeys.add(lockKey);
  const workerId = getGoogleAdsWorkerId();
  try {
    const runnerLease = await acquireGoogleAdsRunnerLease({
      businessId,
      lane: "core",
      leaseOwner: workerId,
      leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
    }).catch(() => null);
    if (!runnerLease) {
      return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
    }

    await refreshGoogleAdsSyncStateForBusiness({ businessId }).catch((error) => {
      console.warn("[google-ads-sync] state_refresh_before_run_failed", {
        businessId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    await enqueueHistoricalCorePartitions(businessId).catch(() => 0);
    await enqueueMaintenancePartitions(businessId).catch(() => null);

    let partitions = await leaseGoogleAdsSyncPartitions({
      businessId,
      lane: "core",
      workerId,
      limit: GOOGLE_ADS_CORE_WORKER_LIMIT,
      leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
    }).catch(() => []);
    if (partitions.length === 0) {
      partitions = await leaseGoogleAdsSyncPartitions({
        businessId,
        lane: "maintenance",
        workerId,
        limit: GOOGLE_ADS_MAINTENANCE_WORKER_LIMIT,
        leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
      }).catch(() => []);
    }
    if (partitions.length === 0) {
      const queueHealth = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
      const hasCoreBacklog =
        (queueHealth?.coreQueueDepth ?? 0) > 0 ||
        (queueHealth?.coreLeasedPartitions ?? 0) > 0 ||
        (queueHealth?.maintenanceQueueDepth ?? 0) > 0 ||
        (queueHealth?.maintenanceLeasedPartitions ?? 0) > 0;
      if (!hasCoreBacklog) {
        partitions = await leaseGoogleAdsSyncPartitions({
          businessId,
          lane: "extended",
          workerId,
          limit: GOOGLE_ADS_EXTENDED_WORKER_LIMIT,
          leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
        }).catch(() => []);
      }
    }
    if (partitions.length === 0) {
      const queueHealth = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
      if ((queueHealth?.queueDepth ?? 0) > 0 || (queueHealth?.leasedPartitions ?? 0) > 0) {
        scheduleGoogleAdsBackgroundSync({ businessId, delayMs: GOOGLE_ADS_BACKGROUND_LOOP_DELAY_MS });
      }
      return { businessId, attempted: 0, succeeded: 0, failed: 0, skipped: true };
    }

    let attempted = partitions.length;
    let succeeded = 0;
    let failed = 0;
    for (const partition of partitions) {
      const ok = await processGoogleAdsPartition({
        partition: {
          id: partition.id,
          businessId: partition.businessId,
          providerAccountId: partition.providerAccountId,
          lane: partition.lane,
          scope: partition.scope,
          partitionDate: partition.partitionDate,
          attemptCount: partition.attemptCount,
          source: partition.source,
        },
        workerId,
      });
      if (ok) succeeded++;
      else failed++;
    }

    let postBatchQueueHealth = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
    const shouldBurstExtended =
      partitions.every((partition) => partition.lane !== "extended") &&
      (postBatchQueueHealth?.extendedQueueDepth ?? 0) > 0 &&
      (postBatchQueueHealth?.coreQueueDepth ?? 0) <= GOOGLE_ADS_EXTENDED_CORE_BACKLOG_THRESHOLD &&
      (postBatchQueueHealth?.coreLeasedPartitions ?? 0) === 0 &&
      (postBatchQueueHealth?.maintenanceQueueDepth ?? 0) === 0 &&
      (postBatchQueueHealth?.maintenanceLeasedPartitions ?? 0) === 0;

    if (shouldBurstExtended) {
      const extendedPartitions = await leaseGoogleAdsSyncPartitions({
        businessId,
        lane: "extended",
        workerId,
        limit: GOOGLE_ADS_EXTENDED_BURST_WORKER_LIMIT,
        leaseMinutes: GOOGLE_ADS_PARTITION_LEASE_MINUTES,
      }).catch(() => []);

      attempted += extendedPartitions.length;
      for (const partition of extendedPartitions) {
        const ok = await processGoogleAdsPartition({
          partition: {
            id: partition.id,
            businessId: partition.businessId,
            providerAccountId: partition.providerAccountId,
            lane: partition.lane,
            scope: partition.scope,
            partitionDate: partition.partitionDate,
            attemptCount: partition.attemptCount,
            source: partition.source,
          },
          workerId,
        });
        if (ok) succeeded++;
        else failed++;
      }

      postBatchQueueHealth = await getGoogleAdsQueueHealth({ businessId }).catch(() => null);
    }

    await refreshGoogleAdsSyncStateForBusiness({ businessId }).catch((error) => {
      console.warn("[google-ads-sync] state_refresh_after_run_failed", {
        businessId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    const queueHealth = postBatchQueueHealth ?? (await getGoogleAdsQueueHealth({ businessId }).catch(() => null));
    if ((queueHealth?.queueDepth ?? 0) > 0 || (queueHealth?.leasedPartitions ?? 0) > 0) {
      const nextDelayMs =
        (queueHealth?.extendedQueueDepth ?? 0) > 0 &&
        (queueHealth?.coreQueueDepth ?? 0) <= GOOGLE_ADS_EXTENDED_CORE_BACKLOG_THRESHOLD &&
        (queueHealth?.maintenanceQueueDepth ?? 0) === 0
          ? Math.max(750, Math.floor(GOOGLE_ADS_BACKGROUND_LOOP_DELAY_MS / 3))
          : GOOGLE_ADS_BACKGROUND_LOOP_DELAY_MS;
      scheduleGoogleAdsBackgroundSync({ businessId, delayMs: nextDelayMs });
    }
    return {
      businessId,
      attempted,
      succeeded,
      failed,
      skipped: attempted === 0,
    };
  } finally {
    await releaseGoogleAdsRunnerLease({
      businessId,
      lane: "core",
      leaseOwner: workerId,
    }).catch(() => null);
    backgroundSyncKeys.delete(lockKey);
  }
}
