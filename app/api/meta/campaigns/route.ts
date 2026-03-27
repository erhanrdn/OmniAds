import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoMetaCampaigns } from "@/lib/demo-business";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { runMigrations } from "@/lib/migrations";
import { getMetaWarehouseCampaignTable } from "@/lib/meta/serving";
import { ensureMetaWarehouseRangeFilled } from "@/lib/sync/meta-sync";

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
    const row = await getProviderAccountAssignments(businessId, "meta");
    return row?.account_ids ?? [];
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("does not exist") || message.includes("relation")) {
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
    return NextResponse.json(getDemoMetaCampaigns());
  }

  const resolvedStart = startDate ?? toISODate(nDaysAgo(29));
  const resolvedEnd = endDate ?? toISODate(new Date());
  const assignedAccountIds = await fetchAssignedAccountIds(businessId);
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

  const integration = await getIntegration(businessId, "meta").catch(() => null);
  if (!integration?.access_token) {
    return NextResponse.json({ status: "no_access_token", rows: [] });
  }

  await ensureMetaWarehouseRangeFilled({
    businessId,
    startDate: resolvedStart,
    endDate: resolvedEnd,
  }).catch((error) => {
    console.warn("[meta-campaigns] ensure_range_failed", {
      businessId,
      startDate: resolvedStart,
      endDate: resolvedEnd,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  let rows: MetaCampaignRow[] = [];
  try {
    rows = (await getMetaWarehouseCampaignTable({
      businessId,
      startDate: resolvedStart,
      endDate: resolvedEnd,
      providerAccountIds: targetAccountIds,
      includePrev,
    })) as MetaCampaignRow[];
  } catch (error) {
    console.warn("[meta-campaigns] warehouse_read_failed", {
      businessId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return NextResponse.json({ status: "ok", rows });
}
