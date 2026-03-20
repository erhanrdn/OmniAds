import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getDiscountCode, updateDiscountCode, deleteDiscountCode, getRedemptionsForCode } from "@/lib/discount-codes";
import { logAdminAction } from "@/lib/admin-logger";
import type { PlanId } from "@/lib/pricing/plans";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ codeId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { codeId } = await params;
    const [code, redemptions] = await Promise.all([
      getDiscountCode(codeId),
      getRedemptionsForCode(codeId),
    ]);

    if (!code) {
      return NextResponse.json({ error: "not_found", message: "Kod bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({ code, redemptions });
  } catch (err) {
    console.error("[admin/discounts/[codeId] GET]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ codeId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { codeId } = await params;
    const body = await request.json().catch(() => null);

    const updated = await updateDiscountCode(codeId, {
      description: body?.description,
      maxUses: body?.maxUses !== undefined ? (body.maxUses === null ? null : Number(body.maxUses)) : undefined,
      appliesTo: body?.appliesTo as PlanId[] | undefined,
      validFrom: body?.validFrom,
      validUntil: body?.validUntil,
      isActive: body?.isActive,
    });

    if (!updated) {
      return NextResponse.json({ error: "not_found", message: "Kod bulunamadı." }, { status: 404 });
    }

    await logAdminAction({
      adminId: auth.session!.user.id,
      action: "discount.toggle",
      targetType: "discount",
      targetId: codeId,
      meta: { isActive: body?.isActive },
    });

    return NextResponse.json({ code: updated });
  } catch (err) {
    console.error("[admin/discounts/[codeId] PATCH]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ codeId: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { codeId } = await params;
    const code = await getDiscountCode(codeId);

    await deleteDiscountCode(codeId);

    await logAdminAction({
      adminId: auth.session!.user.id,
      action: "discount.delete",
      targetType: "discount",
      targetId: codeId,
      meta: { code: code?.code },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/discounts/[codeId] DELETE]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}
