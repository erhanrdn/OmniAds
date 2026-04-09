import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { getDemoMetaCampaigns } from "@/lib/demo-business";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getMetaPartialReason, getMetaRangePreparationContext } from "@/lib/meta/readiness";
import { getMetaWarehouseCampaignTable } from "@/lib/meta/serving";
import { getMetaLiveCampaignRows } from "@/lib/meta/live";
import { getMetaSelectedRangeTruthReadiness } from "@/lib/sync/meta-sync";

export interface MetaCampaignRow {
  id: string;
  accountId: string;
  name: string;
  status: string;
  objective?: string | null;
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

export interface MetaCampaignsResponse {
  status?: "ok" | "no_accounts_assigned" | "account_not_assigned" | "not_connected";
  rows: MetaCampaignRow[];
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

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function nDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function fetchAssignedAccountIds(businessId: string): Promise<string[]> {
  try {
    const readiness = await getDbSchemaReadiness({
      tables: ["provider_account_assignments"],
    });
    if (!readiness.ready) {
      return [];
    }
    const row = await getProviderAccountAssignments(businessId, "meta");
    return row?.account_ids ?? [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const requestedAccountId = searchParams.get("accountId");
  const includePrev = searchParams.get("includePrev") === "1";

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
    return NextResponse.json({
      status: "ok",
      rows: getDemoMetaCampaigns().rows as MetaCampaignRow[],
      isPartial: false,
      notReadyReason: null,
    } satisfies MetaCampaignsResponse);
  }

  const resolvedStart = startDate ?? toISODate(nDaysAgo(29));
  const resolvedEnd = endDate ?? toISODate(new Date());
  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
  if (assignedAccountIds.length === 0) {
    return NextResponse.json({
      status: "no_accounts_assigned",
      rows: [],
      isPartial: false,
      notReadyReason: "No Meta ad account is assigned to this workspace.",
    } satisfies MetaCampaignsResponse);
  }

  const targetAccountIds =
    requestedAccountId && requestedAccountId !== "all"
      ? assignedAccountIds.filter((accountId) => accountId === requestedAccountId)
      : assignedAccountIds;
  if (targetAccountIds.length === 0) {
    return NextResponse.json({
      status: "account_not_assigned",
      rows: [],
      isPartial: false,
      notReadyReason: "The requested Meta ad account is not assigned to this workspace.",
    } satisfies MetaCampaignsResponse);
  }

  const integration = await getIntegration(businessId, "meta").catch(() => null);
  const connected = integration?.status === "connected";
  const rangeContext = await getMetaRangePreparationContext({
    businessId,
    startDate: resolvedStart,
    endDate: resolvedEnd,
  });
  const historicalTruth =
    !rangeContext.isSelectedCurrentDay && connected
      ? await getMetaSelectedRangeTruthReadiness({
          businessId,
          startDate: resolvedStart,
          endDate: resolvedEnd,
        }).catch(() => null)
      : null;

  let rows: MetaCampaignRow[] = [];
  try {
    if (rangeContext.isSelectedCurrentDay && connected) {
      rows = await getMetaLiveCampaignRows({
        businessId,
        startDate: resolvedStart,
        endDate: resolvedEnd,
        providerAccountIds: targetAccountIds,
        includePrev,
      });
      if (rows.length > 0) {
        return NextResponse.json({
          status: "ok",
          rows,
          isPartial: historicalTruth ? !historicalTruth.truthReady : false,
          notReadyReason:
            historicalTruth && !historicalTruth.truthReady
              ? getHistoricalVerificationReason({
                  verificationState: historicalTruth.verificationState ?? historicalTruth.state ?? null,
                  fallbackReason: "Campaign warehouse data is still being prepared for the requested range.",
                })
              : null,
        } satisfies MetaCampaignsResponse);
      }
    }

    rows = (await getMetaWarehouseCampaignTable({
      businessId,
      startDate: resolvedStart,
      endDate: resolvedEnd,
      providerAccountIds: targetAccountIds,
      includePrev,
    })) as MetaCampaignRow[];
  } catch (error) {
    console.warn("[meta-campaigns] data_fetch_failed", {
      businessId,
      live: rangeContext.isSelectedCurrentDay,
      message: error instanceof Error ? error.message : String(error),
    });
    try {
      rows = (await getMetaWarehouseCampaignTable({
        businessId,
        startDate: resolvedStart,
        endDate: resolvedEnd,
        providerAccountIds: targetAccountIds,
        includePrev,
      })) as MetaCampaignRow[];
    } catch {
      rows = [];
    }
  }

  return NextResponse.json({
    status: "ok",
    rows,
    isPartial: historicalTruth ? !historicalTruth.truthReady : rows.length === 0,
    notReadyReason:
      historicalTruth
        ? historicalTruth.truthReady
          ? null
          : getHistoricalVerificationReason({
              verificationState: historicalTruth.verificationState ?? historicalTruth.state ?? null,
              fallbackReason: getMetaPartialReason({
                isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
                currentDateInTimezone: rangeContext.currentDateInTimezone,
                primaryAccountTimezone: rangeContext.primaryAccountTimezone,
                defaultReason: "Campaign warehouse data is still being prepared for the requested range.",
              }),
            })
        : rows.length === 0
        ? connected
          ? getMetaPartialReason({
              isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
              currentDateInTimezone: rangeContext.currentDateInTimezone,
              primaryAccountTimezone: rangeContext.primaryAccountTimezone,
              defaultReason: "Campaign warehouse data is still being prepared for the requested range.",
            })
          : "Meta integration is not connected. Historical warehouse data will appear here once available."
        : null,
  } satisfies MetaCampaignsResponse);
}
