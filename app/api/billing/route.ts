import { NextRequest, NextResponse } from "next/server";
import { requireAuthedRequest } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoBillingState } from "@/lib/demo-business";
import { getIntegration } from "@/lib/integrations";
import { getCurrentPlan } from "@/lib/shopify/billing/checkSubscription";
import { getManagedPricingUrl } from "@/lib/shopify/billing/managed-pricing";
import { PRICING_PLANS, type PlanId } from "@/lib/pricing/plans";
import { getDb } from "@/lib/db";

/**
 * GET /api/billing?businessId=...
 *
 * Returns the current subscription plan for the authenticated user.
 * Priority: user.plan_override > shopify subscription (by user_id or shop_id) > starter
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuthedRequest(request);
  if ("error" in auth) return auth.error;

  const businessId = request.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json(
      { error: "businessId query parameter is required." },
      { status: 400 },
    );
  }

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoBillingState());
  }

  const sql = getDb();
  const userId = auth.session.user.id;
  const integration = await getIntegration(businessId, "shopify");
  const connectedShopId =
    integration && integration.status === "connected" && integration.provider_account_id
      ? integration.provider_account_id
      : null;
  const connectedStoreName = connectedShopId
    ? integration?.provider_account_name ?? connectedShopId
    : null;
  const connectedManagedPricingUrl = connectedShopId
    ? getManagedPricingUrl(connectedShopId)
    : null;

  // 1. Check user-level plan_override (set by admin)
  const userRows = (await sql`
    SELECT plan_override FROM users WHERE id = ${userId} LIMIT 1
  `) as Array<{ plan_override: string | null }>;
  const userPlanOverride = userRows[0]?.plan_override as PlanId | null;
  if (userPlanOverride) {
    const plan = PRICING_PLANS[userPlanOverride];
    return NextResponse.json({
      connected: Boolean(connectedShopId),
      planId: userPlanOverride,
      planName: plan?.name ?? userPlanOverride,
      monthlyPrice: plan?.monthlyPrice ?? 0,
      status: "active",
      shopId: connectedShopId,
      storeName: connectedStoreName,
      source: "user_override",
      managedPricingUrl: connectedManagedPricingUrl,
    });
  }

  // 2. Check subscription linked to this user
  const subByUser = (await sql`
    SELECT plan_id, status, shop_id FROM shopify_subscriptions
    WHERE user_id = ${userId} AND status = 'active'
    ORDER BY updated_at DESC LIMIT 1
  `) as Array<{ plan_id: string; status: string; shop_id: string }>;
  if (subByUser[0]) {
    const planId = subByUser[0].plan_id as PlanId;
    const plan = PRICING_PLANS[planId];
    const shopId = connectedShopId ?? subByUser[0].shop_id;
    const managedPricingUrl = shopId ? getManagedPricingUrl(shopId) : null;
    return NextResponse.json({
      connected: Boolean(shopId),
      planId,
      planName: plan?.name ?? planId,
      monthlyPrice: plan?.monthlyPrice ?? 0,
      status: subByUser[0].status,
      shopId,
      storeName: connectedStoreName ?? subByUser[0].shop_id,
      source: "user_subscription",
      managedPricingUrl,
    });
  }

  // 3. Fall back to Shopify integration on the workspace
  if (!connectedShopId) {
    return NextResponse.json({
      connected: false,
      planId: "starter",
      planName: "Starter",
      monthlyPrice: 0,
      status: "active",
      shopId: null,
      storeName: null,
      source: "default",
      managedPricingUrl: null,
    });
  }

  const shopId = connectedShopId;
  const planId = await getCurrentPlan(shopId);
  const plan = PRICING_PLANS[planId];
  const managedPricingUrl = getManagedPricingUrl(shopId);

  return NextResponse.json({
    connected: true,
    planId,
    planName: plan.name,
    monthlyPrice: plan.monthlyPrice,
    status: "active",
    shopId,
    storeName: connectedStoreName,
    source: "shopify",
    managedPricingUrl,
  });
}

/**
 * POST /api/billing
 * Body: { businessId: string; planId: PlanId }
 *
 * Redirects the merchant to Shopify's hosted managed pricing page.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuthedRequest(request);
  if ("error" in auth) return auth.error;

  let body: { businessId?: string; planId?: string; interval?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { businessId, planId } = body;
  if (!businessId || !planId) {
    return NextResponse.json(
      { error: "businessId and planId are required." },
      { status: 400 },
    );
  }

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json({
      planId,
      status: "active",
      confirmationUrl: null,
      demo: true,
    });
  }

  const validPlanIds: PlanId[] = ["starter", "growth", "pro", "scale"];
  if (!validPlanIds.includes(planId as PlanId)) {
    return NextResponse.json({ error: "Invalid planId." }, { status: 400 });
  }

  const integration = await getIntegration(businessId, "shopify");
  if (!integration || integration.status !== "connected" || !integration.provider_account_id) {
    return NextResponse.json(
      { error: "No active Shopify integration found for this workspace." },
      { status: 404 },
    );
  }

  const confirmationUrl = getManagedPricingUrl(integration.provider_account_id);
  if (!confirmationUrl) {
    return NextResponse.json(
      { error: "Shopify store handle could not be resolved for managed pricing." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    planId,
    status: "redirect_required",
    confirmationUrl,
    managedPricing: true,
  });
}
