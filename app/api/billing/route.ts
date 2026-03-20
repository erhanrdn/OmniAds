import { NextRequest, NextResponse } from "next/server";
import { requireAuthedRequest } from "@/lib/access";
import { getIntegration } from "@/lib/integrations";
import { getCurrentPlan } from "@/lib/shopify/billing/checkSubscription";
import { createSubscription } from "@/lib/shopify/billing/createSubscription";
import { PRICING_PLANS, type PlanId } from "@/lib/pricing/plans";

/**
 * GET /api/billing?businessId=...
 *
 * Returns the current subscription plan for the Shopify integration linked to
 * the given workspace. If no Shopify integration is connected, returns a
 * starter plan record with no store attached.
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

  const integration = await getIntegration(businessId, "shopify");

  if (!integration || integration.status !== "connected" || !integration.provider_account_id) {
    return NextResponse.json({
      connected: false,
      planId: "starter",
      planName: "Starter",
      monthlyPrice: 0,
      status: "active",
      shopId: null,
      storeName: null,
    });
  }

  const shopId = integration.provider_account_id;
  const planId = await getCurrentPlan(shopId);
  const plan = PRICING_PLANS[planId];

  return NextResponse.json({
    connected: true,
    planId,
    planName: plan.name,
    monthlyPrice: plan.monthlyPrice,
    status: "active",
    shopId,
    storeName: integration.provider_account_name ?? shopId,
  });
}

/**
 * POST /api/billing
 * Body: { businessId: string; planId: PlanId }
 *
 * Initiates a plan change. For the Starter (free) plan this is instant.
 * For paid plans, returns a Shopify confirmationUrl to redirect the user to.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuthedRequest(request);
  if ("error" in auth) return auth.error;

  let body: { businessId?: string; planId?: string };
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

  const validPlanIds: PlanId[] = ["starter", "growth", "pro", "scale"];
  if (!validPlanIds.includes(planId as PlanId)) {
    return NextResponse.json({ error: "Invalid planId." }, { status: 400 });
  }

  const integration = await getIntegration(businessId, "shopify");
  if (!integration || integration.status !== "connected" || !integration.provider_account_id || !integration.access_token) {
    return NextResponse.json(
      { error: "No active Shopify integration found for this workspace." },
      { status: 404 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const returnUrl = `${baseUrl}/settings?billing=updated`;

  try {
    const result = await createSubscription({
      shopId: integration.provider_account_id,
      accessToken: integration.access_token,
      planId: planId as PlanId,
      returnUrl,
    });

    return NextResponse.json({
      planId: result.planId,
      status: result.status,
      confirmationUrl: result.confirmationUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Subscription update failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
