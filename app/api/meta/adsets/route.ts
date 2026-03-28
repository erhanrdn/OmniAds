import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getIntegration } from "@/lib/integrations";
import type { MetaAdSetData } from "@/lib/api/meta";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getMetaPartialReason, getMetaRangePreparationContext } from "@/lib/meta/readiness";
import { getMetaWarehouseAdSets } from "@/lib/meta/serving";

// ── Demo stub ─────────────────────────────────────────────────────────────────

function getDemoAdSets(campaignId: string): MetaAdSetData[] {
  return [
    {
      id: `${campaignId}_adset_1`,
      name: "Prospecting — 18–34 Wide",
      campaignId,
      status: "ACTIVE",
      dailyBudget: 5000,
      lifetimeBudget: null,
      optimizationGoal: "Purchase",
      bidStrategyType: "cost_cap",
      bidStrategyLabel: "Cost Cap",
      manualBidAmount: null,
      previousManualBidAmount: null,
      bidValue: null,
      bidValueFormat: null,
      previousBidValue: null,
      previousBidValueFormat: null,
      previousBidValueCapturedAt: null,
      previousDailyBudget: null,
      previousLifetimeBudget: null,
      previousBudgetCapturedAt: null,
      isBudgetMixed: false,
      isConfigMixed: false,
      isOptimizationGoalMixed: false,
      isBidStrategyMixed: false,
      isBidValueMixed: false,
      spend: 1240.5,
      purchases: 62,
      revenue: 5580.0,
      roas: 4.5,
      cpa: 20.01,
      ctr: 2.14,
      cpm: 12.3,
      impressions: 100854,
      clicks: 2158,
    },
    {
      id: `${campaignId}_adset_2`,
      name: "Retargeting — 30-day visitors",
      campaignId,
      status: "ACTIVE",
      dailyBudget: 2500,
      lifetimeBudget: null,
      optimizationGoal: "Add To Cart",
      bidStrategyType: "bid_cap",
      bidStrategyLabel: "Bid Cap",
      manualBidAmount: 2200,
      previousManualBidAmount: 1800,
      bidValue: 2200,
      bidValueFormat: "currency",
      previousBidValue: 1800,
      previousBidValueFormat: "currency",
      previousBidValueCapturedAt: null,
      previousDailyBudget: 2000,
      previousLifetimeBudget: null,
      previousBudgetCapturedAt: null,
      isBudgetMixed: false,
      isConfigMixed: false,
      isOptimizationGoalMixed: false,
      isBidStrategyMixed: false,
      isBidValueMixed: false,
      spend: 620.25,
      purchases: 48,
      revenue: 3840.0,
      roas: 6.19,
      cpa: 12.92,
      ctr: 3.45,
      cpm: 9.8,
      impressions: 63291,
      clicks: 2183,
    },
  ];
}

// ── Route ─────────────────────────────────────────────────────────────────────

export interface MetaAdSetsResponse {
  status?: "ok" | "no_credentials" | "no_campaign_id";
  rows: MetaAdSetData[];
  isPartial?: boolean;
  notReadyReason?: string | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const campaignId = searchParams.get("campaignId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const includePrev = searchParams.get("includePrev") === "1";

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  if (!campaignId) {
    return NextResponse.json(
      { error: "missing_campaign_id", message: "campaignId is required." },
      { status: 400 }
    );
  }

  if (await isDemoBusiness(businessId!)) {
    return NextResponse.json({
      status: "ok",
      rows: getDemoAdSets(campaignId),
      isPartial: false,
      notReadyReason: null,
    } satisfies MetaAdSetsResponse);
  }

  const resolvedStart =
    startDate ?? new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const resolvedEnd =
    endDate ?? new Date().toISOString().slice(0, 10);

  const integration = await getIntegration(businessId!, "meta").catch(() => null);
  if (!integration?.access_token) {
    return NextResponse.json({
      status: "no_credentials",
      rows: [],
      isPartial: false,
      notReadyReason: "Meta access token is missing for this workspace.",
    } satisfies MetaAdSetsResponse);
  }

  const assignment = await getProviderAccountAssignments(businessId!, "meta").catch(() => null);
  const providerAccountIds = assignment?.account_ids ?? [];
  const rangeContext = await getMetaRangePreparationContext({
    businessId: businessId!,
    startDate: resolvedStart,
    endDate: resolvedEnd,
  });
  try {
    const warehouseRows = await getMetaWarehouseAdSets({
      businessId: businessId!,
      startDate: resolvedStart,
      endDate: resolvedEnd,
      campaignId,
      providerAccountIds,
      includePrev,
    });
    if (warehouseRows.length > 0) {
      return NextResponse.json({
        status: "ok",
        rows: warehouseRows,
        isPartial: false,
        notReadyReason: null,
      } satisfies MetaAdSetsResponse);
    }
  } catch (error) {
    console.warn("[meta-adsets] warehouse_read_failed", {
      businessId,
      campaignId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return NextResponse.json({
    status: "ok",
    rows: [],
    isPartial: true,
    notReadyReason: getMetaPartialReason({
      isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
      currentDateInTimezone: rangeContext.currentDateInTimezone,
      primaryAccountTimezone: rangeContext.primaryAccountTimezone,
      defaultReason: "Ad set warehouse data is still being prepared for the requested range.",
    }),
  } satisfies MetaAdSetsResponse);
}
