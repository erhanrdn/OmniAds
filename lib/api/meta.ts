/**
 * lib/api/meta.ts
 *
 * Server-only service layer for the Meta Ads platform.
 * All functions are async and call the Meta Graph API directly.
 * Intended for use in Server Components and API route handlers.
 *
 * Import pattern: import { getCampaigns, ... } from "@/lib/api/meta";
 */

import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import {
  appendMetaConfigSnapshots,
  readLatestMetaConfigSnapshots,
  readPreviousDifferentMetaConfigDiffs,
} from "@/lib/meta/config-snapshots";
import { buildConfigSnapshotPayload } from "@/lib/meta/configuration";
import {
  buildMetaSyncCheckpointHash,
  getMetaSyncCheckpoint,
  heartbeatMetaPartitionLease,
  listMetaRawSnapshotsForPartition,
  buildMetaRawSnapshotHash,
  createMetaSyncJob,
  persistMetaRawSnapshot,
  upsertMetaSyncCheckpoint,
  updateMetaSyncJob,
  upsertMetaAccountDailyRows,
  upsertMetaAdDailyRows,
  upsertMetaAdSetDailyRows,
  upsertMetaCampaignDailyRows,
} from "@/lib/meta/warehouse";
import type {
  MetaRawSnapshotStatus,
  MetaSyncCheckpointRecord,
  MetaSyncType,
  MetaWarehouseScope,
} from "@/lib/meta/warehouse-types";

// ── Core metric interface ─────────────────────────────────────────────────────

/**
 * The canonical metric shape for every Meta entity (campaign, ad set, breakdown).
 * Currency fields (spend, revenue, cpa, cpm) use .toFixed(2) precision at the
 * display layer. The raw numbers here are already rounded to 2 decimal places.
 */
export interface MetaMetricsData {
  spend: number;       // USD, rounded to 2 dp
  purchases: number;   // integer count
  revenue: number;     // USD, rounded to 2 dp
  roas: number;        // ratio, rounded to 2 dp
  cpa: number;         // USD per purchase, rounded to 2 dp
  ctr: number;         // percent (e.g. 1.23 = 1.23%), rounded to 2 dp
  cpm: number;         // USD per 1000 impressions, rounded to 2 dp
  impressions: number; // integer count
  clicks: number;      // integer count
}

export interface MetaCampaignData extends MetaMetricsData {
  id: string;
  accountId?: string;
  name: string;
  status: string; // "ACTIVE" | "PAUSED" | "ARCHIVED" | "UNKNOWN"
  objective?: string | null;
  budgetLevel?: "campaign" | "adset" | null;
  optimizationGoal: string | null;
  bidStrategyType: string | null;
  bidStrategyLabel: string | null;
  manualBidAmount: number | null;
  previousManualBidAmount?: number | null;
  bidValue: number | null;
  bidValueFormat: "currency" | "roas" | null;
  previousBidValue?: number | null;
  previousBidValueFormat?: "currency" | "roas" | null;
  previousBidValueCapturedAt?: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  previousDailyBudget?: number | null;
  previousLifetimeBudget?: number | null;
  previousBudgetCapturedAt?: string | null;
  isBudgetMixed: boolean;
  isConfigMixed: boolean;
  isOptimizationGoalMixed?: boolean;
  isBidStrategyMixed?: boolean;
  isBidValueMixed?: boolean;
}

export interface MetaAdSetData extends MetaMetricsData {
  id: string;
  accountId?: string;
  name: string;
  campaignId: string;
  status: string;
  budgetLevel?: "campaign" | "adset" | null;
  dailyBudget: number | null;    // USD, null when lifetime budget is used
  lifetimeBudget: number | null; // USD, null when daily budget is used
  optimizationGoal: string | null;
  bidStrategyType: string | null;
  bidStrategyLabel: string | null;
  manualBidAmount: number | null;
  previousManualBidAmount?: number | null;
  bidValue: number | null;
  bidValueFormat: "currency" | "roas" | null;
  previousBidValue?: number | null;
  previousBidValueFormat?: "currency" | "roas" | null;
  previousBidValueCapturedAt?: string | null;
  isBudgetMixed: boolean;
  previousDailyBudget?: number | null;
  previousLifetimeBudget?: number | null;
  previousBudgetCapturedAt?: string | null;
  isConfigMixed: boolean;
  isOptimizationGoalMixed?: boolean;
  isBidStrategyMixed?: boolean;
  isBidValueMixed?: boolean;
}

export interface MetaBreakdownRow extends MetaMetricsData {
  key: string;   // stable identifier for de-duplication
  label: string; // human-readable display string
}

// ── Internal raw API types ────────────────────────────────────────────────────

interface MetaActionValue {
  action_type: string;
  value: string;
}

interface RawCampaignInsight {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  ctr?: string;
  cpm?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
}

interface RawCampaign {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  bid_amount?: string;
  bid_constraints?: {
    roas_average_floor?: string;
  };
}

interface RawAdSetInsight {
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  spend?: string;
  ctr?: string;
  cpm?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
}

interface RawAdSet {
  id: string;
  name: string;
  campaign_id?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  bid_strategy?: string;
  bid_amount?: string;
  bid_constraints?: {
    roas_average_floor?: string;
  };
}

interface RawAdInsight {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  reach?: string;
  frequency?: string;
  spend?: string;
  ctr?: string;
  cpm?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
}

interface RawAd {
  id: string;
  name?: string;
  effective_status?: string;
  status?: string;
  adset_id?: string;
  campaign_id?: string;
}

interface RawBreakdownInsight {
  age?: string;
  gender?: string;
  country?: string;
  region?: string;
  publisher_platform?: string;
  platform_position?: string;
  impression_device?: string;
  spend?: string;
  clicks?: string;
  impressions?: string;
  ctr?: string;
  cpm?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
}

interface MetaGraphCollectionResponse<TItem> {
  data?: TItem[];
  paging?: {
    next?: string;
  };
}

// ── Credential resolution ─────────────────────────────────────────────────────

export interface MetaCredentials {
  businessId: string;
  accessToken: string;
  accountIds: string[];
  currency: string; // ISO 4217 code from the primary ad account (e.g. "USD", "EUR", "TRY")
  accountProfiles: Record<
    string,
    {
      currency: string;
      timezone: string | null;
      name: string | null;
    }
  >;
}

const META_ACCOUNT_PROFILE_TIMEOUT_MS = 8_000;

function readPositiveEnvNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const META_FETCH_TIMEOUT_MS = readPositiveEnvNumber("META_FETCH_TIMEOUT_MS", 90_000);
const META_FETCH_HEARTBEAT_INTERVAL_MS = readPositiveEnvNumber(
  "META_FETCH_HEARTBEAT_INTERVAL_MS",
  30_000
);
const DEFAULT_META_PARTITION_LEASE_MINUTES = readPositiveEnvNumber(
  "META_PARTITION_LEASE_MINUTES",
  15
);

function normalizeMetaApiDate(value: string): string {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  throw new Error(`Invalid Meta date input: ${value}`);
}

/**
 * Resolve the Meta access token and assigned ad account IDs for a business.
 * Returns null when the integration is missing, disconnected, or has no
 * assigned accounts — callers should treat null as "show empty state".
 */
export async function resolveMetaCredentials(
  businessId: string
): Promise<MetaCredentials | null> {
  const [integration, accountRow] = await Promise.all([
    getIntegration(businessId, "meta").catch(() => null),
    getProviderAccountAssignments(businessId, "meta").catch(() => null),
  ]);

  const accessToken = integration?.access_token;
  const accountIds = accountRow?.account_ids ?? [];

  if (!accessToken || accountIds.length === 0) return null;

  const accountProfiles = Object.fromEntries(
    await Promise.all(
      accountIds.map(async (accountId) => [
        accountId,
        await fetchAccountProfile(accountId, accessToken),
      ])
    )
  );
  const currency = accountProfiles[accountIds[0]]?.currency ?? "USD";

  return { businessId, accessToken, accountIds, currency, accountProfiles };
}

async function fetchAccountProfile(
  accountId: string,
  accessToken: string
): Promise<{ currency: string; timezone: string | null; name: string | null }> {
  try {
    const url = new URL(`https://graph.facebook.com/v25.0/${accountId}`);
    url.searchParams.set("fields", "currency,name,timezone_name");
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(META_ACCOUNT_PROFILE_TIMEOUT_MS),
    });
    if (!res.ok) return { currency: "USD", timezone: null, name: null };
    const json = (await res.json()) as {
      currency?: string;
      name?: string;
      timezone_name?: string;
    };
    return {
      currency: json.currency ?? "USD",
      timezone: json.timezone_name ?? null,
      name: json.name ?? null,
    };
  } catch {
    return { currency: "USD", timezone: null, name: null };
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseAction(arr: MetaActionValue[] | undefined, type: string): number {
  if (!Array.isArray(arr)) return 0;
  const found = arr.find((a) => a.action_type === type);
  return found ? parseFloat(found.value) || 0 : 0;
}

function parseNum(input: string | undefined): number {
  return input ? parseFloat(input) || 0 : 0;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function fetchPagedCollection<TItem>(initialUrl: string): Promise<TItem[]> {
  const rows: TItem[] = [];
  let nextUrl: string | null = initialUrl;
  let pageCount = 0;

  while (nextUrl && pageCount < 20) {
    const res = await fetch(nextUrl, { cache: "no-store" });
    if (!res.ok) break;
    const json = (await res.json()) as MetaGraphCollectionResponse<TItem>;
    rows.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
    pageCount += 1;
  }

  return rows;
}

function getTodayIsoForTimeZone(timeZone?: string | null): string {
  if (!timeZone) return new Date().toISOString().slice(0, 10);
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

function inferRequestSyncType(
  since: string,
  until: string,
  referenceToday?: string | null
): MetaSyncType {
  const normalizedSince = normalizeMetaApiDate(since);
  const normalizedUntil = normalizeMetaApiDate(until);
  if (normalizedSince === normalizedUntil) {
    return normalizedSince === (referenceToday ?? "").slice(0, 10)
      ? "today_refresh"
      : "repair_window";
  }
  const start = new Date(`${normalizedSince}T00:00:00Z`).getTime();
  const end = new Date(`${normalizedUntil}T00:00:00Z`).getTime();
  const daySpan = Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(1, Math.round((end - start) / 86_400_000) + 1)
    : 1;
  if (daySpan <= 7) return "incremental_recent";
  return "repair_window";
}

function isSingleDayWindow(since: string, until: string) {
  return normalizeMetaApiDate(since) === normalizeMetaApiDate(until);
}

async function withMetaSyncJob<T>(input: {
  credentials: MetaCredentials;
  accountId: string;
  scope: MetaWarehouseScope;
  since: string;
  until: string;
  run: () => Promise<T>;
}) {
  const normalizedSince = normalizeMetaApiDate(input.since);
  const normalizedUntil = normalizeMetaApiDate(input.until);
  const accountTimezone =
    input.credentials.accountProfiles[input.accountId]?.timezone ?? null;
  const syncJobId = await createMetaSyncJob({
    businessId: input.credentials.businessId,
    providerAccountId: input.accountId,
    syncType: inferRequestSyncType(
      normalizedSince,
      normalizedUntil,
      getTodayIsoForTimeZone(accountTimezone)
    ),
    scope: input.scope,
    startDate: normalizedSince,
    endDate: normalizedUntil,
    status: "running",
    progressPercent: 5,
    triggerSource: "request_runtime",
    retryCount: 0,
    lastError: null,
    startedAt: new Date().toISOString(),
  });

  try {
    const result = await input.run();
    if (syncJobId) {
      await updateMetaSyncJob({
        id: syncJobId,
        status: "succeeded",
        progressPercent: 100,
        finishedAt: new Date().toISOString(),
      });
    }
    return result;
  } catch (error) {
    if (syncJobId) {
      await updateMetaSyncJob({
        id: syncJobId,
        status: "failed",
        progressPercent: 100,
        lastError: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString(),
      });
    }
    throw error;
  }
}

async function recordMetaRawSnapshot(input: {
  credentials: MetaCredentials;
  accountId: string;
  endpointName: string;
  entityScope: string;
  partitionId?: string | null;
  checkpointId?: string | null;
  pageIndex?: number | null;
  providerCursor?: string | null;
  since: string;
  until: string;
  payload: unknown;
  status: MetaRawSnapshotStatus;
  providerHttpStatus?: number | null;
  requestContext?: Record<string, unknown>;
  responseHeaders?: Record<string, unknown>;
}) {
  const normalizedSince = normalizeMetaApiDate(input.since);
  const normalizedUntil = normalizeMetaApiDate(input.until);
  const profile = input.credentials.accountProfiles[input.accountId];
  return persistMetaRawSnapshot({
    businessId: input.credentials.businessId,
    providerAccountId: input.accountId,
    partitionId: input.partitionId ?? null,
    checkpointId: input.checkpointId ?? null,
    endpointName: input.endpointName,
    entityScope: input.entityScope,
    pageIndex: input.pageIndex ?? null,
    providerCursor: input.providerCursor ?? null,
    startDate: normalizedSince,
    endDate: normalizedUntil,
    accountTimezone: profile?.timezone ?? null,
    accountCurrency: profile?.currency ?? input.credentials.currency,
    payloadJson: input.payload,
    payloadHash: buildMetaRawSnapshotHash({
      businessId: input.credentials.businessId,
      providerAccountId: input.accountId,
      endpointName: input.endpointName,
      startDate: normalizedSince,
      endDate: normalizedUntil,
      payload: input.payload,
    }),
    requestContext: input.requestContext ?? {},
    responseHeaders: input.responseHeaders ?? {},
    providerHttpStatus: input.providerHttpStatus ?? null,
    status: input.status,
  });
}

/**
 * Derive the full MetaMetricsData object from raw Meta API fields.
 * Revenue falls back to spend × purchase_roas when action_values is absent.
 */
function buildMetrics(input: {
  spend_str?: string;
  ctr_str?: string;
  cpm_str?: string;
  impressions_str?: string;
  clicks_str?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
}): MetaMetricsData {
  const spend = parseNum(input.spend_str);
  const purchases = parseAction(input.actions, "purchase");
  const revenueFromValues = parseAction(input.action_values, "purchase");
  const purchaseRoasVal = parseAction(input.purchase_roas, "omni_purchase");
  const revenue =
    revenueFromValues > 0 ? revenueFromValues : spend * purchaseRoasVal;
  const roas = spend > 0 ? revenue / spend : 0;
  const cpa = purchases > 0 ? spend / purchases : 0;

  return {
    spend: r2(spend),
    purchases: Math.round(purchases),
    revenue: r2(revenue),
    roas: r2(roas),
    cpa: r2(cpa),
    ctr: r2(parseNum(input.ctr_str)),
    cpm: r2(parseNum(input.cpm_str)),
    impressions: Math.round(parseNum(input.impressions_str)),
    clicks: Math.round(parseNum(input.clicks_str)),
  };
}

export interface MetaBusinessUsageSummary {
  raw: string | null;
  maxPercent: number;
}

export interface MetaBulkCoreSyncResult {
  accountRowsWritten: number;
  campaignRowsWritten: number;
  adsetRowsWritten: number;
  adRowsWritten: number;
  positiveSpendAdIds: string[];
  pageCount: number;
  restoredPageCount: number;
  throttleCount: number;
  lastUsagePercent: number;
  memoryInstrumentation?: {
    maxHeapUsedBytes: number;
    maxRowsBuffered: number;
    flushThresholdRows: number;
    oversizeWarning: boolean;
  };
}

const META_BULK_PAGE_LIMIT = 1000;
const META_USAGE_THROTTLE_THRESHOLD = 85;
const META_USAGE_THROTTLE_SLEEP_MS = 15_000;
const META_MEMORY_FLUSH_THRESHOLD_ROWS = Number(process.env.META_MEMORY_FLUSH_THRESHOLD_ROWS ?? 20_000) || 20_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseUsageMaxPercent(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (Array.isArray(value)) return value.reduce((max, item) => Math.max(max, parseUsageMaxPercent(item)), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce((max, item) => Math.max(max, parseUsageMaxPercent(item)), 0);
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    try {
      return parseUsageMaxPercent(JSON.parse(value));
    } catch {
      return 0;
    }
  }
  return 0;
}

function parseMetaBusinessUsageHeader(headers: Headers): MetaBusinessUsageSummary {
  const raw = headers.get("x-business-use-case-usage");
  if (!raw) return { raw: null, maxPercent: 0 };
  return {
    raw,
    maxPercent: parseUsageMaxPercent(raw),
  };
}

function getMetaBulkCoreEndpointName() {
  return "ad_insights_bulk";
}

function buildMetaBulkCoreInsightsUrl(input: {
  accountId: string;
  accessToken: string;
  since: string;
  until: string;
}) {
  const url = new URL(`https://graph.facebook.com/v25.0/${input.accountId}/insights`);
  url.searchParams.set("level", "ad");
  url.searchParams.set(
    "fields",
    "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,reach,frequency,spend,ctr,cpm,impressions,clicks,actions,action_values,purchase_roas"
  );
  url.searchParams.set("time_range", JSON.stringify({ since: input.since, until: input.until }));
  url.searchParams.set("limit", String(META_BULK_PAGE_LIMIT));
  url.searchParams.set("access_token", input.accessToken);
  return url.toString();
}

function buildMetaBreakdownInsightsUrl(input: {
  accountId: string;
  accessToken: string;
  since: string;
  until: string;
  breakdowns: string;
  positiveSpendAdIds: string[];
}) {
  const url = new URL(`https://graph.facebook.com/v25.0/${input.accountId}/insights`);
  url.searchParams.set("level", "ad");
  url.searchParams.set(
    "fields",
    "ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,spend,ctr,cpm,impressions,clicks,actions,action_values,purchase_roas"
  );
  url.searchParams.set("breakdowns", input.breakdowns);
  url.searchParams.set("time_range", JSON.stringify({ since: input.since, until: input.until }));
  url.searchParams.set("limit", String(META_BULK_PAGE_LIMIT));
  if (input.positiveSpendAdIds.length > 0 && input.positiveSpendAdIds.length <= 200) {
    url.searchParams.set(
      "filtering",
      JSON.stringify([{ field: "ad.id", operator: "IN", value: input.positiveSpendAdIds }])
    );
  }
  url.searchParams.set("access_token", input.accessToken);
  return url.toString();
}

function startMetaFetchHeartbeat(input: {
  partitionId: string;
  workerId: string;
  leaseEpoch: number;
  leaseMinutes: number;
}) {
  return setInterval(() => {
    void heartbeatMetaPartitionLease({
      partitionId: input.partitionId,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      leaseMinutes: input.leaseMinutes,
    }).catch(() => null);
  }, META_FETCH_HEARTBEAT_INTERVAL_MS);
}

async function heartbeatOwnedMetaPartitionLeaseOrThrow(input: {
  partitionId: string;
  workerId: string;
  leaseEpoch: number;
  leaseMinutes: number;
}) {
  const ok = await heartbeatMetaPartitionLease({
    partitionId: input.partitionId,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    leaseMinutes: input.leaseMinutes,
  });
  if (!ok) {
    throw new Error("lease_conflict:lease_heartbeat_rejected");
  }
}

async function upsertOwnedMetaCheckpointOrThrow(input: MetaSyncCheckpointRecord) {
  const checkpointId = await upsertMetaSyncCheckpoint(input);
  if (input.leaseOwner && !checkpointId) {
    throw new Error("lease_conflict:checkpoint_write_rejected");
  }
  return checkpointId;
}

async function fetchMetaPagedJson<TItem>(url: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(META_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "";
    if (
      name === "AbortError" ||
      name === "TimeoutError" ||
      /timed out|abort|aborted/i.test(message)
    ) {
      throw new Error(`Meta request timed out after ${META_FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  }
  const json = (await response.json().catch(() => ({}))) as MetaGraphCollectionResponse<TItem> & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(json.error?.message ?? `Meta request failed with status ${response.status}`);
  }
  return {
    response,
    json,
  } as {
    response: Response;
    json: MetaGraphCollectionResponse<TItem> & { error?: { message?: string } };
  };
}

type MetaAggregateTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  conversions: number;
  revenue: number;
};

function createEmptyTotals(): MetaAggregateTotals {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
    conversions: 0,
    revenue: 0,
  };
}

function accumulateAdInsight(
  row: RawAdInsight,
  target: MetaAggregateTotals & {
    name?: string | null;
    campaignId?: string | null;
    adsetId?: string | null;
    status?: string | null;
    frequencySum?: number;
    frequencyWeight?: number;
    payloadJson?: unknown;
  }
) {
  const metrics = buildMetrics({
    spend_str: row.spend,
    ctr_str: row.ctr,
    cpm_str: row.cpm,
    impressions_str: row.impressions,
    clicks_str: row.clicks,
    actions: row.actions,
    action_values: row.action_values,
    purchase_roas: row.purchase_roas,
  });
  target.spend = r2(target.spend + metrics.spend);
  target.impressions += metrics.impressions;
  target.clicks += metrics.clicks;
  target.reach += Math.round(parseNum(row.reach ?? row.impressions));
  target.conversions += metrics.purchases;
  target.revenue = r2(target.revenue + metrics.revenue);
  const frequency = parseNum(row.frequency);
  if (frequency > 0 && metrics.impressions > 0) {
    target.frequencySum = (target.frequencySum ?? 0) + frequency * metrics.impressions;
    target.frequencyWeight = (target.frequencyWeight ?? 0) + metrics.impressions;
  }
}

function deriveWarehouseMetrics(input: MetaAggregateTotals & { frequencySum?: number; frequencyWeight?: number }) {
  const frequency =
    (input.frequencyWeight ?? 0) > 0
      ? r2((input.frequencySum ?? 0) / Math.max(1, input.frequencyWeight ?? 0))
      : null;
  const ctr = input.impressions > 0 ? r2((input.clicks / input.impressions) * 100) : null;
  const cpc = input.clicks > 0 ? r2(input.spend / input.clicks) : null;
  const cpa = input.conversions > 0 ? r2(input.spend / input.conversions) : null;
  const roas = input.spend > 0 ? r2(input.revenue / input.spend) : 0;
  return {
    frequency,
    ctr,
    cpc,
    cpa,
    roas,
  };
}

function applyAdInsightRowsToAggregates(
  rows: RawAdInsight[],
  aggregates: {
    account: MetaAggregateTotals & { frequencySum?: number; frequencyWeight?: number };
    campaigns: Map<string, MetaAggregateTotals & { name?: string | null; status?: string | null; frequencySum?: number; frequencyWeight?: number }>;
    adsets: Map<string, MetaAggregateTotals & { campaignId?: string | null; name?: string | null; status?: string | null; frequencySum?: number; frequencyWeight?: number }>;
    ads: Map<string, MetaAggregateTotals & { campaignId?: string | null; adsetId?: string | null; name?: string | null; status?: string | null; reach?: number; frequencySum?: number; frequencyWeight?: number; payloadJson?: unknown }>;
  }
) {
  for (const row of rows) {
    const campaignId = row.campaign_id ?? "";
    const adsetId = row.adset_id ?? "";
    const adId = row.ad_id ?? "";
    accumulateAdInsight(row, aggregates.account);
    if (campaignId) {
      const target =
        aggregates.campaigns.get(campaignId) ??
        (createEmptyTotals() as MetaAggregateTotals & {
          name?: string | null;
          status?: string | null;
          frequencySum?: number;
          frequencyWeight?: number;
        });
      target.name = row.campaign_name ?? target.name ?? null;
      accumulateAdInsight(row, target);
      aggregates.campaigns.set(campaignId, target);
    }
    if (adsetId) {
      const target =
        aggregates.adsets.get(adsetId) ??
        (createEmptyTotals() as MetaAggregateTotals & {
          campaignId?: string | null;
          name?: string | null;
          status?: string | null;
          frequencySum?: number;
          frequencyWeight?: number;
        });
      target.name = row.adset_name ?? target.name ?? null;
      target.campaignId = campaignId || target.campaignId || null;
      accumulateAdInsight(row, target);
      aggregates.adsets.set(adsetId, target);
    }
    if (adId) {
      const target =
        aggregates.ads.get(adId) ??
        (createEmptyTotals() as MetaAggregateTotals & {
          campaignId?: string | null;
          adsetId?: string | null;
          name?: string | null;
          status?: string | null;
          reach?: number;
          frequencySum?: number;
          frequencyWeight?: number;
          payloadJson?: unknown;
        });
      target.name = row.ad_name ?? target.name ?? null;
      target.campaignId = campaignId || target.campaignId || null;
      target.adsetId = adsetId || target.adsetId || null;
      target.payloadJson = row;
      accumulateAdInsight(row, target);
      aggregates.ads.set(adId, target);
    }
  }
}

export async function syncMetaAccountCoreWarehouseDay(input: {
  credentials: MetaCredentials;
  accountId: string;
  day: string;
  partitionId: string;
  workerId: string;
  leaseEpoch: number;
  attemptCount: number;
  leaseMinutes?: number;
}) : Promise<MetaBulkCoreSyncResult> {
  const normalizedDay = normalizeMetaApiDate(input.day);
  const profile = input.credentials.accountProfiles[input.accountId];
  const checkpointScope = "core_ad_insights";
  const endpointName = getMetaBulkCoreEndpointName();
  const checkpoint = await getMetaSyncCheckpoint({
    partitionId: input.partitionId,
    checkpointScope,
  });
  const restoredPages = await listMetaRawSnapshotsForPartition({
    partitionId: input.partitionId,
    endpointName,
  });
  const aggregates = {
    account: createEmptyTotals() as MetaAggregateTotals & { frequencySum?: number; frequencyWeight?: number },
    campaigns: new Map<string, MetaAggregateTotals & { name?: string | null; status?: string | null; frequencySum?: number; frequencyWeight?: number }>(),
    adsets: new Map<string, MetaAggregateTotals & { campaignId?: string | null; name?: string | null; status?: string | null; frequencySum?: number; frequencyWeight?: number }>(),
    ads: new Map<string, MetaAggregateTotals & { campaignId?: string | null; adsetId?: string | null; name?: string | null; status?: string | null; reach?: number; frequencySum?: number; frequencyWeight?: number; payloadJson?: unknown }>(),
  };
  let maxHeapUsedBytes = process.memoryUsage().heapUsed;
  let maxRowsBuffered = 0;

  function captureMemorySnapshot() {
    const heapUsed = process.memoryUsage().heapUsed;
    maxHeapUsedBytes = Math.max(maxHeapUsedBytes, heapUsed);
    const rowsBuffered =
      aggregates.campaigns.size + aggregates.adsets.size + aggregates.ads.size;
    maxRowsBuffered = Math.max(maxRowsBuffered, rowsBuffered);
  }

  for (const rawPage of restoredPages) {
    const payload = Array.isArray(rawPage.payload_json) ? (rawPage.payload_json as RawAdInsight[]) : [];
    applyAdInsightRowsToAggregates(payload, aggregates);
    captureMemorySnapshot();
  }
  let rowsFetchedTotal = restoredPages.reduce((sum, page) => {
    const payload = Array.isArray(page.payload_json) ? page.payload_json.length : 0;
    return sum + payload;
  }, 0);
  let latestSnapshotId = restoredPages.at(-1)?.id ?? null;

  let nextPageUrl: string | null =
    checkpoint?.nextPageUrl ??
    buildMetaBulkCoreInsightsUrl({
      accountId: input.accountId,
      accessToken: input.credentials.accessToken,
      since: normalizedDay,
      until: normalizedDay,
    });
  let pageIndex = checkpoint?.pageIndex ?? restoredPages.length;
  let throttleCount = 0;
  let lastUsagePercent = 0;
  const coreCheckpointStartedAt = checkpoint?.startedAt ?? new Date().toISOString();

  await upsertOwnedMetaCheckpointOrThrow({
    partitionId: input.partitionId,
    businessId: input.credentials.businessId,
    providerAccountId: input.accountId,
    checkpointScope,
    phase: "fetch_raw",
    status: "running",
    pageIndex,
    nextPageUrl,
    providerCursor: checkpoint?.providerCursor ?? null,
    rowsFetched: checkpoint?.rowsFetched ?? restoredPages.reduce((sum, page) => {
      const payload = Array.isArray(page.payload_json) ? page.payload_json.length : 0;
      return sum + payload;
    }, 0),
    rowsWritten: 0,
    lastSuccessfulEntityKey: checkpoint?.lastSuccessfulEntityKey ?? null,
    lastResponseHeaders: checkpoint?.lastResponseHeaders ?? {},
    attemptCount: input.attemptCount,
    leaseEpoch: input.leaseEpoch,
    leaseOwner: input.workerId,
    leaseExpiresAt: null,
    startedAt: coreCheckpointStartedAt,
  });

  while (nextPageUrl) {
    await heartbeatOwnedMetaPartitionLeaseOrThrow({
      partitionId: input.partitionId,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      leaseMinutes: input.leaseMinutes ?? DEFAULT_META_PARTITION_LEASE_MINUTES,
    });
    const fetchHeartbeat = startMetaFetchHeartbeat({
      partitionId: input.partitionId,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      leaseMinutes: input.leaseMinutes ?? DEFAULT_META_PARTITION_LEASE_MINUTES,
    });
    let pageResult: {
      response: Response;
      json: MetaGraphCollectionResponse<RawAdInsight> & { error?: { message?: string } };
    };
    try {
      pageResult = await fetchMetaPagedJson<RawAdInsight>(nextPageUrl);
    } finally {
      clearInterval(fetchHeartbeat);
    }
    const response = pageResult.response;
    const json = pageResult.json;
    const rows = json.data ?? [];
    const usageSummary = parseMetaBusinessUsageHeader(response.headers);
    lastUsagePercent = Math.max(lastUsagePercent, usageSummary.maxPercent);
    const checkpointId = await upsertOwnedMetaCheckpointOrThrow({
      partitionId: input.partitionId,
      businessId: input.credentials.businessId,
      providerAccountId: input.accountId,
      checkpointScope,
      phase: "fetch_raw",
      status: "running",
      pageIndex,
      nextPageUrl: json.paging?.next ?? null,
      providerCursor: json.paging?.next ?? null,
      rowsFetched: rowsFetchedTotal + rows.length,
      rowsWritten: 0,
      lastSuccessfulEntityKey:
        rows.at(-1)?.ad_id ?? rows.at(-1)?.adset_id ?? rows.at(-1)?.campaign_id ?? null,
      lastResponseHeaders: {
        "x-business-use-case-usage": usageSummary.raw,
      },
      checkpointHash: buildMetaSyncCheckpointHash({
        partitionId: input.partitionId,
        checkpointScope,
        phase: "fetch_raw",
        pageIndex,
        nextPageUrl: json.paging?.next ?? null,
        providerCursor: json.paging?.next ?? null,
      }),
      attemptCount: input.attemptCount,
      leaseEpoch: input.leaseEpoch,
      leaseOwner: input.workerId,
      startedAt: checkpoint?.startedAt ?? new Date().toISOString(),
    });
    latestSnapshotId = await recordMetaRawSnapshot({
      credentials: input.credentials,
      accountId: input.accountId,
      endpointName,
      entityScope: "ad",
      since: normalizedDay,
      until: normalizedDay,
      payload: rows,
      status: "fetched",
      providerHttpStatus: response.status,
      requestContext: {
        level: "ad",
        source: "bulk_core_sync",
        pageIndex,
      },
      partitionId: input.partitionId,
      checkpointId,
      pageIndex,
      providerCursor: json.paging?.next ?? null,
      responseHeaders: {
        "x-business-use-case-usage": usageSummary.raw,
      },
    });
    applyAdInsightRowsToAggregates(rows, aggregates);
    captureMemorySnapshot();
    rowsFetchedTotal += rows.length;
    nextPageUrl = json.paging?.next ?? null;
    pageIndex += 1;
    if (usageSummary.maxPercent >= META_USAGE_THROTTLE_THRESHOLD && nextPageUrl) {
      throttleCount += 1;
      await sleep(META_USAGE_THROTTLE_SLEEP_MS);
    }
  }

  const campaignStatuses = await fetchCampaignStatuses(
    input.credentials,
    input.accountId,
    input.credentials.accessToken
  ).catch(() => new Map<string, string>());
  const accountMetrics = deriveWarehouseMetrics(aggregates.account);
  const sourceSnapshotId = latestSnapshotId;
  const campaignRows = Array.from(aggregates.campaigns.entries()).map(([campaignId, value]) => {
    const metrics = deriveWarehouseMetrics(value);
    return {
      businessId: input.credentials.businessId,
      providerAccountId: input.accountId,
      date: normalizedDay,
      campaignId,
      campaignNameCurrent: value.name ?? null,
      campaignNameHistorical: value.name ?? null,
      campaignStatus: campaignStatuses.get(campaignId) ?? null,
      objective: null,
      buyingType: null,
      accountTimezone: profile?.timezone ?? "UTC",
      accountCurrency: profile?.currency ?? input.credentials.currency,
      spend: value.spend,
      impressions: value.impressions,
      clicks: value.clicks,
      reach: value.reach || value.impressions,
      frequency: metrics.frequency,
      conversions: value.conversions,
      revenue: value.revenue,
      roas: metrics.roas,
      cpa: metrics.cpa,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
      sourceSnapshotId,
    };
  });
  const adsetRows = Array.from(aggregates.adsets.entries()).map(([adsetId, value]) => {
    const metrics = deriveWarehouseMetrics(value);
    return {
      businessId: input.credentials.businessId,
      providerAccountId: input.accountId,
      date: normalizedDay,
      campaignId: value.campaignId ?? null,
      adsetId,
      adsetNameCurrent: value.name ?? null,
      adsetNameHistorical: value.name ?? null,
      adsetStatus: null,
      accountTimezone: profile?.timezone ?? "UTC",
      accountCurrency: profile?.currency ?? input.credentials.currency,
      spend: value.spend,
      impressions: value.impressions,
      clicks: value.clicks,
      reach: value.reach || value.impressions,
      frequency: metrics.frequency,
      conversions: value.conversions,
      revenue: value.revenue,
      roas: metrics.roas,
      cpa: metrics.cpa,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
      sourceSnapshotId,
    };
  });
  const adRows = Array.from(aggregates.ads.entries()).map(([adId, value]) => {
    const metrics = deriveWarehouseMetrics(value);
    return {
      businessId: input.credentials.businessId,
      providerAccountId: input.accountId,
      date: normalizedDay,
      campaignId: value.campaignId ?? null,
      adsetId: value.adsetId ?? null,
      adId,
      adNameCurrent: value.name ?? null,
      adNameHistorical: value.name ?? null,
      adStatus: null,
      accountTimezone: profile?.timezone ?? "UTC",
      accountCurrency: profile?.currency ?? input.credentials.currency,
      spend: value.spend,
      impressions: value.impressions,
      clicks: value.clicks,
      reach: value.reach || value.impressions,
      frequency: metrics.frequency,
      conversions: value.conversions,
      revenue: value.revenue,
      roas: metrics.roas,
      cpa: metrics.cpa,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
      sourceSnapshotId,
      payloadJson: value.payloadJson ?? null,
    };
  });
  const accountRows = [
    {
      businessId: input.credentials.businessId,
      providerAccountId: input.accountId,
      date: normalizedDay,
      accountName: profile?.name ?? null,
      accountTimezone: profile?.timezone ?? "UTC",
      accountCurrency: profile?.currency ?? input.credentials.currency,
      spend: aggregates.account.spend,
      impressions: aggregates.account.impressions,
      clicks: aggregates.account.clicks,
      reach: aggregates.account.reach || aggregates.account.impressions,
      frequency: accountMetrics.frequency,
      conversions: aggregates.account.conversions,
      revenue: aggregates.account.revenue,
      roas: accountMetrics.roas,
      cpa: accountMetrics.cpa,
      ctr: accountMetrics.ctr,
      cpc: accountMetrics.cpc,
      sourceSnapshotId,
    },
  ];

  await upsertOwnedMetaCheckpointOrThrow({
    partitionId: input.partitionId,
    businessId: input.credentials.businessId,
    providerAccountId: input.accountId,
    checkpointScope,
    phase: "bulk_upsert",
    status: "running",
    pageIndex,
    nextPageUrl: null,
    providerCursor: null,
    rowsFetched: rowsFetchedTotal,
    rowsWritten: 0,
    lastSuccessfulEntityKey: adRows.at(-1)?.adId ?? adsetRows.at(-1)?.adsetId ?? campaignRows.at(-1)?.campaignId ?? null,
    lastResponseHeaders: checkpoint?.lastResponseHeaders ?? {},
    attemptCount: input.attemptCount,
    leaseEpoch: input.leaseEpoch,
    leaseOwner: input.workerId,
    startedAt: coreCheckpointStartedAt,
  });

  await heartbeatOwnedMetaPartitionLeaseOrThrow({
    partitionId: input.partitionId,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    leaseMinutes: input.leaseMinutes ?? DEFAULT_META_PARTITION_LEASE_MINUTES,
  });
  await upsertMetaAccountDailyRows(accountRows);
  await heartbeatOwnedMetaPartitionLeaseOrThrow({
    partitionId: input.partitionId,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    leaseMinutes: input.leaseMinutes ?? DEFAULT_META_PARTITION_LEASE_MINUTES,
  });
  await upsertMetaCampaignDailyRows(campaignRows);
  await heartbeatOwnedMetaPartitionLeaseOrThrow({
    partitionId: input.partitionId,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    leaseMinutes: input.leaseMinutes ?? DEFAULT_META_PARTITION_LEASE_MINUTES,
  });
  await upsertMetaAdSetDailyRows(adsetRows);
  await heartbeatOwnedMetaPartitionLeaseOrThrow({
    partitionId: input.partitionId,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    leaseMinutes: input.leaseMinutes ?? DEFAULT_META_PARTITION_LEASE_MINUTES,
  });
  await upsertMetaAdDailyRows(adRows);

  const [accountDailyCheckpoint, adsetDailyCheckpoint, adDailyCheckpoint] = await Promise.all([
    getMetaSyncCheckpoint({
      partitionId: input.partitionId,
      checkpointScope: "account_daily",
    }),
    getMetaSyncCheckpoint({
      partitionId: input.partitionId,
      checkpointScope: "adset_daily",
    }),
    getMetaSyncCheckpoint({
      partitionId: input.partitionId,
      checkpointScope: "ad_daily",
    }),
  ]);

  await heartbeatOwnedMetaPartitionLeaseOrThrow({
    partitionId: input.partitionId,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    leaseMinutes: input.leaseMinutes ?? DEFAULT_META_PARTITION_LEASE_MINUTES,
  });
  await Promise.all([
    upsertOwnedMetaCheckpointOrThrow({
      partitionId: input.partitionId,
      businessId: input.credentials.businessId,
      providerAccountId: input.accountId,
      checkpointScope: "account_daily",
      phase: "finalize",
      status: "succeeded",
      pageIndex,
      nextPageUrl: null,
      providerCursor: null,
      rowsFetched: rowsFetchedTotal,
      rowsWritten: accountRows.length,
      lastSuccessfulEntityKey: null,
      lastResponseHeaders: checkpoint?.lastResponseHeaders ?? {},
      attemptCount: input.attemptCount,
      leaseEpoch: input.leaseEpoch,
      leaseOwner: input.workerId,
      startedAt: accountDailyCheckpoint?.startedAt ?? coreCheckpointStartedAt,
      finishedAt: new Date().toISOString(),
    }),
    upsertOwnedMetaCheckpointOrThrow({
      partitionId: input.partitionId,
      businessId: input.credentials.businessId,
      providerAccountId: input.accountId,
      checkpointScope: "ad_daily",
      phase: "finalize",
      status: "succeeded",
      pageIndex,
      nextPageUrl: null,
      providerCursor: null,
      rowsFetched: rowsFetchedTotal,
      rowsWritten: adRows.length,
      lastSuccessfulEntityKey: adRows.at(-1)?.adId ?? null,
      lastResponseHeaders: checkpoint?.lastResponseHeaders ?? {},
      attemptCount: input.attemptCount,
      leaseEpoch: input.leaseEpoch,
      leaseOwner: input.workerId,
      startedAt: adDailyCheckpoint?.startedAt ?? coreCheckpointStartedAt,
      finishedAt: new Date().toISOString(),
    }),
    upsertOwnedMetaCheckpointOrThrow({
      partitionId: input.partitionId,
      businessId: input.credentials.businessId,
      providerAccountId: input.accountId,
      checkpointScope: "adset_daily",
      phase: "finalize",
      status: "succeeded",
      pageIndex,
      nextPageUrl: null,
      providerCursor: null,
      rowsFetched: rowsFetchedTotal,
      rowsWritten: adsetRows.length,
      lastSuccessfulEntityKey: adsetRows.at(-1)?.adsetId ?? null,
      lastResponseHeaders: checkpoint?.lastResponseHeaders ?? {},
      attemptCount: input.attemptCount,
      leaseEpoch: input.leaseEpoch,
      leaseOwner: input.workerId,
      startedAt: adsetDailyCheckpoint?.startedAt ?? coreCheckpointStartedAt,
      finishedAt: new Date().toISOString(),
    }),
  ]);

  const positiveSpendAdIds = adRows.filter((row) => row.spend > 0).map((row) => row.adId);
  const oversizeWarning = maxRowsBuffered >= META_MEMORY_FLUSH_THRESHOLD_ROWS;
  if (oversizeWarning) {
    console.warn("[meta-sync] core_memory_threshold_reached", {
      businessId: input.credentials.businessId,
      providerAccountId: input.accountId,
      partitionId: input.partitionId,
      maxHeapUsedBytes,
      maxRowsBuffered,
      flushThresholdRows: META_MEMORY_FLUSH_THRESHOLD_ROWS,
    });
  }

  await heartbeatOwnedMetaPartitionLeaseOrThrow({
    partitionId: input.partitionId,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    leaseMinutes: input.leaseMinutes ?? DEFAULT_META_PARTITION_LEASE_MINUTES,
  });
  await upsertOwnedMetaCheckpointOrThrow({
    partitionId: input.partitionId,
    businessId: input.credentials.businessId,
    providerAccountId: input.accountId,
    checkpointScope,
    phase: "finalize",
    status: "succeeded",
    pageIndex,
    nextPageUrl: null,
    providerCursor: null,
    rowsFetched: rowsFetchedTotal,
    rowsWritten: accountRows.length + campaignRows.length + adsetRows.length + adRows.length,
    lastSuccessfulEntityKey: positiveSpendAdIds.at(-1) ?? adRows.at(-1)?.adId ?? null,
    lastResponseHeaders: checkpoint?.lastResponseHeaders ?? {},
    attemptCount: input.attemptCount,
    leaseEpoch: input.leaseEpoch,
    leaseOwner: input.workerId,
    startedAt: coreCheckpointStartedAt,
    finishedAt: new Date().toISOString(),
  });

  return {
    accountRowsWritten: accountRows.length,
    campaignRowsWritten: campaignRows.length,
    adsetRowsWritten: adsetRows.length,
    adRowsWritten: adRows.length,
    positiveSpendAdIds,
    pageCount: pageIndex,
    restoredPageCount: restoredPages.length,
    throttleCount,
    lastUsagePercent,
    memoryInstrumentation: {
      maxHeapUsedBytes,
      maxRowsBuffered,
      flushThresholdRows: META_MEMORY_FLUSH_THRESHOLD_ROWS,
      oversizeWarning,
    },
  };
}

export async function syncMetaAccountBreakdownWarehouseDay(input: {
  credentials: MetaCredentials;
  accountId: string;
  day: string;
  partitionId: string;
  workerId: string;
  leaseEpoch: number;
  attemptCount: number;
  breakdowns: string;
  endpointName: string;
  positiveSpendAdIds: string[];
  leaseMinutes?: number;
}) {
  const normalizedDay = normalizeMetaApiDate(input.day);
  const checkpointScope = `breakdown:${input.breakdowns}`;
  const checkpoint = await getMetaSyncCheckpoint({
    partitionId: input.partitionId,
    checkpointScope,
  });
  let nextPageUrl: string | null =
    checkpoint?.nextPageUrl ??
    buildMetaBreakdownInsightsUrl({
      accountId: input.accountId,
      accessToken: input.credentials.accessToken,
      since: normalizedDay,
      until: normalizedDay,
      breakdowns: input.breakdowns,
      positiveSpendAdIds: input.positiveSpendAdIds,
    });
  let pageIndex = checkpoint?.pageIndex ?? 0;
  let rowsFetchedTotal = checkpoint?.rowsFetched ?? 0;

  while (nextPageUrl) {
    await heartbeatOwnedMetaPartitionLeaseOrThrow({
      partitionId: input.partitionId,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      leaseMinutes: input.leaseMinutes ?? DEFAULT_META_PARTITION_LEASE_MINUTES,
    });
    const fetchHeartbeat = startMetaFetchHeartbeat({
      partitionId: input.partitionId,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      leaseMinutes: input.leaseMinutes ?? DEFAULT_META_PARTITION_LEASE_MINUTES,
    });
    let pageResult: {
      response: Response;
      json: MetaGraphCollectionResponse<RawBreakdownInsight> & { error?: { message?: string } };
    };
    try {
      pageResult = await fetchMetaPagedJson<RawBreakdownInsight>(nextPageUrl);
    } finally {
      clearInterval(fetchHeartbeat);
    }
    const response = pageResult.response;
    const json = pageResult.json;
    const usageSummary = parseMetaBusinessUsageHeader(response.headers);
    const rows = json.data ?? [];
    const checkpointId = await upsertOwnedMetaCheckpointOrThrow({
      partitionId: input.partitionId,
      businessId: input.credentials.businessId,
      providerAccountId: input.accountId,
      checkpointScope,
      phase: "fetch_raw",
      status: "running",
      pageIndex,
      nextPageUrl: json.paging?.next ?? null,
      providerCursor: json.paging?.next ?? null,
      rowsFetched: rowsFetchedTotal + rows.length,
      rowsWritten: 0,
      lastSuccessfulEntityKey: null,
      lastResponseHeaders: {
        "x-business-use-case-usage": usageSummary.raw,
      },
      attemptCount: input.attemptCount,
      leaseEpoch: input.leaseEpoch,
      leaseOwner: input.workerId,
      startedAt: checkpoint?.startedAt ?? new Date().toISOString(),
    });
    await recordMetaRawSnapshot({
      credentials: input.credentials,
      accountId: input.accountId,
      endpointName: input.endpointName,
      entityScope: "ad_breakdown",
      since: normalizedDay,
      until: normalizedDay,
      payload: rows,
      status: "fetched",
      providerHttpStatus: response.status,
      requestContext: {
        level: "ad",
        breakdowns: input.breakdowns,
        source: "bulk_breakdown_sync",
        pageIndex,
        filteredSpendAds: input.positiveSpendAdIds.length > 0 && input.positiveSpendAdIds.length <= 200,
      },
      partitionId: input.partitionId,
      checkpointId,
      pageIndex,
      providerCursor: json.paging?.next ?? null,
      responseHeaders: {
        "x-business-use-case-usage": usageSummary.raw,
      },
    });
    nextPageUrl = json.paging?.next ?? null;
    rowsFetchedTotal += rows.length;
    pageIndex += 1;
    if (usageSummary.maxPercent >= META_USAGE_THROTTLE_THRESHOLD && nextPageUrl) {
      await sleep(META_USAGE_THROTTLE_SLEEP_MS);
    }
  }

  await upsertOwnedMetaCheckpointOrThrow({
    partitionId: input.partitionId,
    businessId: input.credentials.businessId,
    providerAccountId: input.accountId,
    checkpointScope,
    phase: "finalize",
    status: "succeeded",
    pageIndex,
    nextPageUrl: null,
    providerCursor: null,
    rowsFetched: rowsFetchedTotal,
    rowsWritten: 0,
    lastSuccessfulEntityKey: null,
    lastResponseHeaders: checkpoint?.lastResponseHeaders ?? {},
    attemptCount: input.attemptCount,
    leaseEpoch: input.leaseEpoch,
    leaseOwner: input.workerId,
    startedAt: checkpoint?.startedAt ?? new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
}

// ── Time breakdown (for reports) ──────────────────────────────────────────────

export interface MetaTimeBreakdownRow extends MetaMetricsData {
  date: string; // "YYYY-MM-DD"
}

export async function getCampaignTimeBreakdown(
  credentials: MetaCredentials,
  since: string,
  until: string,
  dimension: "day" | "week" | "month"
): Promise<MetaTimeBreakdownRow[]> {
  const timeIncrement =
    dimension === "month" ? "monthly" : dimension === "week" ? "7" : "1";

  const byDate = new Map<string, MetaTimeBreakdownRow>();

  await Promise.all(
    credentials.accountIds.map(async (accountId) => {
      const url = new URL(
        `https://graph.facebook.com/v25.0/${accountId}/insights`
      );
      url.searchParams.set("level", "campaign");
      url.searchParams.set(
        "fields",
        "date_start,spend,ctr,cpm,impressions,clicks,actions,action_values,purchase_roas"
      );
      url.searchParams.set("time_range", JSON.stringify({ since, until }));
      url.searchParams.set("time_increment", timeIncrement);
      url.searchParams.set("limit", "500");
      url.searchParams.set("access_token", credentials.accessToken);

      try {
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          data?: Array<
            RawCampaignInsight & { date_start?: string }
          >;
        };

        for (const row of json.data ?? []) {
          const date = row.date_start;
          if (!date) continue;
          const m = buildMetrics({
            spend_str: row.spend,
            ctr_str: row.ctr,
            cpm_str: row.cpm,
            impressions_str: row.impressions,
            clicks_str: row.clicks,
            actions: row.actions,
            action_values: row.action_values,
            purchase_roas: row.purchase_roas,
          });
          const existing = byDate.get(date);
          if (!existing) {
            byDate.set(date, { date, ...m });
          } else {
            const spend = r2(existing.spend + m.spend);
            const revenue = r2(existing.revenue + m.revenue);
            const purchases = existing.purchases + m.purchases;
            const clicks = existing.clicks + m.clicks;
            const impressions = existing.impressions + m.impressions;
            byDate.set(date, {
              date,
              spend,
              revenue,
              purchases,
              roas: spend > 0 ? r2(revenue / spend) : 0,
              cpa: purchases > 0 ? r2(spend / purchases) : 0,
              ctr: r2(existing.ctr + m.ctr),
              cpm: r2(existing.cpm + m.cpm),
              clicks,
              impressions,
            });
          }
        }
      } catch {
        // per-account failure is silent
      }
    })
  );

  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

// ── getCampaigns ──────────────────────────────────────────────────────────────

async function fetchCampaignStatuses(
  credentials: MetaCredentials,
  accountId: string,
  accessToken: string
): Promise<Map<string, string>> {
  const url = new URL(
    `https://graph.facebook.com/v25.0/${accountId}/campaigns`
  );
  url.searchParams.set("fields", "id,name,effective_status,status");
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", accessToken);

  try {
    const jsonRows = await fetchPagedCollection<RawCampaign>(url.toString());
    await recordMetaRawSnapshot({
      credentials,
      accountId,
      endpointName: "campaign_statuses",
      entityScope: "campaign",
      since: new Date().toISOString().slice(0, 10),
      until: new Date().toISOString().slice(0, 10),
      payload: jsonRows,
      status: "fetched",
      requestContext: { fields: "id,name,effective_status,status" },
    });
    return new Map(
      jsonRows.map((c) => [
        c.id,
        c.effective_status ?? c.status ?? "UNKNOWN",
      ])
    );
  } catch {
    await recordMetaRawSnapshot({
      credentials,
      accountId,
      endpointName: "campaign_statuses",
      entityScope: "campaign",
      since: new Date().toISOString().slice(0, 10),
      until: new Date().toISOString().slice(0, 10),
      payload: [],
      status: "failed",
      requestContext: { fields: "id,name,effective_status,status" },
    });
    return new Map();
  }
}

async function fetchCampaignConfigs(
  credentials: MetaCredentials,
  accountId: string,
  accessToken: string
): Promise<Map<string, RawCampaign>> {
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/campaigns`);
  url.searchParams.set(
    "fields",
    "id,name,effective_status,status,daily_budget,lifetime_budget,bid_strategy,bid_amount,bid_constraints{roas_average_floor}"
  );
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", accessToken);

  try {
    const jsonRows = await fetchPagedCollection<RawCampaign>(url.toString());
    await recordMetaRawSnapshot({
      credentials,
      accountId,
      endpointName: "campaign_configs",
      entityScope: "campaign",
      since: new Date().toISOString().slice(0, 10),
      until: new Date().toISOString().slice(0, 10),
      payload: jsonRows,
      status: "fetched",
      requestContext: {
        fields:
          "id,name,effective_status,status,daily_budget,lifetime_budget,bid_strategy,bid_amount,bid_constraints{roas_average_floor}",
      },
    });
    return new Map(jsonRows.map((campaign) => [campaign.id, campaign]));
  } catch {
    await recordMetaRawSnapshot({
      credentials,
      accountId,
      endpointName: "campaign_configs",
      entityScope: "campaign",
      since: new Date().toISOString().slice(0, 10),
      until: new Date().toISOString().slice(0, 10),
      payload: [],
      status: "failed",
      requestContext: {
        fields:
          "id,name,effective_status,status,daily_budget,lifetime_budget,bid_strategy,bid_amount,bid_constraints{roas_average_floor}",
      },
    });
    return new Map();
  }
}

async function fetchCampaignInsights(
  credentials: MetaCredentials,
  accountId: string,
  since: string,
  until: string,
  accessToken: string
): Promise<RawCampaignInsight[]> {
  const url = new URL(
    `https://graph.facebook.com/v25.0/${accountId}/insights`
  );
  url.searchParams.set("level", "campaign");
  url.searchParams.set(
    "fields",
    "campaign_id,campaign_name,spend,ctr,cpm,impressions,clicks,actions,action_values,purchase_roas"
  );
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", accessToken);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      await recordMetaRawSnapshot({
        credentials,
        accountId,
        endpointName: "campaign_insights",
        entityScope: "campaign",
        since,
        until,
        payload: [],
        status: "failed",
        providerHttpStatus: res.status,
        requestContext: { level: "campaign" },
      });
      return [];
    }
    const json = (await res.json()) as { data?: RawCampaignInsight[] };
    await recordMetaRawSnapshot({
      credentials,
      accountId,
      endpointName: "campaign_insights",
      entityScope: "campaign",
      since,
      until,
      payload: json.data ?? [],
      status: "fetched",
      providerHttpStatus: res.status,
      requestContext: { level: "campaign" },
    });
    return json.data ?? [];
  } catch {
    await recordMetaRawSnapshot({
      credentials,
      accountId,
      endpointName: "campaign_insights",
      entityScope: "campaign",
      since,
      until,
      payload: [],
      status: "failed",
      requestContext: { level: "campaign" },
    });
    return [];
  }
}

/**
 * Fetch all campaigns for the assigned Meta ad accounts in the date range.
 * Results are sorted by spend descending (highest spend first).
 */
export async function getCampaigns(
  credentials: MetaCredentials,
  since: string,
  until: string
): Promise<MetaCampaignData[]> {
  const normalizedSince = normalizeMetaApiDate(since);
  const normalizedUntil = normalizeMetaApiDate(until);
  const allRows: MetaCampaignData[] = [];

  await Promise.all(
    credentials.accountIds.map(async (accountId) => {
      await withMetaSyncJob({
        credentials,
        accountId,
        scope: "campaign_daily",
        since: normalizedSince,
        until: normalizedUntil,
        run: async () => {
          const [statusMap, insights] = await Promise.all([
            fetchCampaignStatuses(credentials, accountId, credentials.accessToken),
            fetchCampaignInsights(
              credentials,
              accountId,
              normalizedSince,
              normalizedUntil,
              credentials.accessToken
            ),
          ]);
          const profile = credentials.accountProfiles[accountId];
          const normalizedDate = normalizedSince;

          for (const insight of insights) {
            const campaignId = insight.campaign_id ?? "";
            allRows.push({
              id: campaignId,
              accountId,
              name: insight.campaign_name ?? "Unknown Campaign",
              status: statusMap.get(campaignId) ?? "UNKNOWN",
              budgetLevel: null,
              optimizationGoal: null,
              bidStrategyType: null,
              bidStrategyLabel: null,
              manualBidAmount: null,
              previousManualBidAmount: null,
              bidValue: null,
              bidValueFormat: null,
              previousBidValue: null,
              previousBidValueFormat: null,
              previousBidValueCapturedAt: null,
              dailyBudget: null,
              lifetimeBudget: null,
              previousDailyBudget: null,
              previousLifetimeBudget: null,
              previousBudgetCapturedAt: null,
              isBudgetMixed: false,
              isConfigMixed: false,
              isOptimizationGoalMixed: false,
              isBidStrategyMixed: false,
              isBidValueMixed: false,
              ...buildMetrics({
                spend_str: insight.spend,
                ctr_str: insight.ctr,
                cpm_str: insight.cpm,
                impressions_str: insight.impressions,
                clicks_str: insight.clicks,
                actions: insight.actions,
                action_values: insight.action_values,
                purchase_roas: insight.purchase_roas,
              }),
            });
          }

          if (isSingleDayWindow(normalizedSince, normalizedUntil)) {
            const singleDayRows = allRows.filter(
              (row) => row.accountId === accountId
            );
            await upsertMetaCampaignDailyRows(
              singleDayRows.map((row) => ({
                businessId: credentials.businessId,
                providerAccountId: accountId,
                date: normalizedDate,
                campaignId: row.id,
                campaignNameCurrent: row.name,
                campaignNameHistorical: row.name,
                campaignStatus: row.status,
                objective: row.objective ?? null,
                buyingType: null,
                accountTimezone: profile?.timezone ?? "UTC",
                accountCurrency:
                  profile?.currency ?? credentials.currency ?? "USD",
                spend: row.spend,
                impressions: row.impressions,
                clicks: row.clicks,
                reach: row.impressions,
                frequency: null,
                conversions: row.purchases,
                revenue: row.revenue,
                roas: row.roas,
                cpa: row.cpa || null,
                ctr: row.ctr || null,
                cpc: row.clicks > 0 ? r2(row.spend / row.clicks) : null,
                sourceSnapshotId: null,
              }))
            );
            await upsertMetaAccountDailyRows([
              {
                businessId: credentials.businessId,
                providerAccountId: accountId,
                date: normalizedDate,
                accountName: profile?.name ?? null,
                accountTimezone: profile?.timezone ?? "UTC",
                accountCurrency:
                  profile?.currency ?? credentials.currency ?? "USD",
                spend: r2(
                  singleDayRows.reduce((sum, row) => sum + row.spend, 0)
                ),
                impressions: singleDayRows.reduce(
                  (sum, row) => sum + row.impressions,
                  0
                ),
                clicks: singleDayRows.reduce((sum, row) => sum + row.clicks, 0),
                reach: singleDayRows.reduce(
                  (sum, row) => sum + row.impressions,
                  0
                ),
                frequency: null,
                conversions: singleDayRows.reduce(
                  (sum, row) => sum + row.purchases,
                  0
                ),
                revenue: r2(
                  singleDayRows.reduce((sum, row) => sum + row.revenue, 0)
                ),
                roas:
                  singleDayRows.reduce((sum, row) => sum + row.spend, 0) > 0
                    ? r2(
                        singleDayRows.reduce((sum, row) => sum + row.revenue, 0) /
                          singleDayRows.reduce((sum, row) => sum + row.spend, 0)
                      )
                    : 0,
                cpa:
                  singleDayRows.reduce((sum, row) => sum + row.purchases, 0) > 0
                    ? r2(
                        singleDayRows.reduce((sum, row) => sum + row.spend, 0) /
                          singleDayRows.reduce(
                            (sum, row) => sum + row.purchases,
                            0
                          )
                      )
                    : null,
                ctr:
                  singleDayRows.reduce((sum, row) => sum + row.impressions, 0) > 0
                    ? r2(
                        (singleDayRows.reduce((sum, row) => sum + row.clicks, 0) /
                          singleDayRows.reduce(
                            (sum, row) => sum + row.impressions,
                            0
                          )) *
                          100
                      )
                    : null,
                cpc:
                  singleDayRows.reduce((sum, row) => sum + row.clicks, 0) > 0
                    ? r2(
                        singleDayRows.reduce((sum, row) => sum + row.spend, 0) /
                          singleDayRows.reduce((sum, row) => sum + row.clicks, 0)
                      )
                    : null,
                sourceSnapshotId: null,
              },
            ]);
          }
        },
      });
    })
  );

  return allRows.sort((a, b) => b.spend - a.spend);
}

// ── getAdSets ─────────────────────────────────────────────────────────────────

/**
 * Fetch ad sets belonging to a specific campaign.
 * Used by the accordion table's lazy child tree.
 * Results are sorted by spend descending.
 */
export async function getAdSets(
  credentials: MetaCredentials,
  campaignId: string,
  since: string,
  until: string,
  businessId?: string,
  includePrev = false
): Promise<MetaAdSetData[]> {
  const normalizedSince = normalizeMetaApiDate(since);
  const normalizedUntil = normalizeMetaApiDate(until);
  const results: MetaAdSetData[] = [];

  await Promise.all(
    credentials.accountIds.map(async (accountId) => {
      // Fetch adset metadata (status, budget) scoped to the campaign
      const statusUrl = new URL(
        `https://graph.facebook.com/v25.0/${accountId}/adsets`
      );
      statusUrl.searchParams.set(
        "fields",
        "id,name,campaign_id,effective_status,status,daily_budget,lifetime_budget,optimization_goal,bid_strategy,bid_amount,bid_constraints{roas_average_floor}"
      );
      statusUrl.searchParams.set("limit", "200");
      statusUrl.searchParams.set("access_token", credentials.accessToken);

      // Fetch adset insights filtered to this campaign
      const insightUrl = new URL(
        `https://graph.facebook.com/v25.0/${accountId}/insights`
      );
      insightUrl.searchParams.set("level", "adset");
      insightUrl.searchParams.set(
        "fields",
        "adset_id,adset_name,campaign_id,spend,ctr,cpm,impressions,clicks,actions,action_values,purchase_roas"
      );
      insightUrl.searchParams.set(
        "filtering",
        JSON.stringify([
          { field: "campaign.id", operator: "EQUAL", value: campaignId },
        ])
      );
      insightUrl.searchParams.set(
        "time_range",
        JSON.stringify({ since: normalizedSince, until: normalizedUntil })
      );
      insightUrl.searchParams.set("limit", "200");
      insightUrl.searchParams.set("access_token", credentials.accessToken);

      try {
        const [statusRes, insightRes, campaignConfigs] = await Promise.all([
          fetch(statusUrl.toString(), { cache: "no-store" }),
          fetch(insightUrl.toString(), { cache: "no-store" }),
          fetchCampaignConfigs(credentials, accountId, credentials.accessToken),
        ]);

        const statusJson = statusRes.ok
          ? ((await statusRes.json()) as MetaGraphCollectionResponse<RawAdSet>)
          : { data: [] as RawAdSet[] };
        const insightJson = insightRes.ok
          ? ((await insightRes.json()) as { data?: RawAdSetInsight[] })
          : { data: [] as RawAdSetInsight[] };
        await recordMetaRawSnapshot({
          credentials,
          accountId,
          endpointName: "adset_statuses",
          entityScope: "adset",
          since: normalizedSince,
          until: normalizedUntil,
          payload: statusJson.data ?? [],
          status: statusRes.ok ? "fetched" : "failed",
          providerHttpStatus: statusRes.status,
          requestContext: { campaignId, fields: "id,name,campaign_id,effective_status,status,daily_budget,lifetime_budget,optimization_goal,bid_strategy,bid_amount,bid_constraints{roas_average_floor}" },
        });
        await recordMetaRawSnapshot({
          credentials,
          accountId,
          endpointName: "adset_insights",
          entityScope: "adset",
          since: normalizedSince,
          until: normalizedUntil,
          payload: insightJson.data ?? [],
          status: insightRes.ok ? "fetched" : "failed",
          providerHttpStatus: insightRes.status,
          requestContext: { campaignId, level: "adset" },
        });
        const allStatusRows = statusJson.paging?.next
          ? await fetchPagedCollection<RawAdSet>(statusUrl.toString())
          : (statusJson.data ?? []);
        const statusRows = allStatusRows.filter(
          (adset) => adset.campaign_id === campaignId
        );
        const statusMap = new Map<string, RawAdSet>(
          statusRows.map((a) => [a.id, a])
        );
        const [latestSnapshots, latestCampaignSnapshots, previousDiffs, previousCampaignDiffs] = businessId
          ? await Promise.all([
              readLatestMetaConfigSnapshots({
                businessId,
                entityLevel: "adset",
                entityIds: Array.from(
                  new Set([
                    ...statusRows.map((adset) => adset.id),
                    ...(insightJson.data ?? []).map((adset) => adset.adset_id ?? "").filter(Boolean),
                  ])
                ),
              }),
              readLatestMetaConfigSnapshots({
                businessId,
                entityLevel: "campaign",
                entityIds: [campaignId],
              }),
              includePrev
                ? readPreviousDifferentMetaConfigDiffs({
                    businessId,
                    entityLevel: "adset",
                    entityIds: Array.from(
                      new Set([
                        ...statusRows.map((adset) => adset.id),
                        ...(insightJson.data ?? []).map((adset) => adset.adset_id ?? "").filter(Boolean),
                      ])
                    ),
                  })
                : Promise.resolve(new Map()),
              includePrev
                ? readPreviousDifferentMetaConfigDiffs({
                    businessId,
                    entityLevel: "campaign",
                    entityIds: [campaignId],
                  })
                : Promise.resolve(new Map()),
            ])
          : [new Map(), new Map(), new Map(), new Map()];

        for (const insight of insightJson.data ?? []) {
          if (insight.campaign_id !== campaignId) continue;

          const adsetId = insight.adset_id ?? "";
          const meta = statusMap.get(adsetId);
          const latestSnapshot = latestSnapshots.get(adsetId);
          const latestCampaignSnapshot = latestCampaignSnapshots.get(campaignId);
          const campaignConfig = campaignConfigs.get(campaignId) ?? null;
          const previousDiff = previousDiffs.get(adsetId);
          const previousCampaignDiff = previousCampaignDiffs.get(campaignId);
          const usesCampaignBudgetFallback =
            meta?.daily_budget == null &&
            meta?.lifetime_budget == null &&
            (campaignConfig?.daily_budget != null || campaignConfig?.lifetime_budget != null);
          const usesCampaignBidFallback =
            meta?.bid_strategy == null &&
            meta?.bid_amount == null &&
            meta?.bid_constraints?.roas_average_floor == null &&
            (campaignConfig?.bid_strategy != null ||
              campaignConfig?.bid_amount != null ||
              campaignConfig?.bid_constraints?.roas_average_floor != null);
          const effectiveBidStrategy =
            meta?.bid_strategy ??
            latestSnapshot?.bidStrategyType ??
            latestCampaignSnapshot?.bidStrategyType ??
            campaignConfig?.bid_strategy ??
            null;
          const effectiveManualBid =
            meta?.bid_amount != null
              ? parseNum(meta.bid_amount)
              : latestSnapshot?.manualBidAmount != null
                ? latestSnapshot.manualBidAmount
              : latestCampaignSnapshot?.manualBidAmount != null
                ? latestCampaignSnapshot.manualBidAmount
              : campaignConfig?.bid_amount != null
                ? parseNum(campaignConfig.bid_amount)
                : null;
          const effectiveTargetRoas =
            meta?.bid_constraints?.roas_average_floor != null
              ? parseNum(meta.bid_constraints.roas_average_floor)
            : latestSnapshot?.bidValueFormat === "roas" && latestSnapshot.bidValue != null
                ? latestSnapshot.bidValue
              : latestCampaignSnapshot?.bidValueFormat === "roas" &&
                  latestCampaignSnapshot.bidValue != null
                ? latestCampaignSnapshot.bidValue
              : campaignConfig?.bid_constraints?.roas_average_floor != null
                ? parseNum(campaignConfig.bid_constraints.roas_average_floor)
                : null;
          const effectiveDailyBudget =
            meta?.daily_budget != null
              ? parseNum(meta.daily_budget)
              : latestSnapshot?.dailyBudget != null
                ? latestSnapshot.dailyBudget
              : latestCampaignSnapshot?.dailyBudget != null
                ? latestCampaignSnapshot.dailyBudget
              : campaignConfig?.daily_budget != null
                ? parseNum(campaignConfig.daily_budget)
                : null;
          const effectiveLifetimeBudget =
            meta?.lifetime_budget != null
              ? parseNum(meta.lifetime_budget)
              : latestSnapshot?.lifetimeBudget != null
                ? latestSnapshot.lifetimeBudget
              : latestCampaignSnapshot?.lifetimeBudget != null
                ? latestCampaignSnapshot.lifetimeBudget
              : campaignConfig?.lifetime_budget != null
                ? parseNum(campaignConfig.lifetime_budget)
                : null;
          const config = buildConfigSnapshotPayload({
            campaignId,
            optimizationGoal:
              meta?.optimization_goal ??
              latestSnapshot?.optimizationGoal ??
              latestCampaignSnapshot?.optimizationGoal ??
              null,
            bidStrategy: effectiveBidStrategy,
            manualBidAmount: effectiveManualBid,
            targetRoas: effectiveTargetRoas,
            dailyBudget: effectiveDailyBudget,
            lifetimeBudget: effectiveLifetimeBudget,
          });
          results.push({
            id: adsetId,
            accountId,
            name: insight.adset_name ?? meta?.name ?? "Unknown Ad Set",
            campaignId,
            status:
              meta?.effective_status ??
              meta?.status ??
              campaignConfig?.effective_status ??
              campaignConfig?.status ??
              "UNKNOWN",
            budgetLevel: usesCampaignBudgetFallback ? "campaign" : "adset",
            dailyBudget: config.dailyBudget,
            lifetimeBudget: config.lifetimeBudget,
            optimizationGoal: config.optimizationGoal,
            bidStrategyType: config.bidStrategyType,
            bidStrategyLabel: config.bidStrategyLabel,
            manualBidAmount: config.manualBidAmount,
            previousManualBidAmount:
              previousDiff?.previousManualBidAmount ??
              (usesCampaignBidFallback ? previousCampaignDiff?.previousManualBidAmount ?? null : null),
            bidValue: config.bidValue,
            bidValueFormat: config.bidValueFormat,
            previousBidValue:
              previousDiff?.previousBidValue ??
              (usesCampaignBidFallback ? previousCampaignDiff?.previousBidValue ?? null : null),
            previousBidValueFormat:
              previousDiff?.previousBidValueFormat ??
              (usesCampaignBidFallback ? previousCampaignDiff?.previousBidValueFormat ?? null : null),
            previousBidValueCapturedAt:
              previousDiff?.previousBidCapturedAt ??
              (usesCampaignBidFallback ? previousCampaignDiff?.previousBidCapturedAt ?? null : null),
            isBudgetMixed: false,
            previousDailyBudget:
              previousDiff?.previousDailyBudget ??
              (usesCampaignBudgetFallback ? previousCampaignDiff?.previousDailyBudget ?? null : null),
            previousLifetimeBudget:
              previousDiff?.previousLifetimeBudget ??
              (usesCampaignBudgetFallback ? previousCampaignDiff?.previousLifetimeBudget ?? null : null),
            previousBudgetCapturedAt:
              previousDiff?.previousBudgetCapturedAt ??
              (usesCampaignBudgetFallback ? previousCampaignDiff?.previousBudgetCapturedAt ?? null : null),
            isConfigMixed: false,
            isOptimizationGoalMixed: false,
            isBidStrategyMixed: false,
            isBidValueMixed: false,
            ...buildMetrics({
              spend_str: insight.spend,
              ctr_str: insight.ctr,
              cpm_str: insight.cpm,
              impressions_str: insight.impressions,
              clicks_str: insight.clicks,
              actions: insight.actions,
              action_values: insight.action_values,
              purchase_roas: insight.purchase_roas,
            }),
          });
        }

        if (isSingleDayWindow(normalizedSince, normalizedUntil)) {
          const profile = credentials.accountProfiles[accountId];
          const normalizedDate = normalizedSince;
          const singleDayRows = results.filter((row) => row.accountId === accountId);
          await upsertMetaAdSetDailyRows(
            singleDayRows.map((row) => ({
              businessId: credentials.businessId,
              providerAccountId: accountId,
              date: normalizedDate,
              campaignId: row.campaignId,
              adsetId: row.id,
              adsetNameCurrent: row.name,
              adsetNameHistorical: row.name,
              adsetStatus: row.status,
              accountTimezone: profile?.timezone ?? "UTC",
              accountCurrency: profile?.currency ?? credentials.currency ?? "USD",
              spend: row.spend,
              impressions: row.impressions,
              clicks: row.clicks,
              reach: row.impressions,
              frequency: null,
              conversions: row.purchases,
              revenue: row.revenue,
              roas: row.roas,
              cpa: row.cpa || null,
              ctr: row.ctr || null,
              cpc: row.clicks > 0 ? r2(row.spend / row.clicks) : null,
              sourceSnapshotId: null,
            }))
          );
        }

        if (businessId) {
          await appendMetaConfigSnapshots(
            statusRows.map((meta) => {
              const campaignConfig = campaignConfigs.get(meta.campaign_id ?? campaignId) ?? null;
              return {
                businessId,
                accountId,
                entityLevel: "adset" as const,
                entityId: meta.id,
                payload: buildConfigSnapshotPayload({
                  campaignId: meta.campaign_id ?? campaignId,
                  optimizationGoal: meta.optimization_goal ?? null,
                  bidStrategy: meta.bid_strategy ?? campaignConfig?.bid_strategy ?? null,
                  manualBidAmount:
                    meta.bid_amount != null
                      ? parseNum(meta.bid_amount)
                      : campaignConfig?.bid_amount != null
                        ? parseNum(campaignConfig.bid_amount)
                        : null,
                  targetRoas: meta.bid_constraints?.roas_average_floor
                    ? parseNum(meta.bid_constraints.roas_average_floor)
                    : campaignConfig?.bid_constraints?.roas_average_floor
                      ? parseNum(campaignConfig.bid_constraints.roas_average_floor)
                      : null,
                  dailyBudget:
                    meta.daily_budget != null
                      ? parseNum(meta.daily_budget)
                      : campaignConfig?.daily_budget != null
                        ? parseNum(campaignConfig.daily_budget)
                        : null,
                  lifetimeBudget:
                    meta.lifetime_budget != null
                      ? parseNum(meta.lifetime_budget)
                      : campaignConfig?.lifetime_budget != null
                        ? parseNum(campaignConfig.lifetime_budget)
                        : null,
                }),
              };
            })
          );
        }
      } catch {
        // Per-account failures are silent — other accounts still process
      }
    })
  );

  return results.sort((a, b) => b.spend - a.spend);
}

// ── Breakdown helpers ─────────────────────────────────────────────────────────

async function fetchBreakdownRaw(
  credentials: MetaCredentials,
  accountId: string,
  accessToken: string,
  since: string,
  until: string,
  breakdowns: string
): Promise<RawBreakdownInsight[]> {
  const normalizedSince = normalizeMetaApiDate(since);
  const normalizedUntil = normalizeMetaApiDate(until);
  const url = new URL(
    `https://graph.facebook.com/v25.0/${accountId}/insights`
  );
  url.searchParams.set("level", "adset");
  url.searchParams.set("breakdowns", breakdowns);
  url.searchParams.set(
    "fields",
    "spend,clicks,impressions,ctr,cpm,actions,action_values,purchase_roas"
  );
  url.searchParams.set(
    "time_range",
    JSON.stringify({ since: normalizedSince, until: normalizedUntil })
  );
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", accessToken);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      await recordMetaRawSnapshot({
        credentials,
        accountId,
        endpointName: `breakdown_${breakdowns}`,
        entityScope: "breakdown",
        since: normalizedSince,
        until: normalizedUntil,
        payload: [],
        status: "failed",
        providerHttpStatus: res.status,
        requestContext: { level: "adset", breakdowns },
      });
      return [];
    }
    const json = (await res.json()) as { data?: RawBreakdownInsight[] };
    await recordMetaRawSnapshot({
      credentials,
      accountId,
      endpointName: `breakdown_${breakdowns}`,
      entityScope: "breakdown",
      since: normalizedSince,
      until: normalizedUntil,
      payload: json.data ?? [],
      status: "fetched",
      providerHttpStatus: res.status,
      requestContext: { level: "adset", breakdowns },
    });
    return json.data ?? [];
  } catch {
    await recordMetaRawSnapshot({
      credentials,
      accountId,
      endpointName: `breakdown_${breakdowns}`,
      entityScope: "breakdown",
      since: normalizedSince,
      until: normalizedUntil,
      payload: [],
      status: "failed",
      requestContext: { level: "adset", breakdowns },
    });
    return [];
  }
}

function aggregateBreakdown(
  rows: RawBreakdownInsight[],
  keyFn: (row: RawBreakdownInsight) => { key: string; label: string }
): MetaBreakdownRow[] {
  const map = new Map<string, MetaBreakdownRow>();

  for (const row of rows) {
    const { key, label } = keyFn(row);
    const metrics = buildMetrics({
      spend_str: row.spend,
      ctr_str: row.ctr,
      cpm_str: row.cpm,
      impressions_str: row.impressions,
      clicks_str: row.clicks,
      actions: row.actions,
      action_values: row.action_values,
      purchase_roas: row.purchase_roas,
    });

    const existing = map.get(key);
    if (existing) {
      existing.spend = r2(existing.spend + metrics.spend);
      existing.purchases += metrics.purchases;
      existing.revenue = r2(existing.revenue + metrics.revenue);
      existing.clicks += metrics.clicks;
      existing.impressions += metrics.impressions;
      // Recompute derived metrics after aggregation
      existing.roas =
        existing.spend > 0 ? r2(existing.revenue / existing.spend) : 0;
      existing.cpa =
        existing.purchases > 0
          ? r2(existing.spend / existing.purchases)
          : 0;
    } else {
      map.set(key, { key, label, ...metrics });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
}

// ── getAgeBreakdown ───────────────────────────────────────────────────────────

export async function getAgeBreakdown(
  credentials: MetaCredentials,
  since: string,
  until: string
): Promise<MetaBreakdownRow[]> {
  const allRows: RawBreakdownInsight[] = [];

  await Promise.all(
    credentials.accountIds.map(async (id) => {
      const rows = await fetchBreakdownRaw(
        credentials,
        id,
        credentials.accessToken,
        since,
        until,
        "age"
      );
      allRows.push(...rows);
    })
  );

  return aggregateBreakdown(allRows, (row) => ({
    key: row.age ?? "unknown",
    label: row.age ?? "Unknown",
  }));
}

// ── getLocationBreakdown ──────────────────────────────────────────────────────

export async function getLocationBreakdown(
  credentials: MetaCredentials,
  since: string,
  until: string
): Promise<MetaBreakdownRow[]> {
  const allRows: RawBreakdownInsight[] = [];

  await Promise.all(
    credentials.accountIds.map(async (id) => {
      const rows = await fetchBreakdownRaw(
        credentials,
        id,
        credentials.accessToken,
        since,
        until,
        "country"
      );
      allRows.push(...rows);
    })
  );

  return aggregateBreakdown(allRows, (row) => ({
    key: row.country ?? "unknown",
    label: row.country ?? "Unknown",
  }));
}

// ── getGenderBreakdown ────────────────────────────────────────────────────────

export async function getGenderBreakdown(
  credentials: MetaCredentials,
  since: string,
  until: string
): Promise<MetaBreakdownRow[]> {
  const allRows: RawBreakdownInsight[] = [];

  await Promise.all(
    credentials.accountIds.map(async (id) => {
      const rows = await fetchBreakdownRaw(
        credentials,
        id,
        credentials.accessToken,
        since,
        until,
        "gender"
      );
      allRows.push(...rows);
    })
  );

  return aggregateBreakdown(allRows, (row) => ({
    key: row.gender ?? "unknown",
    label: row.gender === "male" ? "Male" : row.gender === "female" ? "Female" : row.gender ?? "Unknown",
  }));
}

// ── getRegionBreakdown ────────────────────────────────────────────────────────

export async function getRegionBreakdown(
  credentials: MetaCredentials,
  since: string,
  until: string
): Promise<MetaBreakdownRow[]> {
  const allRows: RawBreakdownInsight[] = [];

  await Promise.all(
    credentials.accountIds.map(async (id) => {
      const rows = await fetchBreakdownRaw(
        credentials,
        id,
        credentials.accessToken,
        since,
        until,
        "region"
      );
      allRows.push(...rows);
    })
  );

  return aggregateBreakdown(allRows, (row) => ({
    key: row.region ?? "unknown",
    label: row.region ?? "Unknown",
  }));
}

// ── getPlacementBreakdown ─────────────────────────────────────────────────────

export async function getPlacementBreakdown(
  credentials: MetaCredentials,
  since: string,
  until: string
): Promise<MetaBreakdownRow[]> {
  const allRows: RawBreakdownInsight[] = [];

  await Promise.all(
    credentials.accountIds.map(async (id) => {
      const rows = await fetchBreakdownRaw(
        credentials,
        id,
        credentials.accessToken,
        since,
        until,
        "publisher_platform,platform_position,impression_device"
      );
      allRows.push(...rows);
    })
  );

  return aggregateBreakdown(allRows, (row) => {
    const parts = [
      row.publisher_platform,
      row.platform_position,
      row.impression_device,
    ].filter(Boolean);
    return {
      key: parts.join("|") || "unknown",
      label: parts.join(" • ") || "Unknown",
    };
  });
}
