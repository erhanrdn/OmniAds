import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getIntegration } from "@/lib/integrations";
import type { MetaAdSetData } from "@/lib/api/meta";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getMetaPartialReason, getMetaRangePreparationContext } from "@/lib/meta/readiness";
import { getMetaWarehouseAdSets } from "@/lib/meta/serving";
import { getMetaLiveAdSets } from "@/lib/meta/live";
import { getMetaSelectedRangeTruthReadiness } from "@/lib/sync/meta-sync";

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
  status?: "ok" | "not_connected" | "no_campaign_id";
  rows: MetaAdSetData[];
  isPartial?: boolean;
  notReadyReason?: string | null;
}

function getHistoricalVerificationReason(input: {
  verificationState?: string | null;
  fallbackReason: string;
}) {
  if (input.verificationState === "failed") {
    return "Historical Meta verification failed for the selected range. The last published truth remains active while repair is required.";
  }
  if (input.verificationState === "repair_required") {
    return "Historical Meta data requires repair before the selected range can be treated as finalized.";
  }
  return input.fallbackReason;
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
  const connected = integration?.status === "connected";

  const assignment = await getProviderAccountAssignments(businessId!, "meta").catch(() => null);
  const providerAccountIds = assignment?.account_ids ?? [];
  const rangeContext = await getMetaRangePreparationContext({
    businessId: businessId!,
    startDate: resolvedStart,
    endDate: resolvedEnd,
  });
  const historicalTruth =
    !rangeContext.isSelectedCurrentDay && connected
      ? await getMetaSelectedRangeTruthReadiness({
          businessId: businessId!,
          startDate: resolvedStart,
          endDate: resolvedEnd,
        }).catch(() => null)
      : null;
  try {
    if (rangeContext.isSelectedCurrentDay && connected) {
      const liveRows = await getMetaLiveAdSets({
        businessId: businessId!,
        campaignId,
        startDate: resolvedStart,
        endDate: resolvedEnd,
        includePrev,
      });
      if (liveRows.length > 0) {
        return NextResponse.json({
          status: "ok",
          rows: liveRows,
          isPartial: false,
          notReadyReason: null,
        } satisfies MetaAdSetsResponse);
      }
    }

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
        isPartial: historicalTruth ? !historicalTruth.truthReady : false,
        notReadyReason:
          historicalTruth && !historicalTruth.truthReady
            ? getHistoricalVerificationReason({
                verificationState: historicalTruth.verificationState ?? historicalTruth.state ?? null,
                fallbackReason: "Ad set warehouse data is still being prepared for the requested range.",
              })
            : null,
      } satisfies MetaAdSetsResponse);
    }
  } catch (error) {
    console.warn("[meta-adsets] data_fetch_failed", {
      businessId,
      campaignId,
      live: rangeContext.isSelectedCurrentDay,
      message: error instanceof Error ? error.message : String(error),
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
          isPartial: historicalTruth ? !historicalTruth.truthReady : false,
          notReadyReason:
            historicalTruth && !historicalTruth.truthReady
              ? getHistoricalVerificationReason({
                  verificationState: historicalTruth.verificationState ?? historicalTruth.state ?? null,
                  fallbackReason: "Ad set warehouse data is still being prepared for the requested range.",
                })
              : null,
        } satisfies MetaAdSetsResponse);
      }
    } catch {
      // Fall through to partial response below when both live and warehouse fail.
    }
  }
  return NextResponse.json({
    status: "ok",
    rows: [],
    isPartial: historicalTruth ? !historicalTruth.truthReady : true,
    notReadyReason: historicalTruth
      ? historicalTruth.truthReady
        ? null
        : getHistoricalVerificationReason({
            verificationState: historicalTruth.verificationState ?? historicalTruth.state ?? null,
            fallbackReason: getMetaPartialReason({
              isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
              currentDateInTimezone: rangeContext.currentDateInTimezone,
              primaryAccountTimezone: rangeContext.primaryAccountTimezone,
              defaultReason: "Ad set warehouse data is still being prepared for the requested range.",
            }),
          })
      : connected
        ? getMetaPartialReason({
            isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
            currentDateInTimezone: rangeContext.currentDateInTimezone,
            primaryAccountTimezone: rangeContext.primaryAccountTimezone,
            defaultReason: "Ad set warehouse data is still being prepared for the requested range.",
          })
        : "Meta integration is not connected. Historical warehouse data will appear here once available.",
  } satisfies MetaAdSetsResponse);
}
