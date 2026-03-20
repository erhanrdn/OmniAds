import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { validateDiscountCode } from "@/lib/discount-codes";
import { PRICING_PLANS, type PlanId } from "@/lib/pricing/plans";

// Public endpoint — any logged-in user can validate a code before upgrading
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "auth_error", message: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const code = body?.code?.trim();
  const planId = body?.planId as PlanId | undefined;

  if (!code || !planId) {
    return NextResponse.json(
      { error: "invalid_payload", message: "code ve planId zorunludur." },
      { status: 400 }
    );
  }

  const plan = PRICING_PLANS[planId];
  if (!plan) {
    return NextResponse.json(
      { error: "invalid_payload", message: "Geçersiz plan." },
      { status: 400 }
    );
  }

  const result = await validateDiscountCode(code, planId, plan.monthlyPrice);

  if (!result.valid) {
    return NextResponse.json({ valid: false, reason: result.reason });
  }

  return NextResponse.json({
    valid: true,
    codeId: result.code.id,
    type: result.code.type,
    value: result.code.value,
    amountOff: result.amountOff,
    discountedPrice: result.discountedPrice,
  });
}
