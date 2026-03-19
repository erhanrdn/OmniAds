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
  name: string;
  status: string; // "ACTIVE" | "PAUSED" | "ARCHIVED" | "UNKNOWN"
}

export interface MetaAdSetData extends MetaMetricsData {
  id: string;
  name: string;
  campaignId: string;
  status: string;
  dailyBudget: number | null;    // USD, null when lifetime budget is used
  lifetimeBudget: number | null; // USD, null when daily budget is used
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
}

interface RawBreakdownInsight {
  age?: string;
  country?: string;
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

// ── Credential resolution ─────────────────────────────────────────────────────

export interface MetaCredentials {
  accessToken: string;
  accountIds: string[];
  currency: string; // ISO 4217 code from the primary ad account (e.g. "USD", "EUR", "TRY")
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

  const currency = await fetchAccountCurrency(accountIds[0], accessToken);

  return { accessToken, accountIds, currency };
}

async function fetchAccountCurrency(
  accountId: string,
  accessToken: string
): Promise<string> {
  try {
    const url = new URL(`https://graph.facebook.com/v25.0/${accountId}`);
    url.searchParams.set("fields", "currency");
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return "USD";
    const json = (await res.json()) as { currency?: string };
    return json.currency ?? "USD";
  } catch {
    return "USD";
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

// ── getCampaigns ──────────────────────────────────────────────────────────────

async function fetchCampaignStatuses(
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
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return new Map();
    const json = (await res.json()) as { data?: RawCampaign[] };
    return new Map(
      (json.data ?? []).map((c) => [
        c.id,
        c.effective_status ?? c.status ?? "UNKNOWN",
      ])
    );
  } catch {
    return new Map();
  }
}

async function fetchCampaignInsights(
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
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: RawCampaignInsight[] };
    return json.data ?? [];
  } catch {
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
      const [statusMap, insights] = await Promise.all([
        fetchCampaignStatuses(accountId, credentials.accessToken),
        fetchCampaignInsights(accountId, since, until, credentials.accessToken),
      ]);

      for (const insight of insights) {
        const campaignId = insight.campaign_id ?? "";
        allRows.push({
          id: campaignId,
          name: insight.campaign_name ?? "Unknown Campaign",
          status: statusMap.get(campaignId) ?? "UNKNOWN",
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
  until: string
): Promise<MetaAdSetData[]> {
  const results: MetaAdSetData[] = [];

  await Promise.all(
    credentials.accountIds.map(async (accountId) => {
      // Fetch adset metadata (status, budget) scoped to the campaign
      const statusUrl = new URL(
        `https://graph.facebook.com/v25.0/${campaignId}/adsets`
      );
      statusUrl.searchParams.set(
        "fields",
        "id,name,campaign_id,effective_status,status,daily_budget,lifetime_budget"
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
        const [statusRes, insightRes] = await Promise.all([
          fetch(statusUrl.toString(), { cache: "no-store" }),
          fetch(insightUrl.toString(), { cache: "no-store" }),
        ]);

        const statusJson = statusRes.ok
          ? ((await statusRes.json()) as { data?: RawAdSet[] })
          : { data: [] as RawAdSet[] };
        const insightJson = insightRes.ok
          ? ((await insightRes.json()) as { data?: RawAdSetInsight[] })
          : { data: [] as RawAdSetInsight[] };

        const statusMap = new Map<string, RawAdSet>(
          (statusJson.data ?? []).map((a) => [a.id, a])
        );

        for (const insight of insightJson.data ?? []) {
          if (insight.campaign_id !== campaignId) continue;

          const adsetId = insight.adset_id ?? "";
          const meta = statusMap.get(adsetId);

          results.push({
            id: adsetId,
            name: insight.adset_name ?? meta?.name ?? "Unknown Ad Set",
            campaignId,
            status: meta?.effective_status ?? meta?.status ?? "UNKNOWN",
            dailyBudget: meta?.daily_budget ? parseNum(meta.daily_budget) : null,
            lifetimeBudget: meta?.lifetime_budget
              ? parseNum(meta.lifetime_budget)
              : null,
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
      } catch {
        // Per-account failures are silent — other accounts still process
      }
    })
  );

  return results.sort((a, b) => b.spend - a.spend);
}

// ── Breakdown helpers ─────────────────────────────────────────────────────────

async function fetchBreakdownRaw(
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
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: RawBreakdownInsight[] };
    return json.data ?? [];
  } catch {
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
