import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { runMigrations } from "@/lib/migrations";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoMetaCampaigns } from "@/lib/demo-business";
import {
  getCachedRouteReport,
  setCachedRouteReport,
} from "@/lib/route-report-cache";
import {
  appendMetaConfigSnapshots,
  readPreviousDifferentMetaConfigDiffs,
} from "@/lib/meta/config-snapshots";
import { buildConfigSnapshotPayload, summarizeCampaignConfig } from "@/lib/meta/configuration";
import {
  fetchPreviousCampaignBudgetsFromHistory,
} from "@/lib/meta/activity-history";

// ── Meta API types ────────────────────────────────────────────────────────────

interface MetaActionValue {
  action_type: string;
  value: string;
}

interface MetaCampaignInsightRecord {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  cpp?: string;
  reach?: string;
  frequency?: string;
  impressions?: string;
  clicks?: string;
  unique_clicks?: string;
  unique_ctr?: string;
  inline_link_click_ctr?: string;
  actions?: MetaActionValue[];
  action_values?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
  video_play_actions?: MetaActionValue[];
  video_p25_watched_actions?: MetaActionValue[];
  video_p50_watched_actions?: MetaActionValue[];
  video_p75_watched_actions?: MetaActionValue[];
  video_p100_watched_actions?: MetaActionValue[];
}

interface MetaCampaignRecord {
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

interface MetaAdSetConfigRecord {
  id: string;
  campaign_id?: string;
  name?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  bid_strategy?: string;
  bid_amount?: string;
  bid_constraints?: {
    roas_average_floor?: string;
  };
}

interface MetaGraphCollectionResponse<TItem> {
  data?: TItem[];
  paging?: {
    next?: string;
  };
}

// ── Public response shape ─────────────────────────────────────────────────────

export interface MetaCampaignRow {
  id: string;
  accountId: string;
  name: string;
  status: string;
  budgetLevel: "campaign" | "adset" | null;
  spend: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpp: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  uniqueClicks: number;
  uniqueCtr: number;
  inlineLinkClickCtr: number;
  outboundClicks: number;
  outboundCtr: number;
  uniqueOutboundClicks: number;
  uniqueOutboundCtr: number;
  landingPageViews: number;
  costPerLandingPageView: number;
  addToCart: number;
  addToCartValue: number;
  costPerAddToCart: number;
  initiateCheckout: number;
  initiateCheckoutValue: number;
  costPerCheckoutInitiated: number;
  leads: number;
  leadsValue: number;
  costPerLead: number;
  registrationsCompleted: number;
  registrationsCompletedValue: number;
  costPerRegistrationCompleted: number;
  searches: number;
  searchesValue: number;
  costPerSearch: number;
  addPaymentInfo: number;
  addPaymentInfoValue: number;
  costPerAddPaymentInfo: number;
  pageLikes: number;
  costPerPageLike: number;
  postEngagement: number;
  costPerEngagement: number;
  postReactions: number;
  costPerReaction: number;
  postComments: number;
  costPerPostComment: number;
  postShares: number;
  costPerPostShare: number;
  messagingConversationsStarted: number;
  costPerMessagingConversationStarted: number;
  appInstalls: number;
  costPerAppInstall: number;
  contentViews: number;
  contentViewsValue: number;
  costPerContentView: number;
  videoViews3s: number;
  videoViews15s: number;
  videoViews25: number;
  videoViews50: number;
  videoViews75: number;
  videoViews95: number;
  videoViews100: number;
  costPerVideoView: number;
  currency: string;
  optimizationGoal: string | null;
  bidStrategyType: string | null;
  bidStrategyLabel: string | null;
  manualBidAmount: number | null;
  previousManualBidAmount: number | null;
  bidValue: number | null;
  bidValueFormat: "currency" | "roas" | null;
  previousBidValue: number | null;
  previousBidValueFormat: "currency" | "roas" | null;
  previousBidValueCapturedAt: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  previousDailyBudget: number | null;
  previousLifetimeBudget: number | null;
  previousBudgetCapturedAt: string | null;
  isBudgetMixed: boolean;
  isConfigMixed: boolean;
  isOptimizationGoalMixed: boolean;
  isBidStrategyMixed: boolean;
  isBidValueMixed: boolean;
}

const META_CAMPAIGNS_REPORT_VERSION = "v13";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAction(arr: MetaActionValue[] | undefined, type: string): number {
  if (!Array.isArray(arr)) return 0;
  const found = arr.find((a) => a.action_type === type);
  return found ? parseFloat(found.value) || 0 : 0;
}

function normalizeActionType(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseActionAny(arr: MetaActionValue[] | undefined, candidates: string[]): number {
  if (!Array.isArray(arr)) return 0;
  const normalizedCandidates = new Set(candidates.map(normalizeActionType));
  let total = 0;
  for (const item of arr) {
    const actionType = typeof item?.action_type === "string" ? normalizeActionType(item.action_type) : "";
    if (!normalizedCandidates.has(actionType)) continue;
    total += parseFloat(item.value) || 0;
  }
  return total;
}

function safeDivide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function nDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function fetchPagedCollection<TItem>(initialUrl: string): Promise<TItem[]> {
  const rows: TItem[] = [];
  let nextUrl: string | null = initialUrl;
  let pageCount = 0;

  while (nextUrl && pageCount < 20) {
    const res = await fetch(nextUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) break;
    const json = (await res.json()) as MetaGraphCollectionResponse<TItem>;
    rows.push(...(json.data ?? []));
    nextUrl = json.paging?.next ?? null;
    pageCount += 1;
  }

  return rows;
}

async function fetchAssignedAccountIds(businessId: string): Promise<string[]> {
  try {
    const row = await getProviderAccountAssignments(businessId, "meta");
    return row?.account_ids ?? [];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("does not exist") || msg.includes("relation")) {
      try {
        await runMigrations();
        const row = await getProviderAccountAssignments(businessId, "meta");
        return row?.account_ids ?? [];
      } catch {
        return [];
      }
    }
    return [];
  }
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

async function fetchCampaignStatuses(
  accountId: string,
  accessToken: string
): Promise<Map<string, string>> {
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/campaigns`);
  url.searchParams.set("fields", "id,name,effective_status,status");
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", accessToken);

  try {
    const jsonRows = await fetchPagedCollection<MetaCampaignRecord>(url.toString());
    const map = new Map<string, string>();
    for (const c of jsonRows) {
      map.set(c.id, c.effective_status ?? c.status ?? "UNKNOWN");
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchCampaignConfigs(
  accountId: string,
  accessToken: string
): Promise<Map<string, MetaCampaignRecord>> {
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/campaigns`);
  url.searchParams.set(
    "fields",
    "id,name,effective_status,status,daily_budget,lifetime_budget,bid_strategy,bid_amount,bid_constraints{roas_average_floor}"
  );
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", accessToken);

  try {
    const jsonRows = await fetchPagedCollection<MetaCampaignRecord>(url.toString());
    return new Map(jsonRows.map((campaign) => [campaign.id, campaign]));
  } catch {
    return new Map();
  }
}

async function fetchAdSetConfigs(
  accountId: string,
  accessToken: string
): Promise<Map<string, MetaAdSetConfigRecord[]>> {
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/adsets`);
  url.searchParams.set(
    "fields",
    "id,campaign_id,name,daily_budget,lifetime_budget,optimization_goal,bid_strategy,bid_amount,bid_constraints{roas_average_floor}"
  );
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", accessToken);

  try {
    const jsonRows = await fetchPagedCollection<MetaAdSetConfigRecord>(url.toString());
    const grouped = new Map<string, MetaAdSetConfigRecord[]>();
    for (const adset of jsonRows) {
      const campaignId = adset.campaign_id ?? "";
      if (!campaignId) continue;
      const list = grouped.get(campaignId) ?? [];
      list.push(adset);
      grouped.set(campaignId, list);
    }
    return grouped;
  } catch {
    return new Map();
  }
}

async function fetchCampaignInsights(
  accountId: string,
  since: string,
  until: string,
  accessToken: string
): Promise<MetaCampaignInsightRecord[]> {
  const url = new URL(`https://graph.facebook.com/v25.0/${accountId}/insights`);
  url.searchParams.set("level", "campaign");
  url.searchParams.set(
    "fields",
    "campaign_id,campaign_name,spend,ctr,cpm,impressions,clicks,actions,action_values,purchase_roas"
    + ",cpc,cpp,reach,frequency,unique_clicks,unique_ctr,inline_link_click_ctr"
    + ",video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions"
  );
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("limit", "200");
  url.searchParams.set("access_token", accessToken);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      console.warn("[meta-campaigns] insights non-ok", { accountId, status: res.status, raw: raw.slice(0, 300) });
      return [];
    }
    const json = (await res.json()) as { data?: MetaCampaignInsightRecord[] };
    return json.data ?? [];
  } catch (e: unknown) {
    console.warn("[meta-campaigns] insights fetch threw", { accountId, message: String(e) });
    return [];
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const requestedAccountId = searchParams.get("accountId");
  const metaDebug = searchParams.get("metaDebug") === "1";
  const includePrev = searchParams.get("includePrev") === "1";

  console.log("[meta-campaigns] request", { businessId, startDate, endDate });

  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId is required." },
      { status: 400 }
    );
  }
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;
  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoMetaCampaigns());
  }

  const cached = await getCachedRouteReport<{ rows: MetaCampaignRow[] }>({
    businessId,
    provider: "meta",
    reportType: `meta_campaigns_list_${META_CAMPAIGNS_REPORT_VERSION}`,
    searchParams,
  });
  if (cached) {
    return NextResponse.json(cached);
  }

  const resolvedStart = startDate ?? toISODate(nDaysAgo(29));
  const resolvedEnd = endDate ?? toISODate(new Date());

  // Step 1: Assigned accounts
  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
  console.log("[meta-campaigns] assigned accounts", { businessId, count: assignedAccountIds.length });

  if (assignedAccountIds.length === 0) {
    return NextResponse.json({ status: "no_accounts_assigned", rows: [] });
  }

  const targetAccountIds =
    requestedAccountId && requestedAccountId !== "all"
      ? assignedAccountIds.filter((accountId) => accountId === requestedAccountId)
      : assignedAccountIds;

  if (targetAccountIds.length === 0) {
    return NextResponse.json({ status: "account_not_assigned", rows: [] });
  }

  // Step 2: Access token
  const integration = await getIntegration(businessId, "meta").catch(() => null);
  const accessToken = integration?.access_token ?? null;

  if (!accessToken) {
    return NextResponse.json({ status: "no_access_token", rows: [] });
  }

  // Step 3: Fetch insights + campaign statuses per account
  const allRows: MetaCampaignRow[] = [];

  for (const accountId of targetAccountIds) {
    try {
      const [statusMap, campaignConfigs, adsetConfigsByCampaign, insights, currency] = await Promise.all([
        fetchCampaignStatuses(accountId, accessToken),
        fetchCampaignConfigs(accountId, accessToken),
        fetchAdSetConfigs(accountId, accessToken),
        fetchCampaignInsights(accountId, resolvedStart, resolvedEnd, accessToken),
        fetchAccountCurrency(accountId, accessToken),
      ]);

      if (metaDebug) {
        console.log("[meta-campaigns][debug] account payload summary", {
          businessId,
          accountId,
          insightCount: insights.length,
          campaignConfigCount: campaignConfigs.size,
          adsetCampaignGroupCount: adsetConfigsByCampaign.size,
          sampleCampaignConfigs: Array.from(campaignConfigs.values()).slice(0, 5).map((campaign) => ({
            id: campaign.id,
            bid_strategy: campaign.bid_strategy ?? null,
            bid_amount: campaign.bid_amount ?? null,
            bid_constraints: campaign.bid_constraints ?? null,
            daily_budget: campaign.daily_budget ?? null,
            lifetime_budget: campaign.lifetime_budget ?? null,
          })),
          sampleAdsetConfigs: Array.from(adsetConfigsByCampaign.values())
            .flat()
            .slice(0, 8)
            .map((adset) => ({
              id: adset.id,
              campaign_id: adset.campaign_id ?? null,
              optimization_goal: adset.optimization_goal ?? null,
              bid_strategy: adset.bid_strategy ?? null,
              bid_amount: adset.bid_amount ?? null,
              bid_constraints: adset.bid_constraints ?? null,
              daily_budget: adset.daily_budget ?? null,
              lifetime_budget: adset.lifetime_budget ?? null,
            })),
        });
      }

      const campaignIds = insights
        .map((insight) => insight.campaign_id ?? "")
        .filter(Boolean);
      const activityHistorySince = new Date();
      activityHistorySince.setUTCDate(activityHistorySince.getUTCDate() - 365);
      const currentAdsets = Array.from(
        new Set(
          campaignIds.flatMap((campaignId) =>
            (adsetConfigsByCampaign.get(campaignId) ?? []).map((adset) => adset.id)
          )
        )
      );
      const campaignDailyBudgets = new Map(
        campaignIds
          .map((campaignId) => {
            const dailyBudget = campaignConfigs.get(campaignId)?.daily_budget;
            return [
              campaignId,
              dailyBudget != null ? parseFloat(dailyBudget) || 0 : null,
            ] as const;
          })
          .filter((entry): entry is readonly [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
      );
      const [previousCampaignSnapshots, previousAdSetDiffs, previousBudgetByCampaign] = includePrev
        ? await Promise.all([
            readPreviousDifferentMetaConfigDiffs({
              businessId,
              entityLevel: "campaign",
              entityIds: campaignIds,
            }),
            readPreviousDifferentMetaConfigDiffs({
              businessId,
              entityLevel: "adset",
              entityIds: currentAdsets,
            }),
            fetchPreviousCampaignBudgetsFromHistory({
              accountId,
              accessToken,
              since: activityHistorySince.toISOString().slice(0, 10),
              until: resolvedEnd,
              currentDailyBudgetsByCampaign: campaignDailyBudgets,
              maxPages: 6,
            }).catch(() => new Map()),
          ])
        : [new Map(), new Map(), new Map()];
      const accountSnapshotRows: Array<{
        businessId: string;
        accountId: string;
        entityLevel: "campaign" | "adset";
        entityId: string;
        payload: ReturnType<typeof buildConfigSnapshotPayload>;
      }> = [];

      for (const insight of insights) {
        const spend = parseFloat(insight.spend ?? "0") || 0;
        const purchases = parseAction(insight.actions, "purchase");
        const revenueFromValues = parseAction(insight.action_values, "purchase");
        const purchaseRoasVal = parseAction(insight.purchase_roas, "omni_purchase");
        const revenue = revenueFromValues > 0 ? revenueFromValues : spend * purchaseRoasVal;
        const roas = spend > 0 ? revenue / spend : 0;
        const cpa = purchases > 0 ? spend / purchases : 0;
        const ctr = parseFloat(insight.ctr ?? "0") || 0;
        const cpm = parseFloat(insight.cpm ?? "0") || 0;
        const impressions = parseInt(insight.impressions ?? "0", 10) || 0;
        const reach = parseInt(insight.reach ?? "0", 10) || 0;
        const frequency = parseFloat(insight.frequency ?? "0") || safeDivide(impressions, reach);
        const clicks = parseInt(insight.clicks ?? "0", 10) || 0;
        const cpc = parseFloat(insight.cpc ?? "0") || safeDivide(spend, clicks);
        const cpp = parseFloat(insight.cpp ?? "0") || safeDivide(spend, reach);
        const uniqueClicks = parseInt(insight.unique_clicks ?? "0", 10) || 0;
        const uniqueCtr = parseFloat(insight.unique_ctr ?? "0") || 0;
        const inlineLinkClickCtr = parseFloat(insight.inline_link_click_ctr ?? "0") || 0;
        const outboundClicks = Math.round(
          parseActionAny(insight.actions, ["outbound_click", "omni_outbound_click"])
        );
        const uniqueOutboundClicks = Math.round(
          parseActionAny(insight.actions, ["unique_outbound_click", "omni_unique_outbound_click"])
        );
        const outboundCtr = safeDivide(outboundClicks * 100, impressions);
        const uniqueOutboundCtr = safeDivide(uniqueOutboundClicks * 100, impressions);
        const landingPageViews = Math.round(
          parseActionAny(insight.actions, [
            "landing_page_view",
            "omni_landing_page_view",
            "offsite_conversion_fb_pixel_landing_page_view",
            "offsite_conversion.fb_pixel_landing_page_view",
          ])
        );
        const addToCart = Math.round(
          parseActionAny(insight.actions, [
            "add_to_cart",
            "omni_add_to_cart",
            "offsite_conversion_fb_pixel_add_to_cart",
            "offsite_conversion.fb_pixel_add_to_cart",
            "fb_mobile_add_to_cart",
          ])
        );
        const addToCartValue = parseActionAny(insight.action_values, [
          "add_to_cart",
          "omni_add_to_cart",
          "offsite_conversion_fb_pixel_add_to_cart",
          "offsite_conversion.fb_pixel_add_to_cart",
          "fb_mobile_add_to_cart",
        ]);
        const initiateCheckout = Math.round(
          parseActionAny(insight.actions, [
            "initiated_checkout",
            "initiate_checkout",
            "omni_initiated_checkout",
            "offsite_conversion_fb_pixel_initiate_checkout",
            "offsite_conversion.fb_pixel_initiate_checkout",
            "fb_mobile_initiated_checkout",
            "fb_mobile_initiate_checkout",
          ])
        );
        const initiateCheckoutValue = parseActionAny(insight.action_values, [
          "initiated_checkout",
          "initiate_checkout",
          "omni_initiated_checkout",
          "offsite_conversion_fb_pixel_initiate_checkout",
          "offsite_conversion.fb_pixel_initiate_checkout",
          "fb_mobile_initiated_checkout",
          "fb_mobile_initiate_checkout",
        ]);
        const leads = Math.round(
          parseActionAny(insight.actions, [
            "lead",
            "onsite_conversion_lead",
            "offsite_conversion_fb_pixel_lead",
            "offsite_conversion.fb_pixel_lead",
          ])
        );
        const leadsValue = parseActionAny(insight.action_values, [
          "lead",
          "onsite_conversion_lead",
          "offsite_conversion_fb_pixel_lead",
          "offsite_conversion.fb_pixel_lead",
        ]);
        const registrationsCompleted = Math.round(
          parseActionAny(insight.actions, [
            "complete_registration",
            "complete_registration_mobile_app",
            "omni_complete_registration",
          ])
        );
        const registrationsCompletedValue = parseActionAny(insight.action_values, [
          "complete_registration",
          "complete_registration_mobile_app",
          "omni_complete_registration",
        ]);
        const searches = Math.round(
          parseActionAny(insight.actions, ["search", "omni_search"])
        );
        const searchesValue = parseActionAny(insight.action_values, ["search", "omni_search"]);
        const addPaymentInfo = Math.round(
          parseActionAny(insight.actions, [
            "add_payment_info",
            "omni_add_payment_info",
            "offsite_conversion_fb_pixel_add_payment_info",
            "offsite_conversion.fb_pixel_add_payment_info",
          ])
        );
        const addPaymentInfoValue = parseActionAny(insight.action_values, [
          "add_payment_info",
          "omni_add_payment_info",
          "offsite_conversion_fb_pixel_add_payment_info",
          "offsite_conversion.fb_pixel_add_payment_info",
        ]);
        const pageLikes = Math.round(parseActionAny(insight.actions, ["like", "page_like"]));
        const postEngagement = Math.round(parseActionAny(insight.actions, ["post_engagement"]));
        const postReactions = Math.round(parseActionAny(insight.actions, ["post_reaction"]));
        const postComments = Math.round(parseActionAny(insight.actions, ["comment"]));
        const postShares = Math.round(parseActionAny(insight.actions, ["post"]));
        const messagingConversationsStarted = Math.round(
          parseActionAny(insight.actions, [
            "onsite_conversion_messaging_conversation_started_7d",
            "onsite_conversion_total_messaging_connection",
            "messaging_conversation_started_7d",
          ])
        );
        const appInstalls = Math.round(
          parseActionAny(insight.actions, ["mobile_app_install", "app_install"])
        );
        const contentViews = Math.round(
          parseActionAny(insight.actions, [
            "view_content",
            "omni_view_content",
            "offsite_conversion_fb_pixel_view_content",
            "offsite_conversion.fb_pixel_view_content",
            "onsite_web_view_content",
          ])
        );
        const contentViewsValue = parseActionAny(insight.action_values, [
          "view_content",
          "omni_view_content",
          "offsite_conversion_fb_pixel_view_content",
          "offsite_conversion.fb_pixel_view_content",
          "onsite_web_view_content",
        ]);
        const videoViews3s = Math.round(parseActionAny(insight.video_play_actions, ["video_view"]));
        const videoViews25 = Math.round(parseActionAny(insight.video_p25_watched_actions, ["video_view"]));
        const videoViews50 = Math.round(parseActionAny(insight.video_p50_watched_actions, ["video_view"]));
        const videoViews75 = Math.round(parseActionAny(insight.video_p75_watched_actions, ["video_view"]));
        const videoViews100 = Math.round(parseActionAny(insight.video_p100_watched_actions, ["video_view"]));
        const videoViews15s = Math.min(videoViews25, videoViews3s);
        const campaignId = insight.campaign_id ?? "";
        const campaignConfig = campaignConfigs.get(campaignId);
        const adsetConfigs = (adsetConfigsByCampaign.get(campaignId) ?? []).map((adset) =>
          buildConfigSnapshotPayload({
            campaignId,
            optimizationGoal: adset.optimization_goal ?? null,
            bidStrategy: adset.bid_strategy ?? null,
            manualBidAmount: adset.bid_amount ? parseFloat(adset.bid_amount) || 0 : null,
            targetRoas: adset.bid_constraints?.roas_average_floor
              ? parseFloat(adset.bid_constraints.roas_average_floor) || 0
              : null,
            dailyBudget: adset.daily_budget ? parseFloat(adset.daily_budget) || 0 : null,
            lifetimeBudget: adset.lifetime_budget ? parseFloat(adset.lifetime_budget) || 0 : null,
          })
        );
        const previousAdSets = (adsetConfigsByCampaign.get(campaignId) ?? [])
          .map((adset) => ({
            campaignId,
            manualBidAmount:
              previousAdSetDiffs.get(adset.id)?.previousManualBidAmount ?? null,
            bidValue: previousAdSetDiffs.get(adset.id)?.previousBidValue ?? null,
            bidValueFormat: previousAdSetDiffs.get(adset.id)?.previousBidValueFormat ?? null,
          }));
        const configSummary = summarizeCampaignConfig({
          campaignId,
          campaignDailyBudget: campaignConfig?.daily_budget
            ? parseFloat(campaignConfig.daily_budget) || 0
            : null,
          campaignLifetimeBudget: campaignConfig?.lifetime_budget
            ? parseFloat(campaignConfig.lifetime_budget) || 0
            : null,
            campaignBidStrategy: campaignConfig?.bid_strategy ?? null,
            campaignManualBidAmount: campaignConfig?.bid_amount
              ? parseFloat(campaignConfig.bid_amount) || 0
              : null,
            targetRoas: campaignConfig?.bid_constraints?.roas_average_floor
              ? parseFloat(campaignConfig.bid_constraints.roas_average_floor) || 0
              : null,
            adsets: adsetConfigs,
            previousAdsets: previousAdSets,
            previousCampaignManualBidAmount:
            previousCampaignSnapshots.get(campaignId)?.previousManualBidAmount ?? null,
        });
        const historyBudget = previousBudgetByCampaign.get(campaignId) ?? {
          previousDailyBudget: null,
          capturedAt: null,
        };

        if (metaDebug) {
          console.log("[meta-campaigns][debug] campaign normalized", {
            businessId,
            accountId,
            campaignId,
            campaignName: insight.campaign_name ?? null,
            rawCampaignConfig: campaignConfig
              ? {
                  bid_strategy: campaignConfig.bid_strategy ?? null,
                  bid_amount: campaignConfig.bid_amount ?? null,
                  bid_constraints: campaignConfig.bid_constraints ?? null,
                  daily_budget: campaignConfig.daily_budget ?? null,
                  lifetime_budget: campaignConfig.lifetime_budget ?? null,
                }
              : null,
            rawAdsets: (adsetConfigsByCampaign.get(campaignId) ?? []).map((adset) => ({
              id: adset.id,
              optimization_goal: adset.optimization_goal ?? null,
              bid_strategy: adset.bid_strategy ?? null,
              bid_amount: adset.bid_amount ?? null,
              bid_constraints: adset.bid_constraints ?? null,
              daily_budget: adset.daily_budget ?? null,
              lifetime_budget: adset.lifetime_budget ?? null,
            })),
            normalized: {
              optimizationGoal: configSummary.optimizationGoal,
              bidStrategyType: configSummary.bidStrategyType,
              bidStrategyLabel: configSummary.bidStrategyLabel,
              bidValue: configSummary.bidValue,
              bidValueFormat: configSummary.bidValueFormat,
              dailyBudget: configSummary.dailyBudget,
              lifetimeBudget: configSummary.lifetimeBudget,
              isBudgetMixed: configSummary.isBudgetMixed,
              isOptimizationGoalMixed: configSummary.isOptimizationGoalMixed,
              isBidStrategyMixed: configSummary.isBidStrategyMixed,
              isBidValueMixed: configSummary.isBidValueMixed,
            },
          });
        }

        allRows.push({
          id: campaignId,
          accountId,
          name: insight.campaign_name ?? "Unknown Campaign",
          status: statusMap.get(campaignId) ?? "UNKNOWN",
          budgetLevel:
            campaignConfig?.daily_budget != null || campaignConfig?.lifetime_budget != null
              ? "campaign"
              : "adset",
          spend: r2(spend),
          purchases: Math.round(purchases),
          revenue: r2(revenue),
          roas: r2(roas),
          cpa: r2(cpa),
          ctr: r2(ctr),
          cpm: r2(cpm),
          cpc: r2(cpc),
          cpp: r2(cpp),
          impressions,
          reach,
          frequency: r2(frequency),
          clicks,
          uniqueClicks,
          uniqueCtr: r2(uniqueCtr),
          inlineLinkClickCtr: r2(inlineLinkClickCtr),
          outboundClicks,
          outboundCtr: r2(outboundCtr),
          uniqueOutboundClicks,
          uniqueOutboundCtr: r2(uniqueOutboundCtr),
          landingPageViews,
          costPerLandingPageView: r2(safeDivide(spend, landingPageViews)),
          addToCart,
          addToCartValue: r2(addToCartValue),
          costPerAddToCart: r2(safeDivide(spend, addToCart)),
          initiateCheckout,
          initiateCheckoutValue: r2(initiateCheckoutValue),
          costPerCheckoutInitiated: r2(safeDivide(spend, initiateCheckout)),
          leads,
          leadsValue: r2(leadsValue),
          costPerLead: r2(safeDivide(spend, leads)),
          registrationsCompleted,
          registrationsCompletedValue: r2(registrationsCompletedValue),
          costPerRegistrationCompleted: r2(safeDivide(spend, registrationsCompleted)),
          searches,
          searchesValue: r2(searchesValue),
          costPerSearch: r2(safeDivide(spend, searches)),
          addPaymentInfo,
          addPaymentInfoValue: r2(addPaymentInfoValue),
          costPerAddPaymentInfo: r2(safeDivide(spend, addPaymentInfo)),
          pageLikes,
          costPerPageLike: r2(safeDivide(spend, pageLikes)),
          postEngagement,
          costPerEngagement: r2(safeDivide(spend, postEngagement)),
          postReactions,
          costPerReaction: r2(safeDivide(spend, postReactions)),
          postComments,
          costPerPostComment: r2(safeDivide(spend, postComments)),
          postShares,
          costPerPostShare: r2(safeDivide(spend, postShares)),
          messagingConversationsStarted,
          costPerMessagingConversationStarted: r2(
            safeDivide(spend, messagingConversationsStarted)
          ),
          appInstalls,
          costPerAppInstall: r2(safeDivide(spend, appInstalls)),
          contentViews,
          contentViewsValue: r2(contentViewsValue),
          costPerContentView: r2(safeDivide(spend, contentViews)),
          videoViews3s,
          videoViews15s,
          videoViews25,
          videoViews50,
          videoViews75,
          videoViews95: videoViews100,
          videoViews100,
          costPerVideoView: r2(safeDivide(spend, videoViews3s)),
          currency,
          optimizationGoal: configSummary.optimizationGoal,
          bidStrategyType: configSummary.bidStrategyType,
          bidStrategyLabel: configSummary.bidStrategyLabel,
          manualBidAmount: configSummary.manualBidAmount,
          previousManualBidAmount: configSummary.previousManualBidAmount,
          bidValue: configSummary.bidValue,
          bidValueFormat: configSummary.bidValueFormat,
          previousBidValue: configSummary.previousBidValue,
          previousBidValueFormat:
            previousCampaignSnapshots.get(campaignId)?.previousBidValueFormat ?? null,
          previousBidValueCapturedAt:
            previousCampaignSnapshots.get(campaignId)?.previousBidCapturedAt ?? null,
          dailyBudget: configSummary.dailyBudget,
          lifetimeBudget: configSummary.lifetimeBudget,
          previousDailyBudget:
            historyBudget.previousDailyBudget ??
            previousCampaignSnapshots.get(campaignId)?.previousDailyBudget ??
            null,
          previousLifetimeBudget:
            previousCampaignSnapshots.get(campaignId)?.previousLifetimeBudget ?? null,
          previousBudgetCapturedAt:
            historyBudget.capturedAt ??
            previousCampaignSnapshots.get(campaignId)?.previousBudgetCapturedAt ??
            null,
          isBudgetMixed: Boolean(configSummary.isBudgetMixed),
          isConfigMixed: Boolean(configSummary.isConfigMixed),
          isOptimizationGoalMixed: Boolean(configSummary.isOptimizationGoalMixed),
          isBidStrategyMixed: Boolean(configSummary.isBidStrategyMixed),
          isBidValueMixed: Boolean(configSummary.isBidValueMixed),
        });

        accountSnapshotRows.push({
          businessId,
          accountId,
          entityLevel: "campaign",
          entityId: campaignId,
          payload: buildConfigSnapshotPayload({
            campaignId,
            optimizationGoal: configSummary.optimizationGoal,
            bidStrategy: configSummary.bidStrategyType,
            manualBidAmount: configSummary.manualBidAmount,
            targetRoas:
              configSummary.bidValueFormat === "roas" ? configSummary.bidValue : null,
            dailyBudget: configSummary.dailyBudget,
            lifetimeBudget: configSummary.lifetimeBudget,
            isBudgetMixed: configSummary.isBudgetMixed,
            isConfigMixed: configSummary.isConfigMixed,
            isOptimizationGoalMixed: configSummary.isOptimizationGoalMixed,
            isBidStrategyMixed: configSummary.isBidStrategyMixed,
            isBidValueMixed: configSummary.isBidValueMixed,
          }),
        });
      }

      for (const adset of currentAdsets) {
        const adsetRecord = Array.from(adsetConfigsByCampaign.values())
          .flat()
          .find((item) => item.id === adset);
        if (!adsetRecord) continue;
        accountSnapshotRows.push({
          businessId,
          accountId,
          entityLevel: "adset",
          entityId: adsetRecord.id,
          payload: buildConfigSnapshotPayload({
            campaignId: adsetRecord.campaign_id ?? null,
            optimizationGoal: adsetRecord.optimization_goal ?? null,
            bidStrategy: adsetRecord.bid_strategy ?? null,
            manualBidAmount: adsetRecord.bid_amount ? parseFloat(adsetRecord.bid_amount) || 0 : null,
            targetRoas: adsetRecord.bid_constraints?.roas_average_floor
              ? parseFloat(adsetRecord.bid_constraints.roas_average_floor) || 0
              : null,
            dailyBudget: adsetRecord.daily_budget ? parseFloat(adsetRecord.daily_budget) || 0 : null,
            lifetimeBudget: adsetRecord.lifetime_budget ? parseFloat(adsetRecord.lifetime_budget) || 0 : null,
          }),
        });
      }

      await appendMetaConfigSnapshots(accountSnapshotRows);
    } catch (e: unknown) {
      console.warn("[meta-campaigns] account processing failed", {
        businessId,
        accountId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Sort by spend descending
  allRows.sort((a, b) => b.spend - a.spend);

  console.log("[meta-campaigns] response", { businessId, rowCount: allRows.length });
  const payload = { rows: allRows };
  await setCachedRouteReport({
    businessId,
    provider: "meta",
    reportType: `meta_campaigns_list_${META_CAMPAIGNS_REPORT_VERSION}`,
    searchParams,
    payload,
  });
  return NextResponse.json(payload);
}
