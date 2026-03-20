import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listDiscountCodes, createDiscountCode } from "@/lib/discount-codes";
import type { PlanId } from "@/lib/pricing/plans";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const codes = await listDiscountCodes();
    return NextResponse.json({ codes });
  } catch (err) {
    console.error("[admin/discounts GET]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => null);
    if (!body?.code || !body?.type || body?.value == null) {
      return NextResponse.json(
        { error: "invalid_payload", message: "code, type ve value zorunludur." },
        { status: 400 }
      );
    }

    if (!["percent", "fixed"].includes(body.type)) {
      return NextResponse.json(
        { error: "invalid_payload", message: "type 'percent' veya 'fixed' olmalıdır." },
        { status: 400 }
      );
    }

    const value = Number(body.value);
    if (isNaN(value) || value <= 0) {
      return NextResponse.json(
        { error: "invalid_payload", message: "value pozitif bir sayı olmalıdır." },
        { status: 400 }
      );
    }

    if (body.type === "percent" && value > 100) {
      return NextResponse.json(
        { error: "invalid_payload", message: "Yüzde değeri 100'ü geçemez." },
        { status: 400 }
      );
    }

    const code = await createDiscountCode({
      code: body.code,
      description: body.description,
      type: body.type,
      value,
      maxUses: body.maxUses ? Number(body.maxUses) : undefined,
      appliesTo: (body.appliesTo as PlanId[]) ?? [],
      validFrom: body.validFrom || undefined,
      validUntil: body.validUntil || undefined,
      createdBy: auth.session!.user.id,
    });

    return NextResponse.json({ code }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "23505") {
      return NextResponse.json({ error: "conflict", message: "Bu kod zaten mevcut." }, { status: 409 });
    }
    console.error("[admin/discounts POST]", err);
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
  }
}
