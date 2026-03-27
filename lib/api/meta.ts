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
  buildMetaRawSnapshotHash,
  createMetaSyncJob,
  persistMetaRawSnapshot,
  updateMetaSyncJob,
  upsertMetaAccountDailyRows,
  upsertMetaAdSetDailyRows,
  upsertMetaCampaignDailyRows,
} from "@/lib/meta/warehouse";
import type { MetaRawSnapshotStatus, MetaSyncType, MetaWarehouseScope } from "@/lib/meta/warehouse-types";

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
    const res = await fetch(url.toString(), { cache: "no-store" });
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
  if (since === until) {
    return since.slice(0, 10) === (referenceToday ?? "").slice(0, 10)
      ? "today_refresh"
      : "repair_window";
  }
  const start = new Date(`${since}T00:00:00Z`).getTime();
  const end = new Date(`${until}T00:00:00Z`).getTime();
  const daySpan = Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(1, Math.round((end - start) / 86_400_000) + 1)
    : 1;
  if (daySpan <= 7) return "incremental_recent";
  return "repair_window";
}

function isSingleDayWindow(since: string, until: string) {
  return since.slice(0, 10) === until.slice(0, 10);
}

async function withMetaSyncJob<T>(input: {
  credentials: MetaCredentials;
  accountId: string;
  scope: MetaWarehouseScope;
  since: string;
  until: string;
  run: () => Promise<T>;
}) {
  const accountTimezone =
    input.credentials.accountProfiles[input.accountId]?.timezone ?? null;
  const syncJobId = await createMetaSyncJob({
    businessId: input.credentials.businessId,
    providerAccountId: input.accountId,
    syncType: inferRequestSyncType(
      input.since,
      input.until,
      getTodayIsoForTimeZone(accountTimezone)
    ),
    scope: input.scope,
    startDate: input.since,
    endDate: input.until,
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
  since: string;
  until: string;
  payload: unknown;
  status: MetaRawSnapshotStatus;
  providerHttpStatus?: number | null;
  requestContext?: Record<string, unknown>;
}) {
  const profile = input.credentials.accountProfiles[input.accountId];
  return persistMetaRawSnapshot({
    businessId: input.credentials.businessId,
    providerAccountId: input.accountId,
    endpointName: input.endpointName,
    entityScope: input.entityScope,
    startDate: input.since,
    endDate: input.until,
    accountTimezone: profile?.timezone ?? null,
    accountCurrency: profile?.currency ?? input.credentials.currency,
    payloadJson: input.payload,
    payloadHash: buildMetaRawSnapshotHash({
      businessId: input.credentials.businessId,
      providerAccountId: input.accountId,
      endpointName: input.endpointName,
      startDate: input.since,
      endDate: input.until,
      payload: input.payload,
    }),
    requestContext: input.requestContext ?? {},
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
  const allRows: MetaCampaignData[] = [];

  await Promise.all(
    credentials.accountIds.map(async (accountId) => {
      await withMetaSyncJob({
        credentials,
        accountId,
        scope: "campaign_daily",
        since,
        until,
        run: async () => {
          const [statusMap, insights] = await Promise.all([
            fetchCampaignStatuses(credentials, accountId, credentials.accessToken),
            fetchCampaignInsights(credentials, accountId, since, until, credentials.accessToken),
          ]);
          const profile = credentials.accountProfiles[accountId];
          const normalizedDate = since.slice(0, 10);

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

          if (isSingleDayWindow(since, until)) {
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
        JSON.stringify({ since, until })
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
          since,
          until,
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
          since,
          until,
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

        if (isSingleDayWindow(since, until)) {
          const profile = credentials.accountProfiles[accountId];
          const normalizedDate = since.slice(0, 10);
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
  const url = new URL(
    `https://graph.facebook.com/v25.0/${accountId}/insights`
  );
  url.searchParams.set("level", "adset");
  url.searchParams.set("breakdowns", breakdowns);
  url.searchParams.set(
    "fields",
    "spend,clicks,impressions,ctr,cpm,actions,action_values,purchase_roas"
  );
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
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
        since,
        until,
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
      since,
      until,
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
      since,
      until,
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
