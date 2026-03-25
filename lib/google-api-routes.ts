import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  calculateCpa,
  calculateCpm,
  calculateCtr,
  calculateRoas,
  executeGaqlQuery,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  normalizeChannelType,
  normalizeCostMicros,
  normalizeStatus,
} from "@/lib/google-ads-gaql";
import {
  executeGoogleQueries,
  requireBusinessIdJson,
  resolveGoogleAccountsToQuery,
  uniqueByKey,
} from "@/lib/google-api-routes-support";
import type { AppLanguage } from "@/lib/i18n";
import { resolveRequestLanguage } from "@/lib/request-language";

type GoogleDateRange = "7" | "14" | "30" | "custom";

interface RecommendationEvidence {
  label: string;
  value: string;
}

interface Recommendation {
  id: string;
  title: string;
  description: string;
  impact: "High" | "Med" | "Low";
  summary: string[];
  evidence: RecommendationEvidence[];
}

function tr(language: AppLanguage, english: string, turkish: string) {
  return language === "tr" ? turkish : english;
}

function getGoogleRouteParams(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  return {
    businessId: searchParams.get("businessId"),
    accountId: searchParams.get("accountId"),
    dateRange: (searchParams.get("dateRange") || "30") as GoogleDateRange,
  };
}

async function requireGoogleRouteAccess(request: NextRequest, businessId: string) {
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;
  return null;
}

export async function getGoogleAccountsRoute(request: NextRequest) {
  const { businessId: rawBusinessId, dateRange } = getGoogleRouteParams(request);
  const missingBusinessIdResponse = requireBusinessIdJson(rawBusinessId);
  if (missingBusinessIdResponse) return missingBusinessIdResponse;
  const businessId = rawBusinessId as string;

  const authError = await requireGoogleRouteAccess(request, businessId);
  if (authError) return authError;

  try {
    const dateRangeParams = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      console.log("[accounts] No assigned accounts found for business", { businessId });
      return NextResponse.json({ data: [], count: 0 });
    }

    const allResults = await executeGoogleQueries({
      businessId,
      customerIds: assignedAccounts,
      errorLabel: "accounts",
      buildQuery: () => `
            SELECT
              customer.id,
              customer.descriptive_name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value
            FROM customer
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
          `,
    });

    const accounts = allResults
      .map((result, index) => {
        const row = result.results?.[0];
        if (!row) return null;

        const customerId = assignedAccounts[index];
        const customer = row as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");
        const conversions = parseInt(metrics.metrics?.conversions || "0");

        return {
          id: customerId,
          name: customer?.customer?.descriptive_name || `Account ${customerId}`,
          accountId: customerId,
          status: "active",
          metrics: {
            impressions: parseInt(metrics.metrics?.impressions || "0"),
            clicks: parseInt(metrics.metrics?.clicks || "0"),
            spend: cost,
            conversions,
            revenue: convValue,
            roas: calculateRoas(convValue, cost),
            cpc: cost > 0 ? cost / Math.max(metrics.metrics?.clicks || 1, 1) : 0,
            ctr: calculateCtr(metrics.metrics?.clicks || 0, metrics.metrics?.impressions || 0),
            cpm: calculateCpm(cost, metrics.metrics?.impressions || 0),
            cpa: conversions > 0 ? cost / conversions : 0,
          },
        };
      })
      .filter((row) => row !== null);

    return NextResponse.json({ data: accounts, count: accounts.length });
  } catch (error) {
    console.error("[accounts] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}

export async function getGoogleAdGroupsRoute(request: NextRequest) {
  const { businessId: rawBusinessId, accountId, dateRange } = getGoogleRouteParams(request);
  const missingBusinessIdResponse = requireBusinessIdJson(rawBusinessId);
  if (missingBusinessIdResponse) return missingBusinessIdResponse;
  const businessId = rawBusinessId as string;

  const authError = await requireGoogleRouteAccess(request, businessId);
  if (authError) return authError;

  try {
    const dateRangeParams = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json(
        { error: "No Google Ads accounts assigned to this business" },
        { status: 404 }
      );
    }

    const accountsToQuery = resolveGoogleAccountsToQuery(assignedAccounts, accountId);
    const allResults = await executeGoogleQueries({
      businessId,
      customerIds: accountsToQuery,
      errorLabel: "ad-groups",
      buildQuery: () => `
            SELECT
              ad_group.id,
              ad_group.name,
              ad_group.status,
              campaign.id,
              campaign.name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr,
              metrics.average_cpc
            FROM ad_group
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
    });

    const adGroups = allResults
      .flatMap((result) => result.results || [])
      .map((row) => {
        const adGroup = row.ad_group as any;
        const campaign = row.campaign as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const conversions = parseInt(metrics.metrics?.conversions || "0");
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");

        return {
          id: adGroup?.id || "unknown",
          name: adGroup?.name || "Unnamed Ad Group",
          status: normalizeStatus(adGroup?.status),
          campaignId: campaign?.id || "",
          campaignName: campaign?.name || "Unknown Campaign",
          metrics: {
            impressions: parseInt(metrics.metrics?.impressions || "0"),
            clicks: parseInt(metrics.metrics?.clicks || "0"),
            spend: cost,
            conversions,
            revenue: convValue,
            roas: calculateRoas(convValue, cost),
            cpa: calculateCpa(cost, conversions),
            ctr: calculateCtr(metrics.metrics?.clicks || 0, metrics.metrics?.impressions || 0),
            cpm: calculateCpm(cost, metrics.metrics?.impressions || 0),
          },
        };
      })
      .filter((adGroup) => adGroup.id !== "unknown");

    const uniqueAdGroups = uniqueByKey(adGroups, (adGroup) => adGroup.id);
    return NextResponse.json({ data: uniqueAdGroups, count: uniqueAdGroups.length });
  } catch (error) {
    console.error("[ad-groups] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch ad groups" },
      { status: 500 }
    );
  }
}

export async function getGoogleAdsRoute(request: NextRequest) {
  const { businessId: rawBusinessId, accountId, dateRange } = getGoogleRouteParams(request);
  const missingBusinessIdResponse = requireBusinessIdJson(rawBusinessId);
  if (missingBusinessIdResponse) return missingBusinessIdResponse;
  const businessId = rawBusinessId as string;

  const authError = await requireGoogleRouteAccess(request, businessId);
  if (authError) return authError;

  try {
    const dateRangeParams = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json(
        { error: "No Google Ads accounts assigned to this business" },
        { status: 404 }
      );
    }

    const accountsToQuery = resolveGoogleAccountsToQuery(assignedAccounts, accountId);
    const allResults = await executeGoogleQueries({
      businessId,
      customerIds: accountsToQuery,
      errorLabel: "ads",
      buildQuery: () => `
            SELECT
              ad_group_ad.ad.id,
              ad_group_ad.ad.name,
              ad_group_ad.status,
              ad_group_ad.ad.type,
              ad_group.name,
              campaign.name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr,
              metrics.average_cpc
            FROM ad_group_ad
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
    });

    const ads = allResults
      .flatMap((result) => result.results || [])
      .map((row: any) => {
        const ad = row.ad_group_ad?.ad as any;
        const adGroupAd = row.ad_group_ad as any;
        const adGroup = row.ad_group as any;
        const campaign = row.campaign as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const conversions = parseInt(metrics.metrics?.conversions || "0");
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");

        return {
          id: ad?.id || "unknown",
          name: ad?.name || `Ad (${ad?.type || "unknown"} type)`,
          status: normalizeStatus(adGroupAd?.status),
          type: ad?.type || "unknown",
          adGroupName: adGroup?.name || "Unknown Ad Group",
          campaignName: campaign?.name || "Unknown Campaign",
          metrics: {
            impressions: parseInt(metrics.metrics?.impressions || "0"),
            clicks: parseInt(metrics.metrics?.clicks || "0"),
            spend: cost,
            conversions,
            revenue: convValue,
            roas: calculateRoas(convValue, cost),
            cpa: calculateCpa(cost, conversions),
            ctr: calculateCtr(metrics.metrics?.clicks || 0, metrics.metrics?.impressions || 0),
            cpm: calculateCpm(cost, metrics.metrics?.impressions || 0),
          },
        };
      })
      .filter((ad) => ad.id !== "unknown");

    const uniqueAds = uniqueByKey(ads, (ad) => ad.id);
    return NextResponse.json({ data: uniqueAds, count: uniqueAds.length });
  } catch (error) {
    console.error("[ads] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch ads" },
      { status: 500 }
    );
  }
}

export async function getGoogleAssetsRoute(request: NextRequest) {
  const { businessId: rawBusinessId, accountId, dateRange } = getGoogleRouteParams(request);
  const missingBusinessIdResponse = requireBusinessIdJson(rawBusinessId);
  if (missingBusinessIdResponse) return missingBusinessIdResponse;
  const businessId = rawBusinessId as string;

  const authError = await requireGoogleRouteAccess(request, businessId);
  if (authError) return authError;

  try {
    const dateRangeParams = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json({
        data: [],
        count: 0,
        note: "No Google Ads accounts assigned to this business",
      });
    }

    const accountsToQuery = resolveGoogleAccountsToQuery(assignedAccounts, accountId);
    const allResults = await executeGoogleQueries({
      businessId,
      customerIds: accountsToQuery,
      errorLabel: "assets",
      buildQuery: () => `
            SELECT
              asset_group_asset.asset_group.name,
              asset_group_asset.asset.type,
              asset_group_asset.asset.name,
              asset_group_asset.performance_label,
              metrics.cost_micros,
              metrics.conversions_value
            FROM asset_group_asset
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
    });

    const assets = allResults.flatMap((result) => result.results || []).map((row, index) => {
      const assetGroupAsset = row.asset_group_asset as any;
      const metrics = row as any;
      const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
      const convValue = parseFloat(metrics.metrics?.conversions_value || "0");

      return {
        id: `ast-${index}`,
        asset_group: assetGroupAsset?.asset_group?.name || "Unknown Asset Group",
        asset_type: normalizeAssetType(assetGroupAsset?.asset?.type),
        asset_name: assetGroupAsset?.asset?.name || `${assetGroupAsset?.asset?.type || "Unknown"} Asset`,
        performance_label: normalizePerformanceLabel(assetGroupAsset?.performance_label),
        cost,
        conv_value: convValue,
        roas: calculateRoas(convValue, cost),
      };
    });

    return NextResponse.json({ data: assets, count: assets.length });
  } catch (error) {
    console.error("[assets] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch assets" },
      { status: 500 }
    );
  }
}

export async function getGoogleCampaignsRoute(request: NextRequest) {
  const { businessId: rawBusinessId, accountId, dateRange } = getGoogleRouteParams(request);
  const missingBusinessIdResponse = requireBusinessIdJson(rawBusinessId);
  if (missingBusinessIdResponse) return missingBusinessIdResponse;
  const businessId = rawBusinessId as string;

  const authError = await requireGoogleRouteAccess(request, businessId);
  if (authError) return authError;

  try {
    const dateRangeParams = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json(
        { error: "No Google Ads accounts assigned to this business" },
        { status: 404 }
      );
    }

    const accountsToQuery = resolveGoogleAccountsToQuery(assignedAccounts, accountId);
    const allResults = await executeGoogleQueries({
      businessId,
      customerIds: accountsToQuery,
      errorLabel: "campaigns",
      buildQuery: () => `
            SELECT
              campaign.id,
              campaign.name,
              campaign.status,
              campaign.advertising_channel_type,
              campaign.advertising_channel_sub_type,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value,
              metrics.ctr,
              metrics.average_cpc
            FROM campaign
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
    });

    const campaigns = allResults
      .flatMap((result) => result.results || [])
      .map((row) => {
        const campaign = row.campaign as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");

        return {
          id: campaign?.id || "unknown",
          name: campaign?.name || "Unnamed Campaign",
          status: normalizeStatus(campaign?.status),
          channel: normalizeChannelType(campaign?.advertising_channel_type),
          subChannel: campaign?.advertising_channel_sub_type || "",
          metrics: {
            impressions: parseInt(metrics.metrics?.impressions || "0"),
            clicks: parseInt(metrics.metrics?.clicks || "0"),
            spend: cost,
            conversions: parseInt(metrics.metrics?.conversions || "0"),
            revenue: convValue,
            roas: calculateRoas(convValue, cost),
            cpc: parseFloat(metrics.metrics?.average_cpc || "0") / 1000000,
            ctr: calculateCtr(metrics.metrics?.clicks || 0, metrics.metrics?.impressions || 0),
            cpm: calculateCpm(cost, metrics.metrics?.impressions || 0),
          },
        };
      })
      .filter((campaign) => campaign.id !== "unknown");

    const uniqueCampaigns = uniqueByKey(campaigns, (campaign) => campaign.id);
    return NextResponse.json({ data: uniqueCampaigns, count: uniqueCampaigns.length });
  } catch (error) {
    console.error("[campaigns] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

export async function getGoogleProductsRoute(request: NextRequest) {
  const { businessId: rawBusinessId, accountId, dateRange } = getGoogleRouteParams(request);
  const missingBusinessIdResponse = requireBusinessIdJson(rawBusinessId);
  if (missingBusinessIdResponse) return missingBusinessIdResponse;
  const businessId = rawBusinessId as string;

  const authError = await requireGoogleRouteAccess(request, businessId);
  if (authError) return authError;

  try {
    const dateRangeParams = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json({
        data: [],
        count: 0,
        note: "No Google Ads accounts assigned to this business",
      });
    }

    const accountsToQuery = resolveGoogleAccountsToQuery(assignedAccounts, accountId);
    const allResults = await executeGoogleQueries({
      businessId,
      customerIds: accountsToQuery,
      errorLabel: "products",
      buildQuery: () => `
            SELECT
              shopping_product.item_id,
              shopping_product.title,
              shopping_product.brand,
              shopping_product.custom_attribute0,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value
            FROM shopping_product_view
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
    });

    const products = allResults
      .flatMap((result) => result.results || [])
      .map((row, index) => {
        const product = row.shopping_product as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");
        const conversions = parseInt(metrics.metrics?.conversions || "0");

        return {
          id: `prd-${index}`,
          item_id: product?.item_id || `unknown-${index}`,
          title: product?.title || "Unknown Product",
          brand: product?.brand || "No Brand",
          price: parseFloat(product?.custom_attribute0 || "0") || 0,
          clicks: parseInt(metrics.metrics?.clicks || "0"),
          cost,
          conversions,
          conv_value: convValue,
          roas: calculateRoas(convValue, cost),
        };
      })
      .filter((product) => product.item_id !== "unknown");

    const uniqueProducts = uniqueByKey(products, (product) => product.item_id);
    return NextResponse.json({ data: uniqueProducts, count: uniqueProducts.length });
  } catch (error) {
    console.error("[products] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch products" },
      { status: 500 }
    );
  }
}

export async function getGoogleRecommendationsRoute(request: NextRequest) {
  const { businessId: rawBusinessId, accountId, dateRange } = getGoogleRouteParams(request);
  const missingBusinessIdResponse = requireBusinessIdJson(rawBusinessId);
  if (missingBusinessIdResponse) return missingBusinessIdResponse;
  const businessId = rawBusinessId as string;

  const authError = await requireGoogleRouteAccess(request, businessId);
  if (authError) return authError;

  try {
    const language = await resolveRequestLanguage(request);
    const dateRangeParams = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json({ data: [], count: 0 });
    }

    const accountsToQuery = resolveGoogleAccountsToQuery(assignedAccounts, accountId);
    const recommendations: Recommendation[] = [];

    const searchTermResults = await Promise.all(
      accountsToQuery.map((customerId) =>
        executeGaqlQuery({
          businessId,
          customerId,
          query: `
            SELECT
              search_term_view.search_term,
              campaign.name,
              ad_group.name,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value
            FROM search_term_view
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    const allSearchTerms = searchTermResults.flatMap((result: any) => result.results || []);
    const searchTermWasteRec = computeSearchTermWaste(allSearchTerms, language);
    if (searchTermWasteRec) recommendations.push(searchTermWasteRec);

    const campaignResults = await Promise.all(
      accountsToQuery.map((customerId) =>
        executeGaqlQuery({
          businessId,
          customerId,
          query: `
            SELECT
              campaign.name,
              campaign.status,
              metrics.cost_micros,
              metrics.conversions_value,
              metrics.conversions
            FROM campaign
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    const allCampaigns = campaignResults.flatMap((result: any) => result.results || []);
    const concentrationRec = computeSpendConcentration(allCampaigns, language);
    if (concentrationRec) recommendations.push(concentrationRec);

    const zeroConvRec = computeZeroConversionSpend(allCampaigns, language);
    if (zeroConvRec) recommendations.push(zeroConvRec);

    const assetResults = await Promise.all(
      accountsToQuery.map((customerId) =>
        executeGaqlQuery({
          businessId,
          customerId,
          query: `
            SELECT
              asset_group_asset.performance_label,
              metrics.cost_micros,
              metrics.conversions_value,
              metrics.conversions
            FROM asset_group_asset
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch(() => ({ results: [] }))
      )
    );

    const allAssets = assetResults.flatMap((result: any) => result.results || []);
    const assetRec = computeAssetGaps(allAssets, language);
    if (assetRec) recommendations.push(assetRec);

    return NextResponse.json({ data: recommendations, count: recommendations.length });
  } catch (error) {
    console.error("[recommendations] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch recommendations" },
      { status: 500 }
    );
  }
}

export async function getGoogleSearchTermsRoute(request: NextRequest) {
  const { businessId: rawBusinessId, accountId, dateRange } = getGoogleRouteParams(request);
  const searchFilter = request.nextUrl.searchParams.get("search")?.toLowerCase().trim() || "";
  const missingBusinessIdResponse = requireBusinessIdJson(rawBusinessId);
  if (missingBusinessIdResponse) return missingBusinessIdResponse;
  const businessId = rawBusinessId as string;

  const authError = await requireGoogleRouteAccess(request, businessId);
  if (authError) return authError;

  try {
    const dateRangeParams = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json({
        data: [],
        count: 0,
        note: "No Google Ads accounts assigned to this business",
      });
    }

    const accountsToQuery = resolveGoogleAccountsToQuery(assignedAccounts, accountId);
    const allResults = await executeGoogleQueries({
      businessId,
      customerIds: accountsToQuery,
      errorLabel: "search-terms",
      buildQuery: () => `
            SELECT
              search_term_view.search_term,
              search_term_view.status,
              campaign.name,
              ad_group.name,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value
            FROM search_term_view
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
    });

    const searchTerms = allResults
      .flatMap((result) => result.results || [])
      .map((row, index) => {
        const searchTermView = row.search_term_view as any;
        const campaign = row.campaign as any;
        const adGroup = row.ad_group as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const conversions = parseInt(metrics.metrics?.conversions || "0");
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");
        const clicks = parseInt(metrics.metrics?.clicks || "0");
        const impressions = parseInt(metrics.metrics?.impressions || "0");

        return {
          id: `st-${index}`,
          search_term: searchTermView?.search_term || "Unknown",
          match_type: normalizeMatchType(searchTermView?.status),
          campaign: campaign?.name || "Unknown Campaign",
          ad_group: adGroup?.name || "Unknown Ad Group",
          clicks,
          impressions,
          cost,
          conversions,
          conv_value: convValue,
          roas: calculateRoas(convValue, cost),
          cpa: calculateCpa(cost, conversions),
          ctr: calculateCtr(clicks, impressions),
          cpm: calculateCpm(cost, impressions),
        };
      })
      .filter((searchTerm) => !searchFilter || searchTerm.search_term.toLowerCase().includes(searchFilter));

    return NextResponse.json({ data: searchTerms, count: searchTerms.length });
  } catch (error) {
    console.error("[search-terms] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch search terms" },
      { status: 500 }
    );
  }
}

function normalizeAssetType(type: string | undefined): "image" | "video" | "text" | "unknown" {
  if (!type) return "unknown";
  const lower = type.toLowerCase();
  if (lower.includes("text")) return "text";
  if (lower.includes("image")) return "image";
  if (lower.includes("video")) return "video";
  return "unknown";
}

function normalizePerformanceLabel(label: string | undefined): "Best" | "Good" | "Low" | "Unknown" {
  if (!label) return "Unknown";
  const lower = label.toLowerCase();
  if (lower.includes("best")) return "Best";
  if (lower.includes("good")) return "Good";
  if (lower.includes("low")) return "Low";
  return "Unknown";
}

function normalizeMatchType(status: string | undefined): "Broad" | "Phrase" | "Exact" {
  if (!status) return "Broad";
  const lower = status.toLowerCase();
  if (lower.includes("phrase")) return "Phrase";
  if (lower.includes("exact")) return "Exact";
  return "Broad";
}

function computeSearchTermWaste(terms: any[], language: AppLanguage): Recommendation | null {
  if (!terms.length) return null;

  let totalCost = 0;
  const wastefulTerms: Array<{ term: string; cost: number; clicks: number; conversions: number }> = [];

  for (const term of terms) {
    const metrics = term as any;
    const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
    const conversions = parseInt(metrics.metrics?.conversions || "0");
    const clicks = parseInt(metrics.metrics?.clicks || "0");

    totalCost += cost;

    if (clicks >= 20 && conversions === 0 && cost >= 5) {
      wastefulTerms.push({
        term: metrics.search_term_view?.search_term || "unknown",
        cost,
        clicks,
        conversions,
      });
    }
  }

  if (wastefulTerms.length < 3) return null;

  const wasteCost = wastefulTerms.reduce((sum, term) => sum + term.cost, 0);
  const wastePct = totalCost > 0 ? ((wasteCost / totalCost) * 100).toFixed(1) : "0";

  return {
    id: "rec-search-waste",
    title: tr(language, "Search term waste opportunity", "Search term israf firsati"),
    description: tr(
      language,
      "Identify high-spend search terms with no conversions to exclude",
      "Conversion getirmeyen yuksek spend'li search term'leri dislamak icin tespit edin"
    ),
    impact: "High",
    summary: [
      tr(
        language,
        `${wastefulTerms.length} search terms consumed $${wasteCost.toFixed(0)} with zero conversions.`,
        `${wastefulTerms.length} search term, conversion olmadan $${wasteCost.toFixed(0)} spend tuketti.`
      ),
      tr(
        language,
        `These represent ${wastePct}% of total search spend.`,
        `Bu, toplam search spend'in ${wastePct}% seviyesine denk geliyor.`
      ),
      tr(
        language,
        "Adding negative keywords can immediately improve efficiency.",
        "Negative keyword eklemek verimliligi hizla iyilestirebilir."
      ),
    ],
    evidence: [
      {
        label: tr(language, "Waste terms found", "Bulunan israf term sayisi"),
        value: String(wastefulTerms.length),
      },
      { label: tr(language, "Waste spend", "Israf spend"), value: `$${wasteCost.toFixed(0)}` },
      { label: tr(language, "% of total spend", "Toplam spend payi"), value: `${wastePct}%` },
    ],
  };
}

function computeSpendConcentration(campaigns: any[], language: AppLanguage): Recommendation | null {
  if (!campaigns.length) return null;

  const campaignData = campaigns
    .map((campaign) => {
      const metrics = campaign as any;
      const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
      const convValue = parseFloat(metrics.metrics?.conversions_value || "0");
      const conversions = parseInt(metrics.metrics?.conversions || "0");

      return {
        name: metrics.campaign?.name || "unknown",
        cost,
        roas: calculateRoas(convValue, cost),
        conversions,
      };
    })
    .filter((campaign) => campaign.cost > 0)
    .sort((a, b) => b.cost - a.cost);

  if (campaignData.length < 2) return null;

  const totalCost = campaignData.reduce((sum, campaign) => sum + campaign.cost, 0);
  const avgRoas = campaignData.reduce((sum, campaign) => sum + campaign.roas, 0) / campaignData.length;
  const weakCampaigns = campaignData.filter(
    (campaign) => campaign.roas < avgRoas * 0.7 && campaign.cost > totalCost * 0.1
  );

  if (weakCampaigns.length === 0) return null;

  const weakSpend = weakCampaigns.reduce((sum, campaign) => sum + campaign.cost, 0);
  return {
    id: "rec-concentration",
    title: tr(language, "Spend concentration risk", "Spend yogunlasma riski"),
    description: tr(
      language,
      "Reallocate budget from underperforming campaigns to winners",
      "Butceyi zayif kampanyalardan kazanan kampanyalara yeniden dagitin"
    ),
    impact: "Med",
    summary: [
      tr(
        language,
        `${weakCampaigns.length} campaigns have ROAS below average but high spend share.`,
        `${weakCampaigns.length} kampanya, ortalamanin altinda ROAS'a ragmen yuksek spend payi tasiyor.`
      ),
      tr(
        language,
        `${((weakSpend / totalCost) * 100).toFixed(1)}% of budget is at risk.`,
        `Butcenin ${((weakSpend / totalCost) * 100).toFixed(1)}% kismi risk altinda.`
      ),
      tr(
        language,
        "Consider reallocating to top-performing campaigns.",
        "Butceyi en iyi performans gosteren kampanyalara kaydirmayi degerlendirin."
      ),
    ],
    evidence: [
      { label: tr(language, "Weak campaigns", "Zayif kampanyalar"), value: String(weakCampaigns.length) },
      { label: tr(language, "Account avg ROAS", "Hesap ort. ROAS"), value: avgRoas.toFixed(2) },
      { label: tr(language, "Risk spend", "Riskli spend"), value: `$${weakSpend.toFixed(0)}` },
    ],
  };
}

function computeZeroConversionSpend(campaigns: any[], language: AppLanguage): Recommendation | null {
  const zeroConvCampaigns = campaigns
    .map((campaign) => {
      const metrics = campaign as any;
      const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
      const conversions = parseInt(metrics.metrics?.conversions || "0");
      return {
        name: metrics.campaign?.name || "unknown",
        cost,
        conversions,
      };
    })
    .filter((campaign) => campaign.cost >= 10 && campaign.conversions === 0);

  if (zeroConvCampaigns.length === 0) return null;

  const zeroSpend = zeroConvCampaigns.reduce((sum, campaign) => sum + campaign.cost, 0);
  return {
    id: "rec-zero-conv",
    title: tr(language, "Zero-conversion spend", "Zero-conversion spend"),
    description: tr(
      language,
      "Pause or optimize campaigns with no conversions",
      "Conversion getirmeyen kampanyalari duraklatin veya optimize edin"
    ),
    impact: "High",
    summary: [
      tr(
        language,
        `${zeroConvCampaigns.length} campaigns have spent $${zeroSpend.toFixed(0)} with zero conversions.`,
        `${zeroConvCampaigns.length} kampanya, hic conversion olmadan $${zeroSpend.toFixed(0)} spend yapti.`
      ),
      tr(
        language,
        "These may need creative refresh, audience adjustments, or pausing.",
        "Bu kampanyalar creative yenileme, audience ayari veya duraklatma gerektirebilir."
      ),
      tr(
        language,
        "Review targeting and bids to improve conversion probability.",
        "Conversion olasiligini artirmak icin targeting ve bid ayarlarini gozden gecirin."
      ),
    ],
    evidence: [
      { label: tr(language, "Campaigns at risk", "Riskli kampanyalar"), value: String(zeroConvCampaigns.length) },
      { label: tr(language, "Spend with 0 conv", "0 conv ile spend"), value: `$${zeroSpend.toFixed(0)}` },
      { label: tr(language, "Recommended action", "Onerilen aksiyon"), value: tr(language, "Optimize or pause", "Optimize et veya duraklat") },
    ],
  };
}

function computeAssetGaps(assets: any[], language: AppLanguage): Recommendation | null {
  if (!assets.length) return null;

  const lowAssets = assets.filter((asset) => {
    const label = (asset.asset_group_asset?.performance_label || "").toLowerCase();
    return label.includes("low");
  });

  if (lowAssets.length === 0) return null;

  const lowCost = lowAssets.reduce((sum, asset) => {
    return sum + normalizeCostMicros((asset as any).metrics?.cost_micros || 0);
  }, 0);

  return {
    id: "rec-asset-gaps",
    title: tr(language, "PMax asset performance gaps", "PMax asset performans bosluklari"),
    description: tr(
      language,
      "Deploy new creatives to replace low-performing assets",
      "Dusuk performansli asset'leri degistirmek icin yeni creative'ler yayinlayin"
    ),
    impact: "Med",
    summary: [
      tr(language, `${lowAssets.length} assets marked with low performance.`, `${lowAssets.length} asset dusuk performans etiketi almis durumda.`),
      tr(language, `These assets have spent $${lowCost.toFixed(0)}.`, `Bu asset'ler toplam $${lowCost.toFixed(0)} spend yapti.`),
      tr(
        language,
        "Test new headlines, images, or videos to improve engagement.",
        "Engagement'i iyilestirmek icin yeni headline, image veya video testleri yapin."
      ),
    ],
    evidence: [
      { label: tr(language, "Low-performing assets", "Dusuk performansli asset'ler"), value: String(lowAssets.length) },
      { label: tr(language, "Spend on low assets", "Dusuk asset spend'i"), value: `$${lowCost.toFixed(0)}` },
      { label: tr(language, "Recommended action", "Onerilen aksiyon"), value: tr(language, "Refresh creatives", "Creative'leri yenile") },
    ],
  };
}
