import { NextRequest, NextResponse } from "next/server";
import type { PlanId } from "@/lib/pricing/plans";
import { getCurrentPlan } from "@/lib/shopify/billing/checkSubscription";

export type PlanName = "Starter" | "Growth" | "Pro" | "Scale";

export interface SubscriptionRequirementResult {
  allowed: boolean;
  currentPlan: PlanId;
  requiredPlan: PlanId;
  reason?: "upgrade_required";
  upgradePlan?: PlanName;
}

function normalizePlan(plan: PlanName | PlanId): PlanId {
  const raw = String(plan).toLowerCase();
  if (raw === "starter") return "starter";
  if (raw === "growth") return "growth";
  if (raw === "pro") return "pro";
  return "scale";
}

function planDisplayName(plan: PlanId): PlanName {
  if (plan === "starter") return "Starter";
  if (plan === "growth") return "Growth";
  if (plan === "pro") return "Pro";
  return "Scale";
}

function rank(plan: PlanId): number {
  if (plan === "starter") return 0;
  if (plan === "growth") return 1;
  if (plan === "pro") return 2;
  return 3;
}

export async function requireSubscription(input: {
  shopId: string;
  requiredPlan: PlanName | PlanId;
}): Promise<SubscriptionRequirementResult> {
  const requiredPlan = normalizePlan(input.requiredPlan);
  const currentPlan = await getCurrentPlan(input.shopId);

  if (rank(currentPlan) >= rank(requiredPlan)) {
    return {
      allowed: true,
      currentPlan,
      requiredPlan,
    };
  }

  return {
    allowed: false,
    currentPlan,
    requiredPlan,
    reason: "upgrade_required",
    upgradePlan: planDisplayName(requiredPlan),
  };
}

/**
 * Route guard middleware helper.
 *
 * Usage in route:
 *   const guard = requirePlan("Growth");
 *   const blocked = await guard(request);
 *   if (blocked) return blocked;
 */
export function requirePlan(requiredPlan: PlanName | PlanId) {
  return async function guard(request: NextRequest): Promise<NextResponse | null> {
    const shopId =
      request.nextUrl.searchParams.get("shopId") ??
      request.headers.get("x-shop-id");

    if (!shopId) {
      return NextResponse.json(
        {
          allowed: false,
          error: "missing_shop_id",
          message:
            "shopId is required. Provide ?shopId=... or x-shop-id header.",
        },
        { status: 400 }
      );
    }

    const result = await requireSubscription({
      shopId,
      requiredPlan,
    });

    if (result.allowed) return null;

    return NextResponse.json(
      {
        allowed: false,
        reason: "upgrade_required",
        upgradePlan: result.upgradePlan,
        currentPlan: planDisplayName(result.currentPlan),
        requiredPlan: planDisplayName(result.requiredPlan),
      },
      { status: 402 }
    );
  };
}

